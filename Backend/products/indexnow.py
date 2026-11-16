"""
IndexNow: tell Bing (and every other IndexNow engine) when catalogue URLs change.

Without this, a new or edited product waits for Bingbot to wander past —
days, sometimes weeks. With it, the URL is submitted the moment the change
is committed. Google does not use IndexNow; for Google the live sitemap
(Frontend/api/sitemap.js) is still what matters.

Protocol: https://www.indexnow.org/documentation
  POST https://api.indexnow.org/indexnow
  {"host": ..., "key": ..., "keyLocation": ..., "urlList": [...]}
The key must be served as plain text at keyLocation — it is, from
Frontend/public/<key>.txt.

Deleted and hidden pages are submitted too: that is how IndexNow learns a URL
now 404s and should drop out of the index.
"""

import logging
import threading
from urllib.parse import urlparse

from django.conf import settings
from django.core.cache import cache
from django.db import transaction

logger = logging.getLogger(__name__)

ENDPOINT = 'https://api.indexnow.org/indexnow'
REQUEST_TIMEOUT_SECONDS = 10
# The protocol allows 10,000 URLs per request.
MAX_URLS_PER_REQUEST = 10_000
# A bulk edit fires one signal per row, often several per product. Each URL is
# submitted at most once per window so one admin action is one ping per page,
# not a burst that looks like spam to the search engines.
DEDUPE_SECONDS = 60


def enabled():
    return bool(getattr(settings, 'INDEXNOW_ENABLED', False) and getattr(settings, 'INDEXNOW_KEY', ''))


def site_url():
    return getattr(settings, 'INDEXNOW_SITE_URL', 'https://www.pronounjeans.com').rstrip('/')


def absolute(path):
    return f'{site_url()}{path}'


def product_url(slug):
    return absolute(f'/product/{slug}')


def category_url(slug):
    return absolute(f'/catalog/{slug}')


def payload(urls):
    key = settings.INDEXNOW_KEY
    return {
        'host': urlparse(site_url()).netloc,
        'key': key,
        'keyLocation': absolute(f'/{key}.txt'),
        'urlList': list(urls),
    }


def submit_now(urls):
    """
    POST the URLs synchronously. Returns the HTTP status (200 and 202 both mean
    accepted). Raises on network errors — callers on a request path should use
    submit() instead, which never raises.
    """
    import requests

    urls = list(dict.fromkeys(u for u in urls if u))
    status = None
    for start in range(0, len(urls), MAX_URLS_PER_REQUEST):
        batch = urls[start:start + MAX_URLS_PER_REQUEST]
        response = requests.post(
            ENDPOINT,
            json=payload(batch),
            headers={'Content-Type': 'application/json; charset=utf-8'},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        status = response.status_code
        # 200 OK / 202 Accepted are success. 403 = key file not found or does
        # not match; 422 = URLs not on this host; 429 = too many requests.
        if status not in (200, 202):
            logger.warning('IndexNow rejected %d URL(s): HTTP %s %s', len(batch), status, response.text[:200])
        else:
            logger.info('IndexNow accepted %d URL(s): HTTP %s', len(batch), status)
    return status


def _post_in_background(urls):
    try:
        submit_now(urls)
    except Exception:
        # Search-engine notification is best effort. A failure must never
        # surface in the admin — the change itself is already saved.
        logger.exception('IndexNow submission failed')


def submit(urls):
    """
    Queue URLs for submission once the current transaction commits, off the
    request thread. No-op when IndexNow is disabled.
    """
    if not enabled():
        return
    fresh = [u for u in dict.fromkeys(urls) if u and cache.add(f'indexnow:{u}', True, DEDUPE_SECONDS)]
    if not fresh:
        return
    # After commit, so a rolled-back save is never announced. Off-thread, so
    # the admin request does not wait on the search engine.
    transaction.on_commit(
        lambda: threading.Thread(target=_post_in_background, args=(fresh,), daemon=True).start()
    )
