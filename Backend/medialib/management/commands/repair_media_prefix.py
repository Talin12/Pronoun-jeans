"""
Move media-library objects under the `media/` delivery prefix.

Library uploads used to go straight to `<folder>/<hash>` while Django's storage
expects `media/<folder>/<hash>` — so an asset looked fine in the library and
404'd the moment it was attached to a product, because the Phase 7 bridge writes
storage_key into a legacy FileField whose .url re-adds the prefix.

Uploads now land in the right place. This repairs the ones that did not, by
renaming the Cloudinary object (server-side, no re-upload, bytes untouched) and
rebuilding the asset's transform URLs.

Dry run by default — it reports what it would move and changes nothing:

    python manage.py repair_media_prefix
    python manage.py repair_media_prefix --apply
"""

from django.core.management.base import BaseCommand

from medialib import storage
from medialib.models import MediaAsset


class Command(BaseCommand):
    help = 'Move media-library Cloudinary objects under the media/ prefix.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply', action='store_true',
            help='Actually rename. Without it, nothing is changed.',
        )
        parser.add_argument(
            '--limit', type=int, default=0,
            help='Only look at the first N assets (for a quick sample).',
        )

    def handle(self, *args, **options):
        apply_changes = options['apply']
        qs = MediaAsset.objects.order_by('id')
        if options['limit']:
            qs = qs[:options['limit']]

        moved = ok = missing = failed = 0

        for asset in qs:
            key    = asset.storage_key
            target = storage.delivery_id(key)      # media/<key>

            if storage.asset_exists(target):
                # Already where it should be. Variants may still predate the
                # prefix, so make sure they point at the right object.
                stale = f'/{target}' not in (asset.variants or {}).get('original', '')
                if apply_changes and stale:
                    asset.variants = storage.build_variants(key, original_width=asset.width)
                    asset.save(update_fields=['variants', 'updated_at'])
                ok += 1
                continue

            if not storage.asset_exists(key):
                self.stdout.write(self.style.WARNING(
                    f'  ?  #{asset.id} {key} — not found at either location'))
                missing += 1
                continue

            self.stdout.write(f'  →  #{asset.id} {key}  ⇒  {target}')
            moved += 1
            if not apply_changes:
                continue

            try:
                storage.rename_asset(key, target)
            except Exception as exc:                       # noqa: BLE001
                self.stdout.write(self.style.ERROR(f'     rename failed: {exc}'))
                failed += 1
                moved -= 1
                continue

            asset.variants = storage.build_variants(key, original_width=asset.width)
            asset.save(update_fields=['variants', 'updated_at'])

        self.stdout.write('')
        verb = 'moved' if apply_changes else 'would move'
        self.stdout.write(self.style.SUCCESS(
            f'{verb} {moved} · already correct {ok} · missing {missing} · failed {failed}'))
        if not apply_changes and moved:
            self.stdout.write('Re-run with --apply to perform the moves.')
