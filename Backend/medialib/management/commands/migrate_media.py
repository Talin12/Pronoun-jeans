"""
Backfill the media library from the seven existing image slots.

Idempotent, resumable, dry-run capable. Leaves every legacy image column and
Cloudinary file completely untouched — this only *creates* MediaAsset +
MediaAttachment rows. It NEVER uploads, renames, overwrites, deletes or tags a
Cloudinary object (see the Task 2 audit in MEDIA_LIBRARY_PLAN.md). Purging
duplicate Cloudinary files is a separate, manual step run only after the
migration is verified (Phase 7).

SAFETY: a hard production guard refuses to run against any non-local database
unless --allow-production is typed explicitly on the command line. Every run
prints the target DB host and Cloudinary cloud name before doing any work.

Modes:
  (default) — download each distinct file once, SHA-256 the bytes; byte-identical
              files stored under different public_ids collapse to one MediaAsset.
  --offline — NO Cloudinary network calls at all. Dedup only on shared public_id
              (the free clone-action case); assets get a placeholder hash and are
              marked 'migration:unverified' in tags and counted in the report.
"""

import hashlib
import io
import json
import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from medialib import storage
from medialib.models import MediaAsset, MediaAttachment

# Any host containing one of these is treated as production and blocked.
PROD_HOST_MARKERS = ('supabase.co', 'supabase.com', 'pooler.supabase')
LOCAL_HOSTS = ('localhost', '127.0.0.1', '::1', '')

# The seven legacy image slots, for the per-slot breakdown in the report.
SLOTS = [
    'Product.image', 'ProductImage', 'ProductColorImage',
    'ProductVariation.image', 'VariationImage', 'Category.image', 'HeroSlide.image',
]


class Command(BaseCommand):
    help = 'Backfill MediaAsset/MediaAttachment from existing image fields (dedup by content hash).'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report only; write nothing.')
        parser.add_argument('--resume', action='store_true',
                            help='Skip references already recorded in the checkpoint file.')
        parser.add_argument('--limit', type=int, default=0,
                            help='Process at most N references (0 = all).')
        parser.add_argument('--offline', action='store_true',
                            help='No Cloudinary network calls; dedup on shared public_id only, '
                                 'mark content-unverified assets in the report.')
        parser.add_argument('--allow-production', action='store_true',
                            help='REQUIRED to run against a non-local database. Type it deliberately.')
        parser.add_argument('--checkpoint', default='migrate_media.checkpoint.json',
                            help='Checkpoint file for resumable runs.')
        parser.add_argument('--log', default='migrate_media.log',
                            help='Log file path.')

    # ── Production guard ──────────────────────────────────────────────────────
    def _target_db(self):
        """(engine, host, cloud_name) for the current run — overridable in tests."""
        d = connection.settings_dict
        host = (d.get('HOST') or '').strip()
        engine = d.get('ENGINE', '')
        cloud = ''
        try:
            cloud = (settings.CLOUDINARY_STORAGE or {}).get('CLOUD_NAME', '') or ''
        except Exception:
            cloud = ''
        return engine, host, cloud

    @staticmethod
    def _is_local(engine, host):
        if 'sqlite' in (engine or ''):
            return True
        h = (host or '').lower()
        if any(marker in h for marker in PROD_HOST_MARKERS):
            return False
        return h in LOCAL_HOSTS

    # ── Reference enumeration ─────────────────────────────────────────────────
    def _iter_references(self):
        """Yield dicts describing every image reference across the seven slots."""
        from products.models import (
            Product, ProductImage, ProductColorImage,
            ProductVariation, VariationImage, Category, HeroSlide,
        )

        for p in Product.objects.exclude(image='').exclude(image__isnull=True):
            yield self._ref('Product.image', 'product', p.id, 'primary', p.image, 0, '')

        for gi in ProductImage.objects.exclude(image='').exclude(image__isnull=True):
            yield self._ref('ProductImage', 'product', gi.product_id, 'gallery', gi.image, gi.order, gi.alt_text)

        for ci in ProductColorImage.objects.exclude(image='').exclude(image__isnull=True):
            yield self._ref('ProductColorImage', 'product_color', ci.id, 'gallery', ci.image, ci.order, ci.alt_text)

        for v in ProductVariation.objects.exclude(image='').exclude(image__isnull=True):
            yield self._ref('ProductVariation.image', 'variation', v.id, 'primary', v.image, 0, '')

        for vi in VariationImage.objects.exclude(image='').exclude(image__isnull=True):
            yield self._ref('VariationImage', 'variation', vi.variation_id, 'gallery', vi.image, vi.order, vi.alt_text)

        for c in Category.objects.exclude(image='').exclude(image__isnull=True):
            yield self._ref('Category.image', 'category', c.id, 'primary', c.image, 0, '')

        for h in HeroSlide.objects.exclude(image='').exclude(image__isnull=True):
            yield self._ref('HeroSlide.image', 'banner', h.id, 'primary', h.image, h.order, h.caption)

    @staticmethod
    def _ref(slot, atype, aid, role, image_field, order, alt):
        public_id = os.path.splitext(image_field.name)[0]  # extensionless, matches uploads
        try:
            url = image_field.url
        except Exception:
            url = ''
        return {
            'slot': slot, 'type': atype, 'id': aid, 'role': role,
            'public_id': public_id, 'url': url,
            'filename': os.path.basename(image_field.name),
            'order': order or 0, 'alt': (alt or '').strip(),
            'key': f'{atype}:{aid}:{role}:{public_id}',
        }

    # ── Asset resolution (download once per distinct file, cache by public_id) ─
    def _resolve_asset(self, ref, cache, dry_run, offline):
        public_id = ref['public_id']
        if public_id in cache:
            self._collapsed_pubid += 1          # shared public_id — the free clone case
            return cache[public_id]

        # Already migrated (a prior run)? Reuse it (also a shared-public_id hit).
        existing = MediaAsset.objects.filter(storage_key=public_id).first()
        if existing:
            cache[public_id] = existing
            self._collapsed_pubid += 1
            return existing

        if offline:
            # No network: cannot read bytes, so we cannot compute a real content
            # hash. Key deterministically on the public_id and flag as unverified.
            file_hash = hashlib.sha256(('publicid:' + public_id).encode()).hexdigest()
            data = None
        else:
            data = storage.fetch_image_bytes(ref['url'])   # network READ (download) only
            file_hash = hashlib.sha256(data).hexdigest()

            # Byte-identical to something already migrated under a different key?
            by_hash = MediaAsset.objects.filter(file_hash=file_hash).first()
            if by_hash:
                cache[public_id] = by_hash
                self._collapsed_hash += 1
                self._reclaimable_bytes += (by_hash.file_size or len(data))
                return by_hash

        if dry_run:
            self._would_create += 1
            if offline:
                self._unverified += 1
            cache[public_id] = _Pending(file_hash)
            return cache[public_id]

        width = height = file_size = None
        if data is not None:
            file_size = len(data)
            try:
                from PIL import Image
                with Image.open(io.BytesIO(data)) as img:
                    width, height = img.size
            except Exception:
                pass

        asset = MediaAsset.objects.create(
            storage_key=public_id,             # keep the EXISTING public_id — never rename
            file_hash=file_hash,
            original_filename=ref['filename'],
            width=width, height=height, file_size=file_size,
            alt_text=ref['alt'],
            tags=(['migration:unverified'] if offline else []),
            variants=storage.build_variants(public_id, original_width=width),  # URL build, no network
        )
        self._created += 1
        if offline:
            self._unverified += 1
        cache[public_id] = asset
        return asset

    def _attach(self, ref, asset, dry_run):
        if dry_run or isinstance(asset, _Pending):
            self._would_attach += 1
            return
        att, created = MediaAttachment.objects.get_or_create(
            media=asset, attachable_type=ref['type'],
            attachable_id=ref['id'], role=ref['role'],
            defaults={'sort_order': ref['order']},
        )
        if ref['alt'] and len(ref['alt']) > len(asset.alt_text or ''):
            asset.alt_text = ref['alt']
            asset.save(update_fields=['alt_text', 'updated_at'])
        if created:
            self._attached += 1

    # ── Entry point ───────────────────────────────────────────────────────────
    def handle(self, *args, **opts):
        dry_run = opts['dry_run']
        offline = opts['offline']
        limit = opts['limit']
        checkpoint_path = opts['checkpoint']
        log_path = opts['log']

        engine, host, cloud = self._target_db()

        # Banner FIRST — always show where this run is pointed, even if blocked.
        banner = [
            '──────────────────────────────────────────────',
            f' migrate_media  target DB host : {host or "(sqlite/local)"}',
            f'                Cloudinary cloud: {cloud or "(none)"}'
            + ('   [OFFLINE — no network]' if offline else ''),
            f'                mode           : '
            + ('DRY-RUN' if dry_run else 'WRITE') + (', OFFLINE' if offline else ''),
            '──────────────────────────────────────────────',
        ]
        for line in banner:
            self.stdout.write(line)

        # Production guard.
        if not self._is_local(engine, host) and not opts['allow_production']:
            raise CommandError(
                f'REFUSING to run against non-local database host "{host}". '
                f'This looks like production. If you truly intend this, re-run with '
                f'--allow-production (type it deliberately). No env var or config can '
                f'override this guard.'
            )

        done = set()
        if opts['resume'] and os.path.exists(checkpoint_path):
            with open(checkpoint_path) as f:
                done = set(json.load(f).get('done', []))

        self._created = self._attached = 0
        self._collapsed_pubid = self._collapsed_hash = 0
        self._would_create = self._would_attach = 0
        self._unverified = 0
        self._reclaimable_bytes = 0
        slot_counts = {s: 0 for s in SLOTS}
        scanned = skipped = failed = 0
        missing_url = 0
        cache = {}
        logf = open(log_path, 'a')

        def log(msg):
            logf.write(msg + '\n')

        log(f'--- migrate_media start (dry_run={dry_run}, offline={offline}, '
            f'resume={opts["resume"]}, host={host}, cloud={cloud}) ---')

        for ref in self._iter_references():
            if limit and scanned >= limit:
                break
            scanned += 1
            slot_counts[ref['slot']] = slot_counts.get(ref['slot'], 0) + 1
            if ref['key'] in done:
                skipped += 1
                continue
            if not offline and not ref['url']:
                missing_url += 1
                failed += 1
                log(f'FAIL {ref["key"]}: no resolvable URL')
                continue
            try:
                if dry_run:
                    asset = self._resolve_asset(ref, cache, dry_run, offline)
                    self._attach(ref, asset, dry_run)
                else:
                    with transaction.atomic():
                        asset = self._resolve_asset(ref, cache, dry_run, offline)
                        self._attach(ref, asset, dry_run)
                    done.add(ref['key'])
            except Exception as e:
                failed += 1
                log(f'FAIL {ref["key"]}: {e}')
                self.stderr.write(f'FAIL {ref["key"]}: {e}')

        if not dry_run:
            with open(checkpoint_path, 'w') as f:
                json.dump({'done': sorted(done)}, f)

        assets = self._would_create if dry_run else self._created
        total_refs = scanned
        dedup_ratio = (1 - (assets / total_refs)) if total_refs else 0
        reclaimable = ('unknown (offline)' if offline
                       else f'{self._reclaimable_bytes / 1024 / 1024:.2f} MB')

        report = [
            '',
            '=== migrate_media report ===',
            f'references scanned      : {scanned}',
            '  per slot:',
        ]
        for s in SLOTS:
            report.append(f'    {s:<24}: {slot_counts.get(s, 0)}')
        report += [
            f'skipped (resume)        : {skipped}',
            f'assets created          : {assets}' + (' (dry-run)' if dry_run else ''),
            f'deduplication ratio     : {dedup_ratio:.1%}',
            f'collapsed on public_id  : {self._collapsed_pubid}  (shared path — free/clone case)',
            f'collapsed on content SHA: {self._collapsed_hash}  (real byte comparison)',
            f'attachments created     : {self._would_attach if dry_run else self._attached}'
            + (' (dry-run)' if dry_run else ''),
            f'content-unverified      : {self._unverified}' + (' (offline)' if offline else ''),
            f'missing/unresolvable URL: {missing_url}',
            f'failed                  : {failed}',
            f'reclaimable storage     : {reclaimable}  (nothing deleted)',
        ]
        for line in report:
            log(line)
            self.stdout.write(line)
        logf.close()


class _Pending:
    """Stand-in asset used only during --dry-run to allow counting without writes."""
    def __init__(self, file_hash):
        self.file_hash = file_hash
