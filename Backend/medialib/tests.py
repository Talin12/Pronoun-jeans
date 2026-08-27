import io
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase
from PIL import Image

from . import presenters, services, storage
from .models import MediaAsset, MediaAttachment


def make_image_bytes(fmt='PNG', color=(200, 30, 30), size=(12, 12)):
    buf = io.BytesIO()
    Image.new('RGB', size, color).save(buf, fmt)
    return buf.getvalue()


def make_upload(name='jeans.png', fmt='PNG', color=(200, 30, 30)):
    content = make_image_bytes(fmt=fmt, color=color)
    ctype = {'PNG': 'image/png', 'JPEG': 'image/jpeg'}.get(fmt, 'application/octet-stream')
    return SimpleUploadedFile(name, content, content_type=ctype)


class MediaAssetSchemaTests(TestCase):
    def _asset(self, **kw):
        defaults = dict(
            storage_key='media/2026/08/abc123',
            file_hash='a' * 64,
            original_filename='jeans.jpg',
            mime_type='image/jpeg',
        )
        defaults.update(kw)
        return MediaAsset.objects.create(**defaults)

    def test_file_hash_is_unique(self):
        """The dedup key must be unique — a second row with the same hash is rejected."""
        self._asset()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self._asset(storage_key='media/2026/08/different')

    def test_storage_key_is_unique(self):
        self._asset()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self._asset(file_hash='b' * 64)

    def test_json_defaults(self):
        asset = self._asset()
        self.assertEqual(asset.tags, [])
        self.assertEqual(asset.variants, {})


class MediaAttachmentSchemaTests(TestCase):
    def setUp(self):
        self.asset = MediaAsset.objects.create(
            storage_key='media/2026/08/xyz', file_hash='c' * 64,
        )

    def test_attach_and_reuse_same_asset_across_entities(self):
        """One asset can be referenced by many entities without duplicating the file."""
        MediaAttachment.objects.create(
            media=self.asset, attachable_type='product', attachable_id=1, role='primary',
        )
        MediaAttachment.objects.create(
            media=self.asset, attachable_type='banner', attachable_id=9, role='gallery',
        )
        self.assertEqual(self.asset.attachments.count(), 2)

    def test_unique_media_type_id_role(self):
        MediaAttachment.objects.create(
            media=self.asset, attachable_type='product', attachable_id=1, role='gallery',
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                MediaAttachment.objects.create(
                    media=self.asset, attachable_type='product', attachable_id=1, role='gallery',
                )

    def test_asset_with_attachment_cannot_be_hard_deleted(self):
        """PROTECT guarantees an in-use asset is never orphaned by a delete."""
        MediaAttachment.objects.create(
            media=self.asset, attachable_type='product', attachable_id=1, role='gallery',
        )
        with self.assertRaises(ProtectedError):
            self.asset.delete()


def _fake_store(data, public_id, folder=None):
    key = f'{folder}/{public_id}' if folder else public_id
    return {'public_id': key, 'secure_url': f'https://cdn.test/{key}'}


def _fake_variants(storage_key, original_width=None):
    return {'400': f'https://cdn.test/w_400/{storage_key}',
            'original': f'https://cdn.test/{storage_key}'}


@mock.patch('medialib.storage.build_variants', side_effect=_fake_variants)
@mock.patch('medialib.storage.store_image', side_effect=_fake_store)
class IngestUploadTests(TestCase):
    def test_new_upload_creates_asset(self, store_mock, variants_mock):
        asset, deduped = services.ingest_upload(make_upload())
        self.assertFalse(deduped)
        self.assertEqual(MediaAsset.objects.count(), 1)
        self.assertEqual(len(asset.file_hash), 64)
        self.assertEqual(asset.width, 12)
        self.assertEqual(asset.mime_type, 'image/png')
        self.assertIn('400', asset.variants)
        store_mock.assert_called_once()

    def test_duplicate_upload_returns_existing_without_second_store(self, store_mock, variants_mock):
        """The core fix: same bytes → existing asset, no second Cloudinary write."""
        first, _ = services.ingest_upload(make_upload(name='a.png'))
        second, deduped = services.ingest_upload(make_upload(name='b.png'))

        self.assertTrue(deduped)
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(MediaAsset.objects.count(), 1)
        store_mock.assert_called_once()  # only the first upload hit storage

    def test_different_images_are_not_deduped(self, store_mock, variants_mock):
        services.ingest_upload(make_upload(color=(10, 10, 10)))
        services.ingest_upload(make_upload(color=(240, 240, 240)))
        self.assertEqual(MediaAsset.objects.count(), 2)
        self.assertEqual(store_mock.call_count, 2)

    def test_soft_deleted_asset_is_revived_on_reupload(self, store_mock, variants_mock):
        asset, _ = services.ingest_upload(make_upload())
        from django.utils import timezone
        asset.deleted_at = timezone.now()
        asset.save(update_fields=['deleted_at'])

        revived, deduped = services.ingest_upload(make_upload())
        self.assertTrue(deduped)
        self.assertEqual(revived.pk, asset.pk)
        self.assertIsNone(revived.deleted_at)
        store_mock.assert_called_once()

    def test_invalid_file_is_rejected(self, store_mock, variants_mock):
        bad = SimpleUploadedFile('x.png', b'this is not an image', content_type='image/png')
        with self.assertRaises(services.MediaValidationError):
            services.ingest_upload(bad)
        store_mock.assert_not_called()

    def test_oversized_file_is_rejected(self, store_mock, variants_mock):
        big = make_upload()
        big.size = services.MAX_UPLOAD_BYTES + 1
        with self.assertRaises(services.MediaValidationError):
            services.ingest_upload(big)
        store_mock.assert_not_called()

    def test_unsupported_format_is_rejected(self, store_mock, variants_mock):
        buf = io.BytesIO()
        Image.new('RGB', (10, 10)).save(buf, 'BMP')
        bmp = SimpleUploadedFile('x.bmp', buf.getvalue(), content_type='image/bmp')
        with self.assertRaises(services.MediaValidationError):
            services.ingest_upload(bmp)
        store_mock.assert_not_called()

    def test_heic_is_accepted_and_reencoded_to_jpeg(self, store_mock, variants_mock):
        """
        iPhone photos arrive as HEIC, which browsers can't re-encode. They must
        be accepted and stored as JPEG so Cloudinary and the storefront can serve
        them — the exact upload that previously errored out in the editor.
        """
        buf = io.BytesIO()
        try:
            Image.new('RGB', (24, 24), (10, 120, 200)).save(buf, 'HEIF', quality=90)
        except (OSError, KeyError, ValueError):  # pragma: no cover
            self.skipTest('pillow-heif not available to encode a HEIC fixture')
        heic = SimpleUploadedFile('phone.heic', buf.getvalue(), content_type='image/heic')

        asset, deduped = services.ingest_upload(heic)

        store_mock.assert_called_once()
        self.assertFalse(deduped)
        self.assertEqual(asset.mime_type, 'image/jpeg')
        self.assertEqual(asset.original_filename, 'phone.heic')


# ── Video ─────────────────────────────────────────────────────────────────

# Container headers, which is all sniff_video_container reads. The rest of the
# file is padding: nothing on the ingest path decodes a video.
MP4_HEADER  = b'\x00\x00\x00\x20ftypisom'
MOV_HEADER  = b'\x00\x00\x00\x14ftypqt  '
WEBM_HEADER = b'\x1a\x45\xdf\xa3'


def make_video(name='fit.mp4', header=MP4_HEADER, tail=b'\x00' * 64):
    return SimpleUploadedFile(name, header + tail, content_type='video/mp4')


def _fake_store_video(fileobj, public_id, folder=storage.MEDIA_FOLDER):
    # Mirrors store_video: the folder is baked into the public_id it reports.
    key = f'{storage.delivery_id(folder)}/{public_id}' if folder else public_id
    return {'public_id': key, 'secure_url': f'https://cdn.test/{key}',
            'width': 1080, 'height': 1920, 'duration': 12.5,
            'bytes': len(fileobj.read())}


def _fake_video_variants(storage_key, original_width=None):
    return {
        'mp4':          f'https://cdn.test/f_mp4/{storage_key}',
        'webm':         f'https://cdn.test/f_webm/{storage_key}',
        'poster':       f'https://cdn.test/poster/{storage_key}.jpg',
        'poster_thumb': f'https://cdn.test/poster_200/{storage_key}.jpg',
        'original':     f'https://cdn.test/{storage_key}',
    }


class SniffVideoContainerTests(TestCase):
    def test_recognises_the_containers_we_accept(self):
        self.assertEqual(services.sniff_video_container(MP4_HEADER), 'mp4')
        self.assertEqual(services.sniff_video_container(WEBM_HEADER), 'webm')

    def test_quicktime_brand_is_distinguished_from_mp4(self):
        """MOV and MP4 share the ftyp header and differ only by brand."""
        self.assertEqual(services.sniff_video_container(MOV_HEADER), 'mov')

    def test_an_image_is_not_a_video(self):
        self.assertIsNone(services.sniff_video_container(make_image_bytes()[:16]))


@mock.patch('medialib.storage.build_video_variants', side_effect=_fake_video_variants)
@mock.patch('medialib.storage.store_video', side_effect=_fake_store_video)
class IngestVideoTests(TestCase):
    def test_new_video_creates_a_video_asset(self, store_mock, variants_mock):
        asset, deduped = services.ingest_upload(make_video())

        self.assertFalse(deduped)
        self.assertEqual(asset.media_type, 'video')
        self.assertEqual(asset.mime_type, 'video/mp4')
        self.assertEqual(asset.duration, 12.5)
        self.assertEqual((asset.width, asset.height), (1080, 1920))
        self.assertEqual(asset.file_size, len(MP4_HEADER) + 64)
        self.assertIn('poster', asset.variants)
        store_mock.assert_called_once()

    def test_the_upload_is_streamed_not_buffered(self, store_mock, variants_mock):
        """store_video gets the file object itself. Reading a 100 MB clip into
        a bytes object first is a fifth of the worker's RAM."""
        services.ingest_upload(make_video())
        sent = store_mock.call_args.args[0]
        self.assertTrue(hasattr(sent, 'read'))
        self.assertNotIsInstance(sent, bytes)

    def test_video_does_not_go_through_the_image_pipeline(self, store_mock, variants_mock):
        """A clip must never reach store_image — it would upload as the wrong
        Cloudinary resource type and then deliver a broken URL."""
        with mock.patch('medialib.storage.store_image') as image_mock:
            services.ingest_upload(make_video())
        image_mock.assert_not_called()

    def test_quicktime_upload_records_its_own_mime(self, store_mock, variants_mock):
        asset, _ = services.ingest_upload(make_video(name='clip.mov', header=MOV_HEADER))
        self.assertEqual(asset.mime_type, 'video/quicktime')

    def test_duplicate_video_is_deduped(self, store_mock, variants_mock):
        first, _ = services.ingest_upload(make_video(name='a.mp4'))
        second, deduped = services.ingest_upload(make_video(name='b.mp4'))

        self.assertTrue(deduped)
        self.assertEqual(first.pk, second.pk)
        store_mock.assert_called_once()

    def test_oversized_video_is_rejected(self, store_mock, variants_mock):
        big = make_video()
        big.size = services.MAX_VIDEO_UPLOAD_BYTES + 1
        with self.assertRaises(services.MediaValidationError):
            services.ingest_upload(big)
        store_mock.assert_not_called()

    def test_video_over_the_image_cap_is_still_accepted(self, store_mock, variants_mock):
        """The image cap is 15 MB. A video is allowed far past it — applying the
        image limit to a clip is what would reject every real upload."""
        clip = make_video()
        clip.size = services.MAX_UPLOAD_BYTES + 1
        asset, _ = services.ingest_upload(clip)
        self.assertEqual(asset.media_type, 'video')

    def test_unplayable_container_is_rejected(self, store_mock, variants_mock):
        avi = SimpleUploadedFile('x.avi', b'RIFF\x00\x00\x00\x00AVI LIST',
                                 content_type='video/x-msvideo')
        with self.assertRaises(services.MediaValidationError):
            services.ingest_upload(avi)
        store_mock.assert_not_called()


class StoreVideoTests(TestCase):
    """The storage seam itself, with Cloudinary's uploader mocked out."""

    @mock.patch('cloudinary.uploader.upload_large')
    def test_folder_is_baked_into_the_public_id(self, upload_mock):
        """Regression: upload_large re-sends public_id on every chunk after the
        first. A `folder` left in the options is then applied a second time, so
        a video over one chunk lands at media/x/media/x/<hash> and every URL we
        build for it 404s."""
        upload_mock.return_value = {'public_id': 'media/media_library/abc'}
        storage.store_video(io.BytesIO(b'clip'), 'abc')

        _, kwargs = upload_mock.call_args
        self.assertNotIn('folder', kwargs)
        self.assertEqual(kwargs['public_id'], 'media/media_library/abc')
        self.assertEqual(kwargs['resource_type'], 'video')
        self.assertFalse(kwargs['overwrite'])

    @mock.patch('cloudinary.uploader.upload_large')
    def test_a_custom_folder_lands_under_the_delivery_prefix(self, upload_mock):
        upload_mock.return_value = {'public_id': 'x'}
        storage.store_video(io.BytesIO(b'clip'), 'abc', folder='products/gallery')

        _, kwargs = upload_mock.call_args
        self.assertEqual(kwargs['public_id'], 'media/products/gallery/abc')
        # …and strips back to the key convention the legacy bridge expects.
        self.assertEqual(storage.strip_prefix(kwargs['public_id']),
                         'products/gallery/abc')


class VideoPresenterTests(TestCase):
    def _video(self, **kw):
        defaults = dict(
            storage_key='media/media_library/vid', file_hash='d' * 64,
            media_type='video', mime_type='video/mp4', duration=8.0,
            variants=_fake_video_variants('media/media_library/vid'),
        )
        defaults.update(kw)
        return MediaAsset.objects.create(**defaults)

    def test_thumbnail_is_a_poster_frame(self):
        """Every existing grid renders thumb_url into an <img>; for a video that
        has to be a still, or all of them break at once."""
        data = presenters.serialize_asset(self._video())
        self.assertEqual(data['media_type'], 'video')
        self.assertIn('poster_200', data['thumb_url'])

    def test_sources_are_offered_webm_first_then_mp4(self):
        data = presenters.serialize_asset(self._video())
        self.assertEqual([s['type'] for s in data['sources']],
                         ['video/webm', 'video/mp4'])
        self.assertEqual(data['duration'], 8.0)

    def test_images_carry_no_video_keys(self):
        """Clients branch on media_type, not on the presence of null fields."""
        image = MediaAsset.objects.create(storage_key='media/img', file_hash='e' * 64)
        data = presenters.serialize_asset(image)
        self.assertEqual(data['media_type'], 'image')
        self.assertNotIn('sources', data)
        self.assertNotIn('duration', data)


class VideoAttachmentTests(TestCase):
    def setUp(self):
        from products.models import Product
        self.product = Product.objects.create(name='Cargo', slug='cargo')
        self.video = MediaAsset.objects.create(
            storage_key='media/media_library/clip', file_hash='f' * 64,
            media_type='video', mime_type='video/mp4', original_filename='clip.mp4',
        )
        self.image = MediaAsset.objects.create(
            storage_key='media/products/gallery/shot', file_hash='1' * 64,
            mime_type='image/jpeg', original_filename='shot.jpg',
        )

    def test_video_in_a_gallery_creates_no_legacy_image_row(self):
        """The legacy columns are ImageFields. A video written into one is a
        broken <img> on the storefront and in the Django admin alike."""
        from products.models import ProductImage
        services.attach_assets('product', self.product.id,
                               [self.image.id, self.video.id], 'gallery')

        rows = list(ProductImage.objects.filter(product=self.product))
        self.assertEqual([r.image.name for r in rows],
                         ['media/products/gallery/shot'])
        # The attachment itself is real — only the legacy mirror skips it.
        self.assertEqual(
            MediaAttachment.objects.filter(attachable_type='product',
                                           attachable_id=self.product.id).count(), 2)

    def test_detaching_the_image_does_not_disturb_the_video(self):
        from products.models import ProductImage
        services.attach_assets('product', self.product.id,
                               [self.image.id, self.video.id], 'gallery')
        services.detach_assets('product', self.product.id, media_id=self.image.id)

        self.assertFalse(ProductImage.objects.filter(product=self.product).exists())
        self.assertTrue(MediaAttachment.objects.filter(media=self.video).exists())

    def test_video_is_refused_as_a_cover(self):
        """A video in the single-image slot would empty Product.image, and the
        catalogue queryset drops products without one — a silent delisting."""
        with self.assertRaises(ValueError):
            services.attach_assets('product', self.product.id, [self.video.id], 'primary')
        self.assertFalse(MediaAttachment.objects.filter(media=self.video).exists())

    def test_image_is_still_accepted_as_a_cover(self):
        services.attach_assets('product', self.product.id, [self.image.id], 'primary')
        self.product.refresh_from_db()
        self.assertEqual(self.product.image.name, 'media/products/gallery/shot')


# ── Phase 3: admin API views ──────────────────────────────────────────────────

def _staff_client():
    from django.contrib.auth import get_user_model
    from django.test import Client
    User = get_user_model()
    u = User(email='admin@test.com', username='admin', is_staff=True,
             is_superuser=True, is_active=True)
    u.set_password('x')
    u.save()
    c = Client()
    c.force_login(u)
    return c, u


@mock.patch('medialib.storage.build_variants', side_effect=_fake_variants)
@mock.patch('medialib.storage.store_image', side_effect=_fake_store)
class MediaApiTests(TestCase):
    def setUp(self):
        self.client, self.user = _staff_client()

    def _asset(self, h='a', key='k1'):
        return MediaAsset.objects.create(storage_key=key, file_hash=h * 64,
                                         original_filename='x.jpg', mime_type='image/jpeg')

    def test_requires_staff(self, *_):
        from django.test import Client
        anon = Client()
        r = anon.get('/admin/medialib/api/assets/')
        self.assertIn(r.status_code, (302, 403))  # redirected to admin login

    def test_upload_then_dedup_via_api(self, store_mock, variants_mock):
        r1 = self.client.post('/admin/medialib/api/assets/upload/',
                              {'files': make_upload(name='a.png')})
        self.assertEqual(r1.status_code, 200)
        body1 = r1.json()
        self.assertFalse(body1['results'][0]['deduplicated'])

        r2 = self.client.post('/admin/medialib/api/assets/upload/',
                              {'files': make_upload(name='b.png')})
        self.assertTrue(r2.json()['results'][0]['deduplicated'])
        self.assertEqual(MediaAsset.objects.count(), 1)
        store_mock.assert_called_once()

    def test_list_search_and_pagination(self, *_):
        self._asset(h='a', key='k1')
        a2 = self._asset(h='b', key='k2')
        a2.title = 'blue jeans'; a2.save()
        r = self.client.get('/admin/medialib/api/assets/?search=blue')
        data = r.json()
        self.assertEqual(data['count'], 1)
        self.assertEqual(data['results'][0]['id'], a2.id)

    def test_attach_reorder_detach(self, *_):
        from products.models import Product
        p = Product.objects.create(name='P', slug='p')
        a1 = self._asset(h='a', key='k1')
        a2 = self._asset(h='b', key='k2')

        r = self.client.post(f'/admin/medialib/api/product/{p.id}/attach/',
                             data={'media_ids': [a1.id, a2.id], 'role': 'gallery'},
                             content_type='application/json')
        self.assertEqual(len(r.json()['attachments']), 2)

        atts = list(MediaAttachment.objects.filter(attachable_type='product', attachable_id=p.id)
                    .order_by('sort_order'))
        # reverse order
        self.client.post(f'/admin/medialib/api/product/{p.id}/reorder/',
                         data={'order': [atts[1].id, atts[0].id]},
                         content_type='application/json')
        atts[0].refresh_from_db(); atts[1].refresh_from_db()
        self.assertEqual(atts[1].sort_order, 0)

        self.client.post(f'/admin/medialib/api/product/{p.id}/detach/',
                         data={'media_id': a1.id}, content_type='application/json')
        self.assertFalse(MediaAttachment.objects.filter(media=a1).exists())

    def test_delete_blocked_when_in_use_then_forced(self, *_):
        from products.models import Product
        p = Product.objects.create(name='P', slug='p')
        a = self._asset()
        MediaAttachment.objects.create(media=a, attachable_type='product',
                                       attachable_id=p.id, role='gallery')

        r = self.client.post(f'/admin/medialib/api/assets/{a.id}/delete/')
        self.assertEqual(r.status_code, 409)
        a.refresh_from_db(); self.assertIsNone(a.deleted_at)

        r2 = self.client.post(f'/admin/medialib/api/assets/{a.id}/delete/?force=true')
        self.assertEqual(r2.status_code, 200)
        a.refresh_from_db(); self.assertIsNotNone(a.deleted_at)
        self.assertFalse(MediaAttachment.objects.filter(media=a).exists())

    def test_usage_lists_places_with_labels(self, *_):
        from products.models import Product
        p = Product.objects.create(name='Blue Jeans', slug='bj')
        a = self._asset()
        MediaAttachment.objects.create(media=a, attachable_type='product',
                                       attachable_id=p.id, role='primary')
        r = self.client.get(f'/admin/medialib/api/assets/{a.id}/usage/')
        data = r.json()
        self.assertEqual(data['count'], 1)
        self.assertEqual(data['usage'][0]['label'], 'Blue Jeans')

    def test_update_alt_text(self, *_):
        a = self._asset()
        self.client.post(f'/admin/medialib/api/assets/{a.id}/update/',
                         data={'alt_text': 'blue denim jeans', 'tags': 'denim,blue'},
                         content_type='application/json')
        a.refresh_from_db()
        self.assertEqual(a.alt_text, 'blue denim jeans')
        self.assertEqual(a.tags, ['denim', 'blue'])


# ── Phase 5: migration command ────────────────────────────────────────────────

@mock.patch('medialib.storage.build_variants', return_value={})
class MigrateMediaCommandTests(TestCase):
    def _run(self, **kw):
        import tempfile, os
        from django.core.management import call_command
        d = tempfile.mkdtemp()
        call_command('migrate_media',
                     checkpoint=os.path.join(d, 'cp.json'),
                     log=os.path.join(d, 'log.txt'), **kw)
        return d

    def test_dedups_identical_files_across_entities(self, variants_mock):
        from products.models import Product, Category
        # Two products + a category, but all point at byte-identical images.
        Product.objects.create(name='A', slug='a', image='products/a.jpg')
        Product.objects.create(name='B', slug='b', image='products/b.jpg')
        Category.objects.create(name='C', slug='c', image='categories/c.jpg')

        same = make_image_bytes(color=(1, 2, 3))
        with mock.patch('medialib.storage.fetch_image_bytes', return_value=same):
            self._run()

        # One asset (all identical), three attachments (three entities).
        self.assertEqual(MediaAsset.objects.count(), 1)
        self.assertEqual(MediaAttachment.objects.count(), 3)

    def test_distinct_files_create_distinct_assets(self, variants_mock):
        from products.models import Product
        Product.objects.create(name='A', slug='a', image='products/a.jpg')
        Product.objects.create(name='B', slug='b', image='products/b.jpg')

        seq = [make_image_bytes(color=(10, 10, 10)), make_image_bytes(color=(250, 250, 250))]
        with mock.patch('medialib.storage.fetch_image_bytes', side_effect=seq):
            self._run()
        self.assertEqual(MediaAsset.objects.count(), 2)

    def test_dry_run_writes_nothing(self, variants_mock):
        from products.models import Product
        Product.objects.create(name='A', slug='a', image='products/a.jpg')
        with mock.patch('medialib.storage.fetch_image_bytes', return_value=make_image_bytes()):
            self._run(dry_run=True)
        self.assertEqual(MediaAsset.objects.count(), 0)
        self.assertEqual(MediaAttachment.objects.count(), 0)

    def test_rerun_is_idempotent(self, variants_mock):
        from products.models import Product
        Product.objects.create(name='A', slug='a', image='products/a.jpg')
        with mock.patch('medialib.storage.fetch_image_bytes', return_value=make_image_bytes()):
            self._run()
            self._run()  # second run must not duplicate
        self.assertEqual(MediaAsset.objects.count(), 1)
        self.assertEqual(MediaAttachment.objects.count(), 1)


# ── Task 1/2: production guard + offline mode ─────────────────────────────────

class MigrateMediaGuardTests(TestCase):
    def _run(self, **kw):
        import tempfile, os
        from django.core.management import call_command
        d = tempfile.mkdtemp()
        call_command('migrate_media',
                     checkpoint=os.path.join(d, 'cp.json'),
                     log=os.path.join(d, 'log.txt'), **kw)
        return d

    def test_guard_blocks_non_local_host(self):
        """A production-looking DB host must refuse to run without --allow-production."""
        from django.core.management.base import CommandError
        from medialib.management.commands.migrate_media import Command
        prod = ('postgresql', 'db.euqgayjacpsrjpivxgfu.supabase.co', 'prodcloud')
        with mock.patch.object(Command, '_target_db', return_value=prod):
            with self.assertRaises(CommandError):
                self._run()

    def test_guard_blocks_generic_remote_host(self):
        """Even a non-supabase remote host is blocked (only localhost is allowed)."""
        from django.core.management.base import CommandError
        from medialib.management.commands.migrate_media import Command
        remote = ('postgresql', 'db.example.com', 'cloud')
        with mock.patch.object(Command, '_target_db', return_value=remote):
            with self.assertRaises(CommandError):
                self._run()

    def test_allow_production_flag_bypasses_guard(self):
        """--allow-production lets it proceed even on a prod host (no exception)."""
        from medialib.management.commands.migrate_media import Command
        prod = ('postgresql', 'db.euqgayjacpsrjpivxgfu.supabase.co', 'prodcloud')
        with mock.patch.object(Command, '_target_db', return_value=prod):
            self._run(allow_production=True)  # no fixtures → 0 refs, must not raise

    def test_is_local_classification(self):
        from medialib.management.commands.migrate_media import Command
        self.assertTrue(Command._is_local('django.db.backends.sqlite3', ''))
        self.assertTrue(Command._is_local('postgresql', '127.0.0.1'))
        self.assertTrue(Command._is_local('postgresql', 'localhost'))
        self.assertFalse(Command._is_local('postgresql', 'aws-1-ap-northeast-1.pooler.supabase.com'))
        self.assertFalse(Command._is_local('postgresql', 'db.abc.supabase.co'))
        self.assertFalse(Command._is_local('postgresql', 'some.remote.host'))


class MigrateMediaOfflineTests(TestCase):
    def _run(self, **kw):
        import tempfile, os
        from django.core.management import call_command
        d = tempfile.mkdtemp()
        call_command('migrate_media',
                     checkpoint=os.path.join(d, 'cp.json'),
                     log=os.path.join(d, 'log.txt'), **kw)
        return d

    @mock.patch('medialib.storage.build_variants', return_value={})
    @mock.patch('medialib.storage.fetch_image_bytes')
    def test_offline_makes_no_network_call(self, fetch_mock, variants_mock):
        from products.models import Product
        Product.objects.create(name='A', slug='a', image='products/a.jpg')
        self._run(offline=True)
        fetch_mock.assert_not_called()  # the whole point: no Cloudinary network
        self.assertEqual(MediaAsset.objects.count(), 1)
        asset = MediaAsset.objects.first()
        self.assertIn('migration:unverified', asset.tags)

    @mock.patch('medialib.storage.build_variants', return_value={})
    @mock.patch('medialib.storage.fetch_image_bytes')
    def test_offline_dedups_on_shared_public_id_only(self, fetch_mock, variants_mock):
        from products.models import Product, ProductImage
        p = Product.objects.create(name='A', slug='a', image='products/a.jpg')
        # Same public_id referenced twice → collapses offline (no bytes needed).
        ProductImage.objects.create(product=p, image='products/a.jpg', order=1)
        self._run(offline=True)
        self.assertEqual(MediaAsset.objects.count(), 1)
        fetch_mock.assert_not_called()


# ── Phase 7 legacy dual-write bridge ──────────────────────────────────────────

@mock.patch('cloudinary.uploader.upload', side_effect=AssertionError('Cloudinary upload must NOT happen'))
class LegacyBridgeTests(TestCase):
    def setUp(self):
        self.client, self.user = _staff_client()

    def _asset(self, key):
        return MediaAsset.objects.create(storage_key=key, file_hash=key.ljust(64, 'x')[:64],
                                         original_filename='x.jpg', mime_type='image/jpeg',
                                         alt_text='denim')

    def _attach(self, atype, aid, media_ids, role):
        return self.client.post(f'/admin/medialib/api/{atype}/{aid}/attach/',
                                data={'media_ids': media_ids, 'role': role},
                                content_type='application/json')

    def test_attach_primary_writes_legacy_filefield(self, upload_mock):
        from products.models import Product
        p = Product.objects.create(name='P', slug='p')
        a = self._asset('media/products/foo')
        self._attach('product', p.id, [a.id], 'primary')

        self.assertTrue(MediaAttachment.objects.filter(
            media=a, attachable_type='product', attachable_id=p.id, role='primary').exists())
        p.refresh_from_db()
        self.assertEqual(p.image.name, 'media/products/foo')   # legacy field written
        upload_mock.assert_not_called()                        # no Cloudinary write

    def test_detach_primary_clears_legacy_filefield(self, upload_mock):
        from products.models import Product
        p = Product.objects.create(name='P', slug='p')
        a = self._asset('media/products/foo')
        self._attach('product', p.id, [a.id], 'primary')
        self.client.post(f'/admin/medialib/api/product/{p.id}/detach/',
                         data={'media_id': a.id}, content_type='application/json')

        self.assertFalse(MediaAttachment.objects.filter(media=a).exists())
        p.refresh_from_db()
        self.assertFalse(p.image)                              # legacy field cleared
        upload_mock.assert_not_called()

    def test_attach_gallery_creates_ordered_legacy_rows(self, upload_mock):
        from products.models import Product, ProductImage
        p = Product.objects.create(name='P', slug='p')
        a1 = self._asset('media/products/gallery/one')
        a2 = self._asset('media/products/gallery/two')
        self._attach('product', p.id, [a1.id, a2.id], 'gallery')

        rows = list(ProductImage.objects.filter(product=p).order_by('order'))
        self.assertEqual([r.image.name for r in rows],
                         ['media/products/gallery/one', 'media/products/gallery/two'])
        # sort_order reflected in legacy `order`
        atts = list(MediaAttachment.objects.filter(attachable_type='product', attachable_id=p.id)
                    .order_by('sort_order'))
        self.assertEqual([r.order for r in rows], [atts[0].sort_order, atts[1].sort_order])
        upload_mock.assert_not_called()

    def test_detach_gallery_removes_only_that_legacy_row(self, upload_mock):
        from products.models import Product, ProductImage
        p = Product.objects.create(name='P', slug='p')
        a1 = self._asset('media/products/gallery/one')
        a2 = self._asset('media/products/gallery/two')
        self._attach('product', p.id, [a1.id, a2.id], 'gallery')
        self.client.post(f'/admin/medialib/api/product/{p.id}/detach/',
                         data={'media_id': a1.id}, content_type='application/json')

        remaining = list(ProductImage.objects.filter(product=p))
        self.assertEqual([r.image.name for r in remaining], ['media/products/gallery/two'])
        upload_mock.assert_not_called()

    def test_reattach_is_idempotent_no_duplicate_rows(self, upload_mock):
        from products.models import Product, ProductImage
        p = Product.objects.create(name='P', slug='p')
        a = self._asset('media/products/gallery/one')
        self._attach('product', p.id, [a.id], 'gallery')
        self._attach('product', p.id, [a.id], 'gallery')  # again

        self.assertEqual(MediaAttachment.objects.filter(
            attachable_type='product', attachable_id=p.id, role='gallery').count(), 1)
        self.assertEqual(ProductImage.objects.filter(product=p).count(), 1)  # no dup legacy row
        upload_mock.assert_not_called()

    def test_bridge_leaves_purely_legacy_rows_untouched(self, upload_mock):
        """A ProductImage never in the library must survive a detach sync."""
        from products.models import Product, ProductImage
        p = Product.objects.create(name='P', slug='p')
        # Pre-existing legacy-only gallery row (no MediaAsset for it).
        ProductImage.objects.create(product=p, image='legacy/only.jpg', order=0)
        a = self._asset('media/products/gallery/one')
        self._attach('product', p.id, [a.id], 'gallery')
        self.client.post(f'/admin/medialib/api/product/{p.id}/detach/',
                         data={'media_id': a.id}, content_type='application/json')

        names = set(ProductImage.objects.filter(product=p).values_list('image', flat=True))
        self.assertIn('legacy/only.jpg', names)   # untouched
        upload_mock.assert_not_called()


# ── Cover and gallery are independent slots ───────────────────────────────────

@mock.patch('cloudinary.uploader.upload', side_effect=AssertionError('Cloudinary upload must NOT happen'))
class RoleScopedListingTests(TestCase):
    """
    The cover ('primary') and the gallery are separate slots on one product.

    Regression: the attachments endpoint ignored role, so both pickers in the
    product editor rendered the same combined list — and removing what looked
    like a gallery image detached the cover instead.
    """

    def setUp(self):
        self.client, self.user = _staff_client()
        from products.models import Product
        self.product = Product.objects.create(name='P', slug='p')

    def _asset(self, key):
        return MediaAsset.objects.create(storage_key=key, file_hash=key.ljust(64, 'x')[:64],
                                         original_filename='x.jpg', mime_type='image/jpeg')

    def _attach(self, media_ids, role):
        return self.client.post(f'/admin/medialib/api/product/{self.product.id}/attach/',
                                data={'media_ids': media_ids, 'role': role},
                                content_type='application/json')

    def _list(self, role=None):
        url = f'/admin/medialib/api/product/{self.product.id}/attachments/'
        if role:
            url += f'?role={role}'
        return self.client.get(url).json()['attachments']

    def test_each_role_lists_only_its_own_attachments(self, _upload):
        cover = self._asset('media/products/cover')
        g1    = self._asset('media/products/gallery/one')
        g2    = self._asset('media/products/gallery/two')
        self._attach([cover.id], 'primary')
        self._attach([g1.id, g2.id], 'gallery')

        self.assertEqual([a['media']['storage_key'] for a in self._list('primary')],
                         ['media/products/cover'])
        self.assertEqual([a['media']['storage_key'] for a in self._list('gallery')],
                         ['media/products/gallery/one', 'media/products/gallery/two'])
        # Unfiltered still returns everything, for callers that want all slots.
        self.assertEqual(len(self._list()), 3)

    def test_removing_a_gallery_image_leaves_the_cover(self, _upload):
        cover = self._asset('media/products/cover')
        g1    = self._asset('media/products/gallery/one')
        self._attach([cover.id], 'primary')
        self._attach([g1.id], 'gallery')

        gallery_att = self._list('gallery')[0]['id']
        self.client.post(f'/admin/medialib/api/product/{self.product.id}/detach/',
                         data={'attachment_id': gallery_att}, content_type='application/json')

        self.assertEqual([a['media']['storage_key'] for a in self._list('primary')],
                         ['media/products/cover'])
        self.product.refresh_from_db()
        self.assertEqual(self.product.image.name, 'media/products/cover')

    def test_replacing_the_cover_leaves_the_gallery(self, _upload):
        old   = self._asset('media/products/cover-old')
        new   = self._asset('media/products/cover-new')
        g1    = self._asset('media/products/gallery/one')
        self._attach([old.id], 'primary')
        self._attach([g1.id], 'gallery')
        self._attach([new.id], 'primary')          # single slot — replaces

        self.assertEqual([a['media']['storage_key'] for a in self._list('primary')],
                         ['media/products/cover-new'])
        self.assertEqual([a['media']['storage_key'] for a in self._list('gallery')],
                         ['media/products/gallery/one'])

    def test_same_asset_in_both_slots_detaches_independently(self, _upload):
        """A photo used as the cover AND in the gallery is two rows, not one."""
        a = self._asset('media/products/shared')
        self._attach([a.id], 'primary')
        self._attach([a.id], 'gallery')
        self.assertEqual(len(self._list()), 2)

        gallery_att = self._list('gallery')[0]['id']
        self.client.post(f'/admin/medialib/api/product/{self.product.id}/detach/',
                         data={'attachment_id': gallery_att}, content_type='application/json')

        self.assertEqual(self._list('gallery'), [])
        self.assertEqual([x['media']['storage_key'] for x in self._list('primary')],
                         ['media/products/shared'])
        self.product.refresh_from_db()
        self.assertEqual(self.product.image.name, 'media/products/shared')

    def test_unknown_role_is_rejected(self, _upload):
        r = self.client.get(f'/admin/medialib/api/product/{self.product.id}/attachments/?role=bogus')
        self.assertEqual(r.status_code, 400)

    def test_cover_is_a_single_slot_even_if_many_are_posted(self, _upload):
        """The server enforces one cover — the UI limit is not the only guard."""
        a = self._asset('media/products/one')
        b = self._asset('media/products/two')
        self._attach([a.id, b.id], 'primary')

        self.assertEqual([x['media']['storage_key'] for x in self._list('primary')],
                         ['media/products/one'])

    def test_a_multi_primary_entity_heals_on_the_next_cover_pick(self, _upload):
        """Rows predating the single-slot guard collapse to one, not accumulate."""
        a, b, c = (self._asset('media/products/a'), self._asset('media/products/b'),
                   self._asset('media/products/c'))
        for asset in (a, b):                       # simulate legacy multi-primary data
            MediaAttachment.objects.create(media=asset, attachable_type='product',
                                           attachable_id=self.product.id, role='primary')
        self.assertEqual(len(self._list('primary')), 2)

        self._attach([c.id], 'primary')
        self.assertEqual([x['media']['storage_key'] for x in self._list('primary')],
                         ['media/products/c'])
