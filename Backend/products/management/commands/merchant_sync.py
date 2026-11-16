"""
Push every product that is flagged for Google Merchant Center.

The admin panel syncs one product at a time, as it is saved. This is for the
cases that do not come through the panel: the first run after the credentials
are installed, a bulk price change applied in the database, or a backlog of
rows left in error after Google was unreachable.

    python manage.py merchant_sync                 # everything flagged
    python manage.py merchant_sync --retry-failed  # only the ones in error
    python manage.py merchant_sync --dry-run       # show the payloads, send nothing
    python manage.py merchant_sync --product 42    # one product, by id
"""

import json

from django.core.management.base import BaseCommand, CommandError

from products import merchant
from products.models import Product


class Command(BaseCommand):
    help = 'Push products flagged with list_on_merchant to Google Merchant Center.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Build and print each payload without sending anything.',
        )
        parser.add_argument(
            '--retry-failed', action='store_true',
            help='Only products whose last push failed.',
        )
        parser.add_argument(
            '--product', type=int, default=None,
            help='Sync a single product by id, whatever its flag says.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        # A dry run is useful precisely when the credentials are not in place
        # yet, so it is the one mode that does not require them.
        if not merchant.enabled() and not dry_run:
            raise CommandError(
                'Google Merchant Center is not configured. Set MERCHANT_ACCOUNT_ID, '
                'MERCHANT_DATA_SOURCE_ID and MERCHANT_SERVICE_ACCOUNT_JSON, or pass '
                '--dry-run.'
            )

        products = self._select(options)
        if not products:
            self.stdout.write('Nothing to sync.')
            return

        self.stdout.write(f'{len(products)} product(s) to sync.')

        failures = 0
        for product in products:
            label = f'#{product.pk} {product.name}'

            if dry_run:
                try:
                    payload = merchant.build_payload(product)
                except ValueError as exc:
                    failures += 1
                    self.stderr.write(self.style.ERROR(f'  {label}: {exc}'))
                    continue
                self.stdout.write(self.style.SUCCESS(f'  {label}:'))
                self.stdout.write(json.dumps(payload, indent=2, default=str))
                continue

            error = merchant.sync(product)
            if error:
                failures += 1
                self.stderr.write(self.style.ERROR(f'  {label}: {error}'))
            else:
                action = 'listed' if product.list_on_merchant else 'withdrawn'
                self.stdout.write(self.style.SUCCESS(f'  {label}: {action}'))

        if failures:
            # Non-zero exit, so a cron wrapper notices.
            raise CommandError(f'{failures} of {len(products)} product(s) failed.')

        self.stdout.write(self.style.SUCCESS('Done.'))

    def _select(self, options):
        base = Product.objects.prefetch_related(
            'variations', 'gallery_images', 'attribute_options__attribute',
        ).select_related('category')

        if options['product'] is not None:
            product = base.filter(pk=options['product']).first()
            if product is None:
                raise CommandError(f"No product with id {options['product']}.")
            return [product]

        # Products that were listed and have since been switched off are
        # included so their withdrawal is not left half-done.
        queryset = base.filter(list_on_merchant=True)
        if options['retry_failed']:
            return list(queryset.exclude(merchant_sync_error=''))

        from django.db.models import Q
        return list(
            base.filter(Q(list_on_merchant=True) | ~Q(merchant_offer_id=None))
        )
