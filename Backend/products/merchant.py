"""
Publish products to Google Merchant Center.

Until now the client entered every product twice: once here, and once by hand
in the Merchant Center UI. The 22 listings that are live today were all typed
in that way ("Added in Merchant Center", source "one by one"), which is why
the catalogue and the listings drift apart the moment a price or a stock level
changes here. This module closes that: flip `Product.list_on_merchant` and the
product is pushed from the same row the storefront reads.

Two things worth knowing before changing anything here.

**This is the Merchant API, not the Content API.** The Content API for Shopping
was sunset on 18 August 2026 and has been returning progressive errors since
1 September. The account still shows a stale "Content API" data source holding
three products from that era; it is dead and this does not use it. The current
surface is merchantapi.googleapis.com, which keys a listing on
(contentLanguage, feedLabel, offerId) and upserts on insert.

**The landing page is the homepage, deliberately.** Every hand-built listing
points at https://www.pronounjeans.com/ rather than the product's own page,
and that is what makes the listings approvable: wholesale prices are gated
behind B2B verification (products.serializers), so a product page carries no
price, and a crawler that found one would see a feed price with nothing to
match it against. Pointing at the homepage means Google never crawls a
contradicting page. It is also against Merchant Center's landing-page rules,
which is a risk the client has accepted to keep the listings as they are.
MERCHANT_LANDING_URL exists so this can be switched to real product URLs
later without touching code.

Nothing happens unless MERCHANT_ACCOUNT_ID, MERCHANT_DATA_SOURCE_ID and
MERCHANT_SERVICE_ACCOUNT_JSON are all set, so local development, tests and
any environment that has not opted in stay entirely offline.
"""

import json
import logging
import threading
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

API_ROOT = 'https://merchantapi.googleapis.com/products/v1'
SCOPE = 'https://www.googleapis.com/auth/content'
REQUEST_TIMEOUT_SECONDS = 30

# Access tokens are good for an hour; refreshing a little early costs one
# extra round trip a day and removes the race against expiry mid-push.
TOKEN_CACHE_KEY = 'merchant-api:access-token'
TOKEN_CACHE_SECONDS = 3000

# Merchant Center stores money in micros: 1,000,000 == one rupee.
MICROS = 1_000_000

# Offer IDs may not contain '/', '%' or '~' without base64url encoding the
# whole resource name. Restricting the alphabet sidesteps that entirely.
OFFER_ID_MAX = 50


# ── Configuration ────────────────────────────────────────────────────────────

def _setting(name, default=''):
    return getattr(settings, name, default)


def enabled():
    """True when this environment is configured to talk to Merchant Center."""
    return bool(
        _setting('MERCHANT_ACCOUNT_ID')
        and _setting('MERCHANT_DATA_SOURCE_ID')
        and _setting('MERCHANT_SERVICE_ACCOUNT_JSON')
    )


def _account_path():
    return f"accounts/{_setting('MERCHANT_ACCOUNT_ID')}"


def _data_source_path():
    return f"{_account_path()}/dataSources/{_setting('MERCHANT_DATA_SOURCE_ID')}"


def _feed_label():
    return _setting('MERCHANT_FEED_LABEL', 'IN')


def _language():
    return _setting('MERCHANT_CONTENT_LANGUAGE', 'en')


def _currency():
    return _setting('MERCHANT_CURRENCY', 'INR')


# ── Auth ─────────────────────────────────────────────────────────────────────

def _access_token():
    """
    A bearer token for the service account, cached between pushes.

    MERCHANT_SERVICE_ACCOUNT_JSON holds either the service-account key JSON
    itself or a path to it, because Render supplies secrets as environment
    strings while a developer is likelier to have the file on disk.
    """
    token = cache.get(TOKEN_CACHE_KEY)
    if token:
        return token

    raw = _setting('MERCHANT_SERVICE_ACCOUNT_JSON').strip()
    if not raw:
        raise RuntimeError('MERCHANT_SERVICE_ACCOUNT_JSON is not set.')

    if raw.startswith('{'):
        info = json.loads(raw)
    else:
        with open(raw, 'r', encoding='utf-8') as handle:
            info = json.load(handle)

    # Imported here rather than at module scope so an environment without
    # google-auth installed can still import products.models.
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account

    credentials = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
    credentials.refresh(Request())

    cache.set(TOKEN_CACHE_KEY, credentials.token, TOKEN_CACHE_SECONDS)
    return credentials.token


def _headers():
    return {
        'Authorization': f'Bearer {_access_token()}',
        'Content-Type': 'application/json',
    }


# ── Payload ──────────────────────────────────────────────────────────────────

def offer_id_for(product):
    """
    The offer ID this product occupies, assigning one on first use.

    Derived from the product code when there is one ("PJ100"), since that is
    what the client recognises in the Merchant Center UI, and from the slug
    otherwise. Persisted on the row immediately: Merchant Center keys the
    listing on this string, so recomputing it after a rename would strand the
    old listing and publish a duplicate alongside it.
    """
    if product.merchant_offer_id:
        return product.merchant_offer_id

    base = (product.code or product.slug or f'product-{product.pk}')
    cleaned = ''.join(c if c.isalnum() or c in '-_' else '-' for c in str(base)).strip('-')
    cleaned = (cleaned or f'product-{product.pk}')[:OFFER_ID_MAX]

    # A code and a slug can collide after cleaning; the pk never does.
    from products.models import Product
    if Product.objects.filter(merchant_offer_id=cleaned).exclude(pk=product.pk).exists():
        suffix = f'-{product.pk}'
        cleaned = cleaned[:OFFER_ID_MAX - len(suffix)] + suffix

    Product.objects.filter(pk=product.pk).update(merchant_offer_id=cleaned)
    product.merchant_offer_id = cleaned
    return cleaned


def _money(amount):
    if amount is None:
        return None
    return {
        'amountMicros': str(int(Decimal(str(amount)) * MICROS)),
        'currencyCode': _currency(),
    }


def _absolute(url):
    """Cloudinary already returns absolute URLs; a local MEDIA_URL does not."""
    if not url:
        return None
    if url.startswith('http://') or url.startswith('https://'):
        return url
    base = _setting('INDEXNOW_SITE_URL', 'https://www.pronounjeans.com').rstrip('/')
    return f"{base}{url if url.startswith('/') else '/' + url}"


def _image_url(field):
    try:
        return _absolute(field.url) if field else None
    except ValueError:
        # FieldFile.url raises when the field has no file associated.
        return None


def _representative_variation(product):
    """
    The variation whose price and attributes represent the product.

    The hand-built listings are one item per product carrying a single colour
    and size, not one item per variant, so this mirrors that. Prefers a
    variation that is actually priced and in stock, because an item published
    as out of stock earns nothing.
    """
    variations = list(product.variations.all())
    if not variations:
        return None

    def rank(v):
        return (
            0 if (v.stock_quantity or 0) > 0 else 1,
            0 if (v.mrp_per_piece or v.mrp) else 1,
            v.pk,
        )

    return sorted(variations, key=rank)[0]


def _prices(variation):
    """
    (price, sale_price) for the listing.

    MRP is the advertised price and the wholesale rate is the sale price,
    which reproduces the ₹1,299-struck-through-to-₹645 shape of the listings
    already live. That pair is the sales pitch, not a markdown: the trade
    buyer pays the wholesale rate and can retail the piece at the MRP, so the
    gap between the two numbers is the margin on offer. Publishing the
    wholesale rate is therefore deliberate -- it is the point of the listing,
    not a leak, so do not "fix" it by hiding it or substituting a consumer
    price.

    MERCHANT_PRICE_BASIS picks whether those come from the per-piece columns
    or the set totals. Per-piece is the default and the correct one: an MRP
    is what a single piece retails at, which is what the live listings show. Either column falls back to the other
    when it is blank, so a product priced only one way still publishes.
    """
    if _setting('MERCHANT_PRICE_BASIS', 'per_piece') == 'set':
        price = variation.mrp or variation.mrp_per_piece
        sale = variation.b2b_price or variation.per_piece_price
    else:
        price = variation.mrp_per_piece or variation.mrp
        sale = variation.per_piece_price or variation.b2b_price

    # Google rejects a sale price that is not below the price. A product
    # whose wholesale rate exceeds its MRP is a data error here, not
    # something to publish as a non-discount.
    if price and sale and Decimal(str(sale)) >= Decimal(str(price)):
        sale = None

    return price, sale


def _attribute_value(product, *names):
    """First value of the first matching attribute row, e.g. Fabric."""
    wanted = {n.lower() for n in names}
    for row in product.grouped_attributes():
        if row['name'].lower() in wanted and row['values']:
            return row['values'][0]
    return None


def _gender(product):
    """
    Derived from the category, which is where this catalogue records it.

    Returning UNISEX rather than guessing keeps a mis-categorised product off
    the wrong search results; MERCHANT_DEFAULT_GENDER overrides the fallback.
    """
    name = ((product.category.name if product.category_id else '') or '').lower()
    if 'women' in name or 'ladies' in name:
        return 'FEMALE'
    if 'men' in name or 'boys' in name:
        return 'MALE'
    return _setting('MERCHANT_DEFAULT_GENDER', 'UNISEX')


def _description(product):
    """Same precedence the structured data uses: real copy beats the meta tag."""
    text = ' '.join(
        part for part in (product.description, product.fabric_details) if part
    ).split()
    joined = ' '.join(text)
    return joined or (product.meta_description or product.name)


# -- Readiness ----------------------------------------------------------------

# Half the catalogue carries this as an MRP. It is a placeholder someone typed
# to get past a required field, not a retail price, and publishing it would
# advertise a struck-through number that was never real.
PLACEHOLDER_MRP = Decimal('5000')

# Short enough that Google has nothing to index and a shopper learns nothing.
MIN_DESCRIPTION = 60


def _check(level, field, label, detail=''):
    return {'level': level, 'field': field, 'label': label, 'detail': detail}


def readiness(product):
    """
    What is still missing before this product makes a good Merchant listing.

    Two kinds of finding, and the difference matters to whoever is looking at
    the panel. A **blocker** means the push cannot even be built -- the same
    conditions build_payload() raises on -- so the toggle will fail outright.
    A **warning** means Google will accept the listing but it will be a poor
    or risky one: a placeholder price, no identifier, out of stock. Warnings
    are not pedantry here; a wrong struck-through price is a Merchant Center
    pricing-policy matter, not a cosmetic one.

    Everything is phrased as the thing still to do, because the person reading
    it is the person who has to go and do it.
    """
    checks = []
    variations = list(product.variations.all())

    if not variations:
        checks.append(_check(
            'blocker', 'variations', 'Add a variation',
            'The price, colour and size all come from a variation. '
            'There are none on this product.',
        ))

    variation = _representative_variation(product)
    price = sale = None
    if variation is not None:
        price, sale = _prices(variation)

        if not price:
            checks.append(_check(
                'blocker', 'mrp', 'Set an MRP',
                'Google needs a price. Fill in the MRP on at least one '
                'variation.',
            ))
        elif Decimal(str(price)) == PLACEHOLDER_MRP:
            checks.append(_check(
                'warning', 'mrp', 'Replace the placeholder MRP',
                f'The MRP is exactly {_rupees(price)}, which is the filler '
                'value used across the catalogue rather than a real retail '
                'price. Publishing it advertises a saving that does not exist.',
            ))

        raw_sale = _raw_wholesale(variation)
        if price and not raw_sale:
            checks.append(_check(
                'warning', 'b2b_price', 'Add the wholesale price',
                'Without it the listing shows a single price and none of the '
                'margin the buyer is being offered.',
            ))
        elif price and raw_sale and Decimal(str(raw_sale)) >= Decimal(str(price)):
            checks.append(_check(
                'warning', 'b2b_price', 'Wholesale price is not below the MRP',
                f'Wholesale {_rupees(raw_sale)} is not under the MRP '
                f'{_rupees(price)}, so the listing publishes at the MRP with '
                'no saving shown. One of the two numbers is wrong.',
            ))

        if _basis() != 'set' and not variation.mrp_per_piece                 and not variation.per_piece_price:
            checks.append(_check(
                'warning', 'per_piece_price', 'Fill in the per-piece prices',
                'Both per-piece columns are blank, so the set total is '
                'published instead. Other products publish a per-piece price, '
                'so this one will look far more expensive beside them.',
            ))

        if not variation.sku:
            checks.append(_check(
                'warning', 'sku', 'Add a SKU',
                'The SKU is sent as the manufacturer part number. Without one '
                'Google is told the product has no identifier, which limits '
                'where it can appear.',
            ))
        if not variation.color:
            checks.append(_check(
                'warning', 'color', 'Set the colour',
                'Colour is a required attribute for apparel in Google '
                'Shopping.',
            ))
        if not variation.size:
            checks.append(_check(
                'warning', 'size', 'Set the size',
                'Size is a required attribute for apparel in Google Shopping.',
            ))

    if variations and sum((v.stock_quantity or 0) for v in variations) <= 0:
        checks.append(_check(
            'warning', 'stock_quantity', 'Add stock',
            'Every variation is at zero, so this publishes as out of stock '
            'and will not be shown to shoppers.',
        ))

    images = [_image_url(product.image)]
    images += [_image_url(g.image) for g in product.gallery_images.all()]
    if not [u for u in images if u]:
        checks.append(_check(
            'blocker', 'image', 'Add an image',
            'Google requires at least one image and will not accept the '
            'product without it.',
        ))

    description = _description(product)
    if len(description) < MIN_DESCRIPTION:
        checks.append(_check(
            'warning', 'description', 'Write a longer description',
            f'{len(description)} characters is too thin for Google to index. '
            'Describe the fabric, fit and what is in the set.',
        ))

    if _gender(product) == 'UNISEX' and _looks_gendered(product):
        checks.append(_check(
            'warning', 'category', 'Check the category',
            "The name reads as men's or women's wear but the category does "
            'not say so, so the listing publishes as unisex and misses those '
            'searches.',
        ))

    blockers = [c for c in checks if c['level'] == 'blocker']
    return {
        'ready': not blockers,
        'checks': checks,
        'blockers': len(blockers),
        'warnings': len(checks) - len(blockers),
    }


def _basis():
    return _setting('MERCHANT_PRICE_BASIS', 'per_piece')


def _raw_wholesale(variation):
    """The wholesale figure before _prices() drops it for being too high."""
    if _basis() == 'set':
        return variation.b2b_price or variation.per_piece_price
    return variation.per_piece_price or variation.b2b_price


def _rupees(amount):
    return f'Rs {Decimal(str(amount)):,.0f}'


def _looks_gendered(product):
    name = (product.name or '').lower()
    return any(word in name for word in
               ("men's", 'mens ', 'men ', "women's", 'womens ', 'ladies', 'boys'))


def build_payload(product):
    """The ProductInput body for this product, or None if it cannot be listed."""
    variation = _representative_variation(product)
    if variation is None:
        raise ValueError('Product has no variations, so it has no price to publish.')

    price, sale_price = _prices(variation)
    if not price:
        raise ValueError(
            'Product has no MRP. Set an MRP on at least one variation before '
            'listing it on Google Merchant.'
        )

    in_stock = sum((v.stock_quantity or 0) for v in product.variations.all()) > 0

    images = [_image_url(product.image)]
    images += [_image_url(g.image) for g in product.gallery_images.all()]
    images = [u for u in images if u]
    if not images:
        raise ValueError('Product has no images. Google requires at least one.')

    attributes = {
        'title': product.name[:150],
        'description': _description(product)[:5000],
        'link': _setting('MERCHANT_LANDING_URL', 'https://www.pronounjeans.com/'),
        'imageLink': images[0],
        'availability': 'IN_STOCK' if in_stock else 'OUT_OF_STOCK',
        'condition': 'NEW',
        'price': _money(price),
        'brand': _setting('MERCHANT_BRAND', 'PRO-NOUN'),
        'gender': _gender(product),
        'ageGroup': _setting('MERCHANT_DEFAULT_AGE_GROUP', 'ADULT'),
    }

    # Google allows at most 10 additional images.
    if len(images) > 1:
        attributes['additionalImageLinks'] = images[1:11]

    if sale_price:
        attributes['salePrice'] = _money(sale_price)

    if variation.color:
        attributes['color'] = variation.color
    if variation.size:
        attributes['size'] = variation.size

    material = _attribute_value(product, 'Fabric', 'Material')
    if material:
        attributes['material'] = material
    pattern = _attribute_value(product, 'Pattern')
    if pattern:
        attributes['pattern'] = pattern

    # The SKU is a real manufacturer part number and, paired with the brand,
    # satisfies Google's identifier requirement without inventing a GTIN.
    if variation.sku:
        attributes['mpn'] = variation.sku
    else:
        attributes['identifierExists'] = False

    return {
        'offerId': offer_id_for(product),
        'contentLanguage': _language(),
        'feedLabel': _feed_label(),
        'productAttributes': attributes,
    }


# ── Transport ────────────────────────────────────────────────────────────────

def _resource_name(offer_id):
    return f'{_account_path()}/productInputs/{_language()}~{_feed_label()}~{offer_id}'


def _error_text(response):
    """A message an admin can act on, not a wall of JSON."""
    try:
        payload = response.json()
        message = payload.get('error', {}).get('message')
        if message:
            return f'HTTP {response.status_code}: {message}'
    except Exception:
        pass
    return f'HTTP {response.status_code}: {response.text[:500]}'


def push(product):
    """
    Upsert this product in Merchant Center. Returns '' on success, else why not.

    Insert is an upsert: an existing input with the same language, feed label
    and offer ID is replaced, so this is safe to call repeatedly.
    """
    import requests

    payload = build_payload(product)
    response = requests.post(
        f'{API_ROOT}/{_account_path()}/productInputs:insert',
        params={'dataSource': _data_source_path()},
        headers=_headers(),
        json=payload,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        return _error_text(response)
    return ''


def remove(product):
    """
    Delete this product's listing. Returns '' on success, else why not.

    A listing that was never pushed has no offer ID and nothing to delete,
    and a 404 means Google agrees it is gone — neither is a failure.
    """
    import requests

    if not product.merchant_offer_id:
        return ''

    response = requests.delete(
        f'{API_ROOT}/{_resource_name(product.merchant_offer_id)}',
        params={'dataSource': _data_source_path()},
        headers=_headers(),
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code == 404:
        return ''
    if response.status_code >= 400:
        return _error_text(response)
    return ''


# ── Sync ─────────────────────────────────────────────────────────────────────

def _record(product, error):
    """
    Write the outcome back without re-entering the save path.

    queryset.update() rather than instance.save(), so recording a sync result
    cannot fire the post_save that asked for the sync in the first place.
    """
    from products.models import Product

    Product.objects.filter(pk=product.pk).update(
        merchant_sync_error=error,
        merchant_synced_at=None if error else timezone.now(),
    )
    product.merchant_sync_error = error
    product.merchant_synced_at = None if error else timezone.now()


def sync(product):
    """
    Bring Merchant Center in line with this product. Returns '' or the error.

    Publishes when the toggle is on and the product is active; withdraws it
    otherwise. An inactive product staying listed would send shoppers to a
    garment that is no longer sold.
    """
    if not enabled():
        return ''

    try:
        should_list = product.list_on_merchant and product.is_active
        error = push(product) if should_list else remove(product)
    except ValueError as exc:
        # A product that cannot be described well enough to list — no price,
        # no images. The admin can fix this; it is not a transport failure.
        error = str(exc)
    except Exception as exc:
        logger.exception('Merchant Center sync failed for product %s', product.pk)
        error = f'{type(exc).__name__}: {exc}'

    _record(product, error)
    return error


def sync_async(product, reason=''):
    """
    Sync after the current transaction commits, off the request thread.

    The admin saving a product should not wait on Google, and a rolled-back
    save must not publish anything. Failures land in merchant_sync_error,
    which the product editor shows.
    """
    if not enabled():
        return

    logger.info('Merchant Center sync queued for product %s (%s)', product.pk, reason)
    transaction.on_commit(
        lambda: threading.Thread(target=sync, args=(product,), daemon=True).start()
    )
