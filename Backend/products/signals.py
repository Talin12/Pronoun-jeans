"""
Ask Vercel to rebuild when the catalogue changes.

The storefront is prerendered at build time (Frontend/scripts/prerender.mjs),
so a product added or renamed here has no static HTML until the next deploy.
Until then a crawler following that URL gets the bare SPA shell. These hooks
close that window: save a product, the site rebuilds, the page exists.

Nothing happens unless VERCEL_DEPLOY_HOOK is set, so local development, tests
and any environment that has not opted in stay entirely offline.
"""

import logging
import threading

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)

# One deploy per window, however many rows changed. A bulk import or a
# multi-select delete in the admin fires a signal per row; without this, a
# 200-product import would queue 200 builds.
DEBOUNCE_SECONDS = 10 * 60
CACHE_KEY = 'vercel-deploy-hook:last-fired'
REQUEST_TIMEOUT_SECONDS = 10


def _hook_url():
    return getattr(settings, 'VERCEL_DEPLOY_HOOK', None)


def _post_hook(url):
    """Fire the hook. Runs on a worker thread; must never raise into it."""
    try:
        import requests

        response = requests.post(url, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        logger.info('Vercel deploy hook fired (HTTP %s)', response.status_code)
    except Exception:
        # A failed rebuild request must never take a save down with it — the
        # row is already committed, and the next change will try again.
        logger.exception('Vercel deploy hook failed')
        cache.delete(CACHE_KEY)


def request_redeploy(reason):
    """
    Request a rebuild, at most once per DEBOUNCE_SECONDS.

    The guard is cache.add(), which is atomic: whichever caller wins the race
    is the only one that fires. Note that the default LocMemCache is per
    process, so with several Render workers the ceiling is one deploy per
    worker per window rather than one overall — still bounded, and still small.
    Pointing CACHES at Redis would make it exact.
    """
    url = _hook_url()
    if not url:
        return

    if not cache.add(CACHE_KEY, True, DEBOUNCE_SECONDS):
        logger.debug('Deploy hook skipped (debounced): %s', reason)
        return

    logger.info('Requesting Vercel rebuild: %s', reason)
    # After commit, so a rolled-back transaction cannot trigger a build for a
    # change that never happened. Off-thread, so the admin request does not
    # wait on Vercel.
    transaction.on_commit(
        lambda: threading.Thread(target=_post_hook, args=(url,), daemon=True).start()
    )


@receiver(post_save, sender='products.Product')
@receiver(post_delete, sender='products.Product')
@receiver(post_save, sender='products.Category')
@receiver(post_delete, sender='products.Category')
def redeploy_on_catalogue_change(sender, instance, **kwargs):
    request_redeploy(f'{sender.__name__} {instance.pk} changed')


# ── IndexNow ─────────────────────────────────────────────────────────────────
#
# Submit every URL a catalogue change touches: the page itself, its old URL if
# the slug was renamed (so the dead one is dropped), and the listing pages it
# appears on. See products/indexnow.py.

from django.db.models.signals import pre_save  # noqa: E402

from products import indexnow  # noqa: E402


@receiver(pre_save, sender='products.Product')
@receiver(pre_save, sender='products.Category')
def remember_old_slug(sender, instance, **kwargs):
    """Stash the slug as stored, so a rename can also announce the old URL."""
    if not indexnow.enabled() or not instance.pk:
        instance._indexnow_old_slug = None
        return
    instance._indexnow_old_slug = (
        sender.objects.filter(pk=instance.pk).values_list('slug', flat=True).first()
    )


def _product_urls(instance):
    urls = [indexnow.product_url(instance.slug), indexnow.absolute('/catalog')]
    old = getattr(instance, '_indexnow_old_slug', None)
    if old and old != instance.slug:
        urls.append(indexnow.product_url(old))
    if instance.category_id:
        try:
            urls.append(indexnow.category_url(instance.category.slug))
        except Exception:  # the category itself is being deleted in this transaction
            pass
    return urls


def _category_urls(instance):
    urls = [indexnow.category_url(instance.slug), indexnow.absolute('/catalog'), indexnow.absolute('/')]
    old = getattr(instance, '_indexnow_old_slug', None)
    if old and old != instance.slug:
        urls.append(indexnow.category_url(old))
    return urls


@receiver(post_save, sender='products.Product')
@receiver(post_delete, sender='products.Product')
def indexnow_product_changed(sender, instance, **kwargs):
    if indexnow.enabled():
        indexnow.submit(_product_urls(instance))


@receiver(post_save, sender='products.Category')
@receiver(post_delete, sender='products.Category')
def indexnow_category_changed(sender, instance, **kwargs):
    if indexnow.enabled():
        indexnow.submit(_category_urls(instance))


# ── Google Merchant Center ───────────────────────────────────────────────────
#
# Keep the listing in step with the row it was built from, so a price edit or
# a stock change here reaches Google without anyone opening Merchant Center.
# See products/merchant.py.

from products import merchant  # noqa: E402


def _touches_merchant(product):
    """
    Whether this product has any business talking to Merchant Center.

    Listed products obviously do. So do products that *were* listed — they
    carry an offer ID, and their listing has to be withdrawn rather than
    left behind. Everything else, which is most of the catalogue, is skipped
    so an ordinary save stays an ordinary save.
    """
    return bool(product.list_on_merchant or product.merchant_offer_id)


@receiver(post_save, sender='products.Product')
def merchant_product_saved(sender, instance, **kwargs):
    if merchant.enabled() and _touches_merchant(instance):
        merchant.sync_async(instance, reason=f'Product {instance.pk} saved')


@receiver(post_delete, sender='products.Product')
def merchant_product_deleted(sender, instance, **kwargs):
    """A deleted product must not keep advertising itself on Google."""
    if merchant.enabled() and instance.merchant_offer_id:
        # Not sync_async: the row is gone, so there is nothing to record the
        # outcome on, and sync() would try to write to a deleted pk.
        transaction.on_commit(
            lambda: threading.Thread(
                target=merchant.remove, args=(instance,), daemon=True
            ).start()
        )


@receiver(post_save, sender='products.ProductVariation')
@receiver(post_delete, sender='products.ProductVariation')
def merchant_variation_changed(sender, instance, **kwargs):
    """
    A variation carries the price, the colour, the size and the stock level,
    so a change to one changes the listing even though the product row itself
    never moved.
    """
    if not merchant.enabled():
        return
    try:
        product = instance.product
    except Exception:
        # The parent product is being deleted in this same transaction and
        # the cascade reached the variation first; its own post_delete
        # handles the withdrawal.
        return
    if _touches_merchant(product):
        merchant.sync_async(product, reason=f'Variation {instance.pk} changed')
