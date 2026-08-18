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
