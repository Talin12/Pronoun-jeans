"""
Submit every public catalogue URL to IndexNow in one request.

Run once after the IndexNow key file is live, and again after any bulk change
made outside the admin (imports, raw SQL):

    python manage.py indexnow_submit_all            # submit
    python manage.py indexnow_submit_all --dry-run  # just list the URLs

Ignores INDEXNOW_ENABLED — running it is the explicit opt-in.
"""

from django.core.management.base import BaseCommand

from products import indexnow
from products.models import Category, Product

STATIC_PATHS = ['/', '/catalog', '/about', '/contact']


class Command(BaseCommand):
    help = 'Submit all public product and category URLs to IndexNow (Bing and others).'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Print the URLs without submitting.')

    def handle(self, *args, dry_run=False, **options):
        urls = [indexnow.absolute(p) for p in STATIC_PATHS]
        urls += [indexnow.category_url(slug) for slug in Category.objects.values_list('slug', flat=True)]
        urls += [
            indexnow.product_url(slug)
            for slug in Product.objects.filter(is_active=True).values_list('slug', flat=True)
        ]
        urls = list(dict.fromkeys(urls))

        if dry_run:
            for url in urls:
                self.stdout.write(url)
            self.stdout.write(self.style.NOTICE(f'{len(urls)} URL(s); nothing submitted (--dry-run).'))
            return

        status = indexnow.submit_now(urls)
        if status in (200, 202):
            self.stdout.write(self.style.SUCCESS(f'Submitted {len(urls)} URL(s) to IndexNow: HTTP {status}.'))
        else:
            self.stderr.write(self.style.ERROR(
                f'IndexNow answered HTTP {status}. 403 means the key file '
                f'{indexnow.absolute("/" + indexnow.payload([])["key"] + ".txt")} is not live yet.'
            ))
