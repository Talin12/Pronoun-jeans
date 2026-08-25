"""
Tests for the JWT admin API (/api/admin/*) that powers the custom React panel.

The Django-admin picker and this API share medialib.services, but they are
different URL surfaces with different auth — a fix verified only against
/admin/medialib/api/* says nothing about what the React panel actually calls.
"""

from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from medialib.models import MediaAsset, MediaAttachment
from products.models import (
    Category, Color, Product, ProductVariation, SizeSet, SizeSetBreakdown,
)


def _superuser_client():
    User = get_user_model()
    u = User(email='root@test.com', username='root', is_staff=True,
             is_superuser=True, is_active=True)
    u.set_password('x')
    u.save()
    c = APIClient()
    c.force_authenticate(user=u)
    return c, u


@mock.patch('cloudinary.uploader.upload', side_effect=AssertionError('Cloudinary upload must NOT happen'))
class AdminMediaRoleScopingTests(TestCase):
    """The cover and gallery pickers in the React editor are separate slots."""

    def setUp(self):
        self.client, self.user = _superuser_client()
        self.product = Product.objects.create(name='P', slug='p')
        self.base = f'/api/admin/media/product/{self.product.id}'

    def _asset(self, key):
        return MediaAsset.objects.create(storage_key=key, file_hash=key.ljust(64, 'x')[:64],
                                         original_filename='x.jpg', mime_type='image/jpeg')

    def _attach(self, media_ids, role):
        r = self.client.post(f'{self.base}/attach/',
                             {'media_ids': media_ids, 'role': role}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        return r

    def _keys(self, role=None):
        url = f'{self.base}/attachments/' + (f'?role={role}' if role else '')
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200, r.content)
        return [a['media']['storage_key'] for a in r.json()['attachments']]

    def test_role_query_param_scopes_the_listing(self, _u):
        cover = self._asset('media/products/cover')
        g1    = self._asset('media/products/gallery/one')
        g2    = self._asset('media/products/gallery/two')
        self._attach([cover.id], 'primary')
        self._attach([g1.id, g2.id], 'gallery')

        self.assertEqual(self._keys('primary'), ['media/products/cover'])
        self.assertEqual(self._keys('gallery'),
                         ['media/products/gallery/one', 'media/products/gallery/two'])
        self.assertEqual(len(self._keys()), 3)      # unfiltered still returns all

    def test_removing_a_gallery_image_leaves_the_cover(self, _u):
        cover = self._asset('media/products/cover')
        g1    = self._asset('media/products/gallery/one')
        self._attach([cover.id], 'primary')
        self._attach([g1.id], 'gallery')

        att = self.client.get(f'{self.base}/attachments/?role=gallery').json()['attachments'][0]
        r = self.client.post(f'{self.base}/detach/', {'attachment_id': att['id']}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

        self.assertEqual(self._keys('gallery'), [])
        self.assertEqual(self._keys('primary'), ['media/products/cover'])
        self.product.refresh_from_db()
        self.assertEqual(self.product.image.name, 'media/products/cover')

    def test_cover_is_a_single_slot(self, _u):
        a = self._asset('media/products/one')
        b = self._asset('media/products/two')
        self._attach([a.id, b.id], 'primary')
        self.assertEqual(self._keys('primary'), ['media/products/one'])

    def test_unknown_role_is_rejected(self, _u):
        r = self.client.get(f'{self.base}/attachments/?role=bogus')
        self.assertEqual(r.status_code, 400)

    def test_requires_superuser(self, _u):
        User = get_user_model()
        plain = User(email='buyer@test.com', username='buyer', is_active=True)
        plain.set_password('x')
        plain.save()
        c = APIClient()
        c.force_authenticate(user=plain)
        r = c.get(f'{self.base}/attachments/?role=primary')
        self.assertIn(r.status_code, (401, 403))

    def test_reorder_within_a_role_leaves_the_other_alone(self, _u):
        cover = self._asset('media/products/cover')
        g1    = self._asset('media/products/gallery/one')
        g2    = self._asset('media/products/gallery/two')
        self._attach([cover.id], 'primary')
        self._attach([g1.id, g2.id], 'gallery')

        gallery = self.client.get(f'{self.base}/attachments/?role=gallery').json()['attachments']
        order   = [gallery[1]['id'], gallery[0]['id']]
        r = self.client.post(f'{self.base}/reorder/', {'order': order}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

        self.assertEqual(self._keys('gallery'),
                         ['media/products/gallery/two', 'media/products/gallery/one'])
        self.assertEqual(self._keys('primary'), ['media/products/cover'])
        self.product.refresh_from_db()
        self.assertEqual(self.product.image.name, 'media/products/cover')

    def test_attachment_rows_carry_their_role(self, _u):
        """The response must expose role, so a stale client is diagnosable."""
        cover = self._asset('media/products/cover')
        self._attach([cover.id], 'primary')
        rows = self.client.get(f'{self.base}/attachments/').json()['attachments']
        self.assertEqual(rows[0]['role'], 'primary')


class SizeSetAdminTests(TestCase):
    """
    The Size Sets page in the panel sidebar.

    Sets in use are deactivated, never deleted — ProductVariation.size_set is
    SET_NULL, so a delete would strip the size off live products.
    """

    def setUp(self):
        self.client, self.user = _superuser_client()
        self.url = '/api/admin/size-sets/'

    def _set(self, name, active=True, breakdowns=(('1xL, 1xXL', 2),)):
        ss = SizeSet.objects.create(name=name, is_active=active)
        for label, pieces in breakdowns:
            SizeSetBreakdown.objects.create(size_set=ss, label=label,
                                            breakdown_string=label, pieces=pieces)
        return ss

    def _variation(self, size_set, breakdown=None, sku='SKU-1'):
        product = Product.objects.create(name=f'P{sku}', slug=f'p{sku}'.lower())
        return ProductVariation.objects.create(
            product=product, size_set=size_set, size_breakdown=breakdown,
            sku=sku, b2b_price='100.00',
        )

    def _names(self, params=''):
        r = self.client.get(self.url + params)
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        rows = body if isinstance(body, list) else body.get('results', body)
        return [s['name'] for s in rows]

    def test_inactive_sets_are_hidden_by_default(self):
        self._set('ACTIVE ONE')
        self._set('RETIRED ONE', active=False)
        self.assertEqual(self._names(), ['ACTIVE ONE'])

    def test_include_inactive_shows_everything(self):
        self._set('ACTIVE ONE')
        self._set('RETIRED ONE', active=False)
        self.assertEqual(sorted(self._names('?include_inactive=true')),
                         ['ACTIVE ONE', 'RETIRED ONE'])

    def test_variation_count_is_reported(self):
        ss = self._set('L TO 3XL')
        self._variation(ss)
        r = self.client.get(self.url)
        row = (r.json() if isinstance(r.json(), list) else r.json()['results'])[0]
        self.assertEqual(row['variation_count'], 1)

    def test_deleting_a_set_in_use_is_refused(self):
        ss = self._set('L TO 3XL')
        self._variation(ss)
        r = self.client.delete(f'{self.url}{ss.id}/')
        self.assertEqual(r.status_code, 409)
        self.assertIn('Deactivate', r.json()['error'])
        self.assertTrue(SizeSet.objects.filter(pk=ss.id).exists())

    def test_deleting_an_unused_set_works(self):
        ss = self._set('UNUSED')
        r = self.client.delete(f'{self.url}{ss.id}/')
        self.assertEqual(r.status_code, 204)
        self.assertFalse(SizeSet.objects.filter(pk=ss.id).exists())

    def test_deactivating_keeps_it_off_the_dropdown_but_visible_here(self):
        ss = self._set('L TO 3XL')
        r = self.client.patch(f'{self.url}{ss.id}/', {'is_active': False}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self._names(), [])
        self.assertEqual(self._names('?include_inactive=true'), ['L TO 3XL'])

    def test_adding_a_breakdown_keeps_existing_ids(self):
        """A variation's breakdown must survive an edit of its size set."""
        ss = self._set('L TO 3XL')
        original = ss.breakdowns.get()
        variation = self._variation(ss, breakdown=original)

        r = self.client.patch(f'{self.url}{ss.id}/', {'breakdowns': [
            {'id': original.id, 'label': original.label,
             'breakdown_string': original.breakdown_string, 'pieces': original.pieces},
            {'label': '2xL, 2xXL', 'breakdown_string': '2xL, 2xXL', 'pieces': 4},
        ]}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

        self.assertEqual(ss.breakdowns.count(), 2)
        variation.refresh_from_db()
        self.assertEqual(variation.size_breakdown_id, original.id)   # not orphaned

    def test_renaming_a_breakdown_updates_in_place(self):
        ss = self._set('L TO 3XL')
        original = ss.breakdowns.get()
        r = self.client.patch(f'{self.url}{ss.id}/', {'breakdowns': [
            {'id': original.id, 'label': 'One of each',
             'breakdown_string': '1xL, 1xXL', 'pieces': 2},
        ]}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

        original.refresh_from_db()
        self.assertEqual(original.label, 'One of each')
        self.assertEqual(ss.breakdowns.count(), 1)

    def test_removing_an_unused_breakdown_works(self):
        ss = self._set('L TO 3XL', breakdowns=(('1xL, 1xXL', 2), ('2xL, 2xXL', 4)))
        keep = ss.breakdowns.order_by('id').first()
        r = self.client.patch(f'{self.url}{ss.id}/', {'breakdowns': [
            {'id': keep.id, 'label': keep.label,
             'breakdown_string': keep.breakdown_string, 'pieces': keep.pieces},
        ]}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(list(ss.breakdowns.values_list('id', flat=True)), [keep.id])

    def test_removing_a_breakdown_in_use_is_refused(self):
        ss = self._set('L TO 3XL', breakdowns=(('1xL, 1xXL', 2), ('2xL, 2xXL', 4)))
        used, other = ss.breakdowns.order_by('id')
        self._variation(ss, breakdown=used)

        r = self.client.patch(f'{self.url}{ss.id}/', {'breakdowns': [
            {'id': other.id, 'label': other.label,
             'breakdown_string': other.breakdown_string, 'pieces': other.pieces},
        ]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(ss.breakdowns.count(), 2)      # nothing removed

    def test_creating_a_set_with_a_breakdown(self):
        r = self.client.post(self.url, {
            'name': '30 TO 36',
            'breakdowns': [{'label': '1x30, 1x32', 'breakdown_string': '1x30, 1x32', 'pieces': 2}],
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        ss = SizeSet.objects.get(name='30 TO 36')
        self.assertEqual(ss.breakdowns.get().pieces, 2)

    def test_requires_superuser(self):
        User = get_user_model()
        plain = User(email='b@test.com', username='b', is_active=True)
        plain.set_password('x')
        plain.save()
        c = APIClient()
        c.force_authenticate(user=plain)
        self.assertIn(c.get(self.url).status_code, (401, 403))


class XxlRenameTests(TestCase):
    """
    The 0022 data migration renames XXL to 2XL in stored size text.

    Exercised through the same helpers the migration uses, so the tricky part —
    not mangling XXXL, and not colliding with existing rows — is pinned down.
    """

    def setUp(self):
        from products.migrations import __name__ as _  # noqa: F401
        import importlib
        self.mod = importlib.import_module('products.migrations.0022_size_xxl_to_2xl')

    def _sub(self, value):
        pattern, replacement = self.mod.XXL_TO_2XL
        return pattern.sub(replacement, value)

    def _unsub(self, value):
        pattern, replacement = self.mod.TWO_XL_TO_XXL
        return pattern.sub(replacement, value)

    def test_plain_xxl_is_renamed(self):
        self.assertEqual(self._sub('S TO XXL'), 'S TO 2XL')

    def test_xxl_inside_a_breakdown_is_renamed(self):
        self.assertEqual(self._sub('1xL, 1xXL, 1xXXL, 1x3XL'), '1xL, 1xXL, 1x2XL, 1x3XL')

    def test_xxxl_is_left_alone(self):
        """XXXL means 3XL and must not become X2XL."""
        self.assertEqual(self._sub('L TO XXXL'), 'L TO XXXL')
        self.assertEqual(self._sub('1xXXXL'), '1xXXXL')

    def test_xl_is_untouched(self):
        self.assertEqual(self._sub('1xL, 2xXL'), '1xL, 2xXL')

    def test_already_renamed_text_is_stable(self):
        self.assertEqual(self._sub('S TO 2XL'), 'S TO 2XL')

    def test_reverse_restores_the_old_spelling(self):
        for original in ('S TO XXL', '1xL, 1xXXL, 1x3XL'):
            self.assertEqual(self._unsub(self._sub(original)), original)

    def test_reverse_leaves_3xl_alone(self):
        self.assertEqual(self._unsub('1x3XL, 1x2XL'), '1x3XL, 1xXXL')

    def test_migration_renames_rows(self):
        ss = SizeSet.objects.create(name='S TO XXL')
        SizeSetBreakdown.objects.create(size_set=ss, label='1xL, 1xXXL',
                                        breakdown_string='1xL, 1xXXL', pieces=2)
        self.mod.forwards(_FakeApps(), None)

        ss.refresh_from_db()
        self.assertEqual(ss.name, 'S TO 2XL')
        row = ss.breakdowns.get()
        self.assertEqual(row.breakdown_string, '1xL, 1x2XL')
        self.assertEqual(row.label, '1xL, 1x2XL')

    def test_migration_skips_a_name_collision(self):
        """Both spellings already present: leave them, don't break uniqueness."""
        old = SizeSet.objects.create(name='S TO XXL')
        SizeSet.objects.create(name='S TO 2XL')
        self.mod.forwards(_FakeApps(), None)

        old.refresh_from_db()
        self.assertEqual(old.name, 'S TO XXL')          # untouched
        self.assertEqual(SizeSet.objects.count(), 2)


class _FakeApps:
    """Stands in for the migration's `apps` registry, using the real models."""

    def get_model(self, app_label, model_name):
        from django.apps import apps as django_apps
        return django_apps.get_model(app_label, model_name)


class ProductCodeTests(TestCase):
    """
    Product.code — a short admin-assigned code used as the SKU prefix.

    Without it the prefix came from the slug, which is derived from the full
    product name and makes long, unreadable SKUs.
    """

    def setUp(self):
        self.client, self.user = _superuser_client()
        self.url = '/api/admin/products/'

    def _create(self, **extra):
        payload = {'name': 'Urban Rise Track Pant', 'moq': 10}
        payload.update(extra)
        return self.client.post(self.url, payload, format='json')

    def test_code_is_saved_and_returned(self):
        r = self._create(code='PJ100')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['code'], 'PJ100')
        self.assertEqual(Product.objects.get().code, 'PJ100')

    def test_code_is_upper_cased_and_cleaned(self):
        r = self._create(code=' pj 100/a ')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['code'], 'PJ-100A')

    def test_blank_code_becomes_null(self):
        r = self._create(code='')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertIsNone(Product.objects.get().code)

    def test_two_products_may_both_have_no_code(self):
        """'' would trip the unique index on the second one; NULL does not."""
        self.assertEqual(self._create(code='').status_code, 201)
        r = self._create(name='Another Pant', code='')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Product.objects.filter(code__isnull=True).count(), 2)

    def test_duplicate_code_is_rejected(self):
        self.assertEqual(self._create(code='PJ100').status_code, 201)
        r = self._create(name='Another Pant', code='pj100')
        self.assertEqual(r.status_code, 400)
        self.assertIn('code', r.json())

    def test_a_product_keeps_its_own_code_on_update(self):
        pid = self._create(code='PJ100').json()['id']
        r = self.client.patch(f'{self.url}{pid}/', {'code': 'PJ100'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

    def test_code_is_used_as_the_sku_prefix(self):
        pid = self._create(code='PJ100').json()['id']
        color = Color.objects.create(name='Black', hex_code='#000000')
        r = self.client.post('/api/admin/variations/bulk/', {
            'product': pid, 'colors': [color.id], 'size_sets': [],
            'per_piece_price': '100.00', 'stock_quantity': 5,
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)

        skus = list(ProductVariation.objects.filter(product_id=pid).values_list('sku', flat=True))
        self.assertTrue(skus)
        self.assertTrue(all(s.startswith('PJ100_') for s in skus), skus)

    def test_slug_is_still_the_fallback_without_a_code(self):
        pid = self._create(code='').json()['id']
        color = Color.objects.create(name='Black', hex_code='#000000')
        r = self.client.post('/api/admin/variations/bulk/', {
            'product': pid, 'colors': [color.id], 'size_sets': [],
            'per_piece_price': '100.00', 'stock_quantity': 5,
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)

        sku = ProductVariation.objects.filter(product_id=pid).values_list('sku', flat=True)[0]
        self.assertTrue(sku.startswith('URBANRISETRACK'), sku)   # from the slug, as before


class SkuFormatTests(TestCase):
    """
    Variant SKUs read CODE_COLOUR_SIZESET_<n>PCS, e.g. 574_BLACK_30TO36_4PCS.

    Built automatically for every variant, from the same helper whether the
    variant came from the bulk builder or was added one at a time.
    """

    def setUp(self):
        self.client, self.user = _superuser_client()
        self.product = Product.objects.create(name='Denim Pant', slug='denim-pant', code='574')
        self.black   = Color.objects.create(name='Black', hex_code='#000000')
        self.size    = SizeSet.objects.create(name='30 TO 36')
        self.brk     = SizeSetBreakdown.objects.create(
            size_set=self.size, label='1x30, 1x32, 1x34, 1x36',
            breakdown_string='1x30, 1x32, 1x34, 1x36', pieces=4,
        )

    def test_the_documented_example(self):
        from adminapi.skus import build_sku
        self.assertEqual(
            build_sku(self.product, self.black, self.size, self.brk),
            '574_BLACK_30TO36_4PCS',
        )

    def test_bulk_builder_uses_the_format(self):
        r = self.client.post('/api/admin/variations/bulk/', {
            'product': self.product.id, 'colors': [self.black.id],
            'size_sets': [{'size_set': self.size.id, 'size_breakdown': self.brk.id}],
            'per_piece_price': '100.00', 'stock_quantity': 5,
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(ProductVariation.objects.get().sku, '574_BLACK_30TO36_4PCS')

    def test_single_variant_gets_the_same_sku(self):
        """A variant added one at a time must match the bulk builder."""
        r = self.client.post('/api/admin/variations/', {
            'product': self.product.id, 'color_palette': self.black.id,
            'size_set': self.size.id, 'size_breakdown': self.brk.id,
            'per_piece_price': '100.00', 'stock_quantity': 5,
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['sku'], '574_BLACK_30TO36_4PCS')

    def test_an_explicit_sku_is_kept(self):
        r = self.client.post('/api/admin/variations/', {
            'product': self.product.id, 'color_palette': self.black.id,
            'size_set': self.size.id, 'size_breakdown': self.brk.id,
            'sku': 'HAND-PICKED-1', 'per_piece_price': '100.00',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['sku'], 'HAND-PICKED-1')

    def test_spaces_are_stripped_from_every_part(self):
        from adminapi.skus import build_sku
        navy = Color.objects.create(name='Midnight Blue', hex_code='#001')
        self.assertEqual(
            build_sku(self.product, navy, self.size, self.brk),
            '574_MIDNIGHTBLUE_30TO36_4PCS',
        )

    def test_missing_parts_are_omitted_not_padded(self):
        from adminapi.skus import build_sku
        self.assertEqual(build_sku(self.product, None, self.size, self.brk),
                         '574_30TO36_4PCS')
        self.assertEqual(build_sku(self.product, self.black, None, None),
                         '574_BLACK')
        self.assertEqual(build_sku(self.product), '574')

    def test_slug_is_the_fallback_without_a_code(self):
        from adminapi.skus import build_sku
        coded = Product.objects.create(name='No Code', slug='no-code')
        self.assertEqual(build_sku(coded, self.black), 'NOCODE_BLACK')

    def test_a_clash_gets_a_numeric_suffix(self):
        from adminapi.skus import build_sku
        taken = {'574_BLACK_30TO36_4PCS'}
        self.assertEqual(build_sku(self.product, self.black, self.size, self.brk, taken=taken),
                         '574_BLACK_30TO36_4PCS_2')

    def test_two_breakdowns_of_one_set_both_get_a_sku(self):
        """Same set, different piece counts — the count keeps them apart."""
        eight = SizeSetBreakdown.objects.create(
            size_set=self.size, label='2x30, 2x32, 2x34, 2x36',
            breakdown_string='2x30, 2x32, 2x34, 2x36', pieces=8,
        )
        from adminapi.skus import build_sku
        self.assertEqual(build_sku(self.product, self.black, self.size, self.brk),
                         '574_BLACK_30TO36_4PCS')
        self.assertEqual(build_sku(self.product, self.black, self.size, eight),
                         '574_BLACK_30TO36_8PCS')


class SetPricingTests(TestCase):
    """
    Per-piece price is the only price entered; the set total is derived.

    b2b_price = per_piece_price × pieces in the breakdown, computed in
    ProductVariation.save() and read-only over the API so the two cannot
    disagree.
    """

    def setUp(self):
        self.client, self.user = _superuser_client()
        self.product = Product.objects.create(name='Denim Pant', slug='denim-pant', code='574')
        self.black   = Color.objects.create(name='Black', hex_code='#000000')
        self.size    = SizeSet.objects.create(name='30 TO 36')
        self.four    = SizeSetBreakdown.objects.create(
            size_set=self.size, label='1x30, 1x32, 1x34, 1x36',
            breakdown_string='1x30, 1x32, 1x34, 1x36', pieces=4)

    def _create(self, **extra):
        payload = {
            'product': self.product.id, 'color_palette': self.black.id,
            'size_set': self.size.id, 'size_breakdown': self.four.id,
            'per_piece_price': '250.00', 'stock_quantity': 5,
        }
        payload.update(extra)
        return self.client.post('/api/admin/variations/', payload, format='json')

    def test_set_price_is_per_piece_times_pieces(self):
        r = self._create()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['b2b_price'], '1000.00')      # 250 × 4

    def test_set_mrp_is_derived_too(self):
        r = self._create(mrp_per_piece='400.00')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['mrp'], '1600.00')            # 400 × 4

    def test_a_posted_set_price_is_ignored(self):
        """b2b_price is read-only — the calculation always wins."""
        r = self._create(b2b_price='1.00')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['b2b_price'], '1000.00')

    def test_per_piece_price_is_required_on_create(self):
        r = self._create(per_piece_price='')
        self.assertEqual(r.status_code, 400)
        self.assertIn('per_piece_price', r.json())

    def test_no_breakdown_counts_as_one_piece(self):
        r = self._create(size_breakdown=None)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['b2b_price'], '250.00')

    def test_changing_the_breakdown_reprices_the_set(self):
        eight = SizeSetBreakdown.objects.create(
            size_set=self.size, label='2x30, 2x32, 2x34, 2x36',
            breakdown_string='2x30, 2x32, 2x34, 2x36', pieces=8)
        vid = self._create().json()['id']

        r = self.client.patch(f'/api/admin/variations/{vid}/',
                              {'size_breakdown': eight.id}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['b2b_price'], '2000.00')      # 250 × 8

    def test_changing_the_per_piece_price_reprices_the_set(self):
        vid = self._create().json()['id']
        r = self.client.patch(f'/api/admin/variations/{vid}/',
                              {'per_piece_price': '300.00'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['b2b_price'], '1200.00')      # 300 × 4

    def test_editing_stock_alone_leaves_the_price_alone(self):
        vid = self._create().json()['id']
        r = self.client.patch(f'/api/admin/variations/{vid}/',
                              {'stock_quantity': 99}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['b2b_price'], '1000.00')

    def test_a_legacy_variant_without_a_per_piece_price_stays_editable(self):
        """Rows predating this rule must not demand a repricing to edit stock."""
        legacy = ProductVariation.objects.create(
            product=self.product, size_set=self.size, sku='LEGACY-1', b2b_price='900.00')
        r = self.client.patch(f'/api/admin/variations/{legacy.id}/',
                              {'stock_quantity': 7}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

    def test_bulk_builder_prices_each_variant_from_its_own_breakdown(self):
        eight = SizeSetBreakdown.objects.create(
            size_set=self.size, label='2x30, 2x32, 2x34, 2x36',
            breakdown_string='2x30, 2x32, 2x34, 2x36', pieces=8)
        r = self.client.post('/api/admin/variations/bulk/', {
            'product': self.product.id, 'colors': [self.black.id],
            'size_sets': [{'size_set': self.size.id, 'size_breakdown': eight.id}],
            'per_piece_price': '250.00', 'stock_quantity': 5,
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(ProductVariation.objects.get().b2b_price, Decimal('2000.00'))


class VariantEditTests(TestCase):
    """
    Editing one variant on its own.

    The bulk builder prices and stocks a whole colour × size grid identically,
    which is the right starting point and the wrong finishing one: stock moves
    per colour, and a size set that costs more to cut is priced per row. These
    cover the single-variant PATCH the panel's per-row editor uses.
    """

    def setUp(self):
        self.client, self.user = _superuser_client()
        self.product = Product.objects.create(name='Denim Pant', slug='denim-pant', code='574')
        self.black   = Color.objects.create(name='Black', hex_code='#000000')
        self.blue    = Color.objects.create(name='Blue', hex_code='#0000ff')
        self.size    = SizeSet.objects.create(name='30 TO 36')
        self.four    = SizeSetBreakdown.objects.create(
            size_set=self.size, label='1x30, 1x32, 1x34, 1x36',
            breakdown_string='1x30, 1x32, 1x34, 1x36', pieces=4)
        self.two     = SizeSetBreakdown.objects.create(
            size_set=self.size, label='1x30, 1x32',
            breakdown_string='1x30, 1x32', pieces=2)
        self.variant = ProductVariation.objects.create(
            product=self.product, color_palette=self.black, size_set=self.size,
            size_breakdown=self.four, sku='574_BLACK_30TO36_4PCS',
            per_piece_price=Decimal('250.00'), b2b_price=Decimal('1000.00'),
            stock_quantity=5,
        )

    def _patch(self, **data):
        return self.client.patch(f'/api/admin/variations/{self.variant.id}/',
                                 data, format='json')

    # ── stock ────────────────────────────────────────────────────────────────

    def test_stock_can_be_edited_on_its_own(self):
        """The common case: one colour sold out, the rest untouched."""
        r = self._patch(stock_quantity=42)
        self.assertEqual(r.status_code, 200, r.content)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 42)

    def test_a_stock_edit_does_not_disturb_the_price(self):
        """ProductVariation.save() recomputes the set total only when a pricing
        input changed. A stock edit that recalculated would overwrite a
        deliberately negotiated total with the formula result."""
        self.variant.b2b_price = Decimal('950.00')      # negotiated, not 250×4
        self.variant.save(update_fields=['b2b_price'])

        self._patch(stock_quantity=7)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.b2b_price, Decimal('950.00'))

    def test_stock_may_be_set_to_zero(self):
        r = self._patch(stock_quantity=0)
        self.assertEqual(r.status_code, 200, r.content)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 0)

    # ── pricing ──────────────────────────────────────────────────────────────

    def test_editing_the_per_piece_price_recomputes_the_set_total(self):
        r = self._patch(per_piece_price='300.00')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['b2b_price'], '1200.00')      # 300 × 4

    def test_editing_the_mrp_per_piece_recomputes_the_set_mrp(self):
        r = self._patch(mrp_per_piece='400.00')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['mrp'], '1600.00')            # 400 × 4

    def test_changing_the_breakdown_reprices_the_set(self):
        """Fewer pieces in the set means a smaller total at the same per-piece
        price — the panel lets the breakdown be changed, so this has to hold."""
        r = self._patch(size_breakdown=self.two.id)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['b2b_price'], '500.00')       # 250 × 2

    def test_a_posted_set_total_is_still_ignored(self):
        r = self._patch(b2b_price='1.00')
        self.assertEqual(r.status_code, 200, r.content)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.b2b_price, Decimal('1000.00'))

    # ── colour and SKU ───────────────────────────────────────────────────────

    def test_changing_the_colour_updates_the_denormalised_name(self):
        r = self._patch(color_palette=self.blue.id)
        self.assertEqual(r.status_code, 200, r.content)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.color, 'Blue')

    def test_clearing_the_sku_regenerates_it_from_the_new_colour(self):
        """A variant recoloured but still called ..._BLACK_... is a picking
        error waiting to happen. Blanking the field asks for a fresh one."""
        r = self._patch(color_palette=self.blue.id, sku='')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['sku'], '574_BLUE_30TO36_4PCS')

    def test_a_typed_sku_is_kept(self):
        r = self._patch(sku='CUSTOM-001')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['sku'], 'CUSTOM-001')

    def test_editing_a_variant_keeps_its_own_sku_available(self):
        """Regeneration excludes the row being edited from the taken set —
        otherwise re-saving an unchanged variant would collide with itself and
        get a -2 suffix."""
        r = self._patch(sku='', stock_quantity=9)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['sku'], '574_BLACK_30TO36_4PCS')

    def test_a_duplicate_sku_is_refused(self):
        ProductVariation.objects.create(
            product=self.product, color_palette=self.blue, size_set=self.size,
            size_breakdown=self.four, sku='TAKEN-1',
            per_piece_price=Decimal('250.00'), b2b_price=Decimal('1000.00'))
        r = self._patch(sku='TAKEN-1')
        self.assertEqual(r.status_code, 400, r.content)

    def test_moving_a_variant_onto_an_existing_combo_is_refused(self):
        """(product, size_set, color) is unique. The panel offers colour and
        size as editable fields, so this collision is reachable from the UI and
        has to come back as a 400, not a 500."""
        ProductVariation.objects.create(
            product=self.product, color_palette=self.blue, size_set=self.size,
            size_breakdown=self.four, sku='574_BLUE_30TO36_4PCS',
            per_piece_price=Decimal('250.00'), b2b_price=Decimal('1000.00'))

        r = self._patch(color_palette=self.blue.id, sku='')
        self.assertEqual(r.status_code, 400, r.content)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.color_palette_id, self.black.id)

    # ── permissions ──────────────────────────────────────────────────────────

    def test_requires_superuser(self):
        client = APIClient()
        r = client.patch(f'/api/admin/variations/{self.variant.id}/',
                         {'stock_quantity': 1}, format='json')
        self.assertIn(r.status_code, (401, 403))


class ProductBaseUpdateTests(TestCase):
    """
    Publishing must carry the Base Details with it.

    The panel used to send is_active on its own when publishing, so a MOQ typed
    and then published never reached the database and the storefront kept
    showing the old value. These pin the API contract the panel relies on.
    """

    def setUp(self):
        self.client, self.user = _superuser_client()
        self.product = Product.objects.create(name='Test 6', slug='test-6', moq=10)
        self.url = f'/api/admin/products/{self.product.id}/'

    def test_moq_can_be_lowered(self):
        r = self.client.patch(self.url, {'moq': 1}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.product.refresh_from_db()
        self.assertEqual(self.product.moq, 1)

    def test_publishing_carries_the_base_fields(self):
        """The payload the panel now sends when publishing."""
        r = self.client.patch(self.url, {
            'name': 'Test 6', 'code': 'PJ1001', 'moq': 1,
            'description': 'desc', 'fabric_details': 'cotton',
            'category': None, 'subcategories': [], 'is_active': True,
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)

        self.product.refresh_from_db()
        self.assertEqual(self.product.moq, 1)
        self.assertTrue(self.product.is_active)
        self.assertEqual(self.product.code, 'PJ1001')

    def test_toggling_active_alone_leaves_moq_alone(self):
        """The product-list Active switch sends only is_active."""
        self.client.patch(self.url, {'moq': 3}, format='json')
        r = self.client.patch(self.url, {'is_active': False}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

        self.product.refresh_from_db()
        self.assertEqual(self.product.moq, 3)
        self.assertFalse(self.product.is_active)

    def test_moq_is_returned_by_the_api(self):
        """The buyer page reads MOQ straight off the product payload."""
        self.client.patch(self.url, {'moq': 1, 'is_active': True}, format='json')
        r = self.client.get(self.url)
        self.assertEqual(r.json()['moq'], 1)


class ProductSeoFieldTests(TestCase):
    """
    The SEO fields ride along in the same Base Details payload as everything
    else, so the failure mode 41824f9 fixed — publishing dropping edits made on
    that step — must not come back through a new field.
    """

    def setUp(self):
        self.client, self.user = _superuser_client()
        self.product = Product.objects.create(name='Test SEO', slug='test-seo', moq=10)
        self.url = f'/api/admin/products/{self.product.id}/'

    def test_seo_fields_round_trip(self):
        r = self.client.patch(self.url, {
            'meta_title': 'Wholesale Cargo Pants in Bulk',
            'meta_description': 'Bulk cargo pants in ready size sets from Ahmedabad.',
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)

        self.product.refresh_from_db()
        self.assertEqual(self.product.meta_title, 'Wholesale Cargo Pants in Bulk')
        self.assertEqual(self.product.meta_description,
                         'Bulk cargo pants in ready size sets from Ahmedabad.')
        self.assertEqual(self.client.get(self.url).json()['meta_title'],
                         'Wholesale Cargo Pants in Bulk')

    def test_publishing_carries_the_seo_fields(self):
        """The full payload the panel sends when Publish is pressed."""
        r = self.client.patch(self.url, {
            'name': 'Test SEO', 'code': 'PJ2001', 'moq': 4,
            'description': 'desc', 'fabric_details': 'cotton',
            'category': None, 'subcategories': [], 'is_active': True,
            'meta_title': 'Hand-written title',
            'meta_description': 'Hand-written description.',
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)

        self.product.refresh_from_db()
        self.assertEqual(self.product.meta_title, 'Hand-written title')
        self.assertEqual(self.product.meta_description, 'Hand-written description.')
        self.assertEqual(self.product.moq, 4)
        self.assertTrue(self.product.is_active)

    def test_they_can_be_cleared_back_to_blank(self):
        """Blank is meaningful — it hands the page back to generated metadata."""
        self.product.meta_title = 'Something'
        self.product.meta_description = 'Something else'
        self.product.save()

        r = self.client.patch(self.url, {'meta_title': '', 'meta_description': ''}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

        self.product.refresh_from_db()
        self.assertEqual(self.product.meta_title, '')
        self.assertEqual(self.product.meta_description, '')

    def test_meta_title_is_length_limited(self):
        r = self.client.patch(self.url, {'meta_title': 'x' * 71}, format='json')
        self.assertEqual(r.status_code, 400, r.content)

    def test_meta_description_is_length_limited(self):
        r = self.client.patch(self.url, {'meta_description': 'x' * 161}, format='json')
        self.assertEqual(r.status_code, 400, r.content)

    def test_toggling_active_alone_leaves_seo_alone(self):
        """The product-list Active switch still sends only is_active."""
        self.client.patch(self.url, {'meta_title': 'Keep me'}, format='json')
        r = self.client.patch(self.url, {'is_active': False}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

        self.product.refresh_from_db()
        self.assertEqual(self.product.meta_title, 'Keep me')
        self.assertFalse(self.product.is_active)

    def test_updated_at_is_exposed_for_the_sitemap(self):
        self.assertIn('updated_at', self.client.get(self.url).json())


class CategoryDescriptionTests(TestCase):
    def setUp(self):
        self.client, self.user = _superuser_client()

    def test_description_round_trips(self):
        created = self.client.post('/api/admin/categories/', {
            'name': 'Cargo Pant',
            'description': 'Bulk cargo pants in ready size sets.',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.content)

        url = f"/api/admin/categories/{created.json()['id']}/"
        r = self.client.patch(url, {'description': 'Updated copy.'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.client.get(url).json()['description'], 'Updated copy.')

    def test_description_is_optional(self):
        r = self.client.post('/api/admin/categories/', {'name': 'Shorts'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['description'], '')


class CategoryDeleteGuardTests(TestCase):
    """
    Only a completely empty category can be deleted — no sub-categories, and
    no products.

    Nothing in the schema enforced either half. Product.category is SET_NULL
    and Product.subcategories is a plain M2M, so a delete quietly unfiled every
    product; and `parent` cascades, so it silently took the sub-categories with
    it. The API refuses with counts for both, so the panel can say what is in
    the way rather than only that something is.
    """

    def setUp(self):
        self.client, self.user = _superuser_client()
        self.men = Category.objects.create(name='Men', slug='men')
        self.boxers = Category.objects.create(name='Boxers', slug='boxers', parent=self.men)
        self.empty = Category.objects.create(name='Empty', slug='empty')

    def _delete(self, category):
        return self.client.delete(f'/api/admin/categories/{category.id}/')

    # ── refusals ─────────────────────────────────────────────────────────────

    def test_a_category_holding_products_is_refused(self):
        Product.objects.create(name='Jean', slug='jean', category=self.men)
        r = self._delete(self.men)

        self.assertEqual(r.status_code, 409, r.content)
        self.assertEqual(r.json()['product_count'], 1)
        self.assertTrue(Category.objects.filter(pk=self.men.pk).exists())

    def test_a_sub_category_holding_products_is_refused(self):
        product = Product.objects.create(name='Boxer', slug='boxer', category=self.men)
        product.subcategories.add(self.boxers)

        r = self._delete(self.boxers)
        self.assertEqual(r.status_code, 409, r.content)
        self.assertEqual(r.json()['product_count'], 1)

    def test_a_parent_is_refused_for_products_held_by_its_child(self):
        """`parent` cascades: deleting Men would delete Men → Boxers too, and
        unfile everything under it. The count has to see down the branch."""
        product = Product.objects.create(name='Boxer', slug='boxer', category=None)
        product.subcategories.add(self.boxers)

        r = self._delete(self.men)
        self.assertEqual(r.status_code, 409, r.content)
        self.assertEqual(r.json()['product_count'], 1)
        self.assertTrue(Category.objects.filter(pk=self.boxers.pk).exists())

    def test_a_product_filed_twice_is_counted_once(self):
        """Main category and sub-category both point at the branch — the admin
        should be told there is one product to fix, not two."""
        product = Product.objects.create(name='Jean', slug='jean', category=self.men)
        product.subcategories.add(self.boxers)

        r = self._delete(self.men)
        self.assertEqual(r.json()['product_count'], 1)

    def test_the_refusal_names_the_products(self):
        Product.objects.create(name='Slim Fit Jean', slug='slim', category=self.men)
        r = self._delete(self.men)
        self.assertIn('Slim Fit Jean', r.json()['product_names'])

    def test_the_message_says_what_is_inside_and_what_to_do(self):
        self.boxers.delete()
        Product.objects.create(name='Jean', slug='jean', category=self.men)
        message = self._delete(self.men).json()['error']

        self.assertIn('1 product', message)
        self.assertIn('Men', message)
        self.assertIn('completely empty', message)

    def test_the_message_does_not_mention_a_blocker_that_is_not_there(self):
        """"0 sub-categories" in a refusal is noise an admin has to decode."""
        self.boxers.delete()
        Product.objects.create(name='Jean', slug='jean', category=self.men)
        self.assertNotIn('sub-categor', self._delete(self.men).json()['error'])

    def test_one_product_is_not_reported_as_plural(self):
        self.boxers.delete()
        Product.objects.create(name='Jean', slug='jean', category=self.men)
        self.assertIn('1 product ', self._delete(self.men).json()['error'])

    def test_an_inactive_product_still_blocks(self):
        """Deactivated is not deleted — it is still filed here and would still
        be unfiled."""
        Product.objects.create(name='Old', slug='old', category=self.men, is_active=False)
        self.assertEqual(self._delete(self.men).status_code, 409)

    # ── what still deletes ───────────────────────────────────────────────────

    def test_an_empty_category_deletes(self):
        r = self._delete(self.empty)
        self.assertEqual(r.status_code, 204, r.content)
        self.assertFalse(Category.objects.filter(pk=self.empty.pk).exists())

    def test_a_parent_with_a_child_is_refused_even_when_both_are_empty(self):
        """`parent` cascades, so this delete would take the sub-category with
        it. Nothing is lost, but nobody asked for it to go — the branch comes
        apart from the bottom up so every step is one an admin can see."""
        r = self._delete(self.men)

        self.assertEqual(r.status_code, 409, r.content)
        self.assertEqual(r.json()['child_count'], 1)
        self.assertEqual(r.json()['product_count'], 0)
        self.assertTrue(Category.objects.filter(pk=self.boxers.pk).exists())

    def test_the_child_is_named(self):
        self.assertIn('Boxers', self._delete(self.men).json()['child_names'])

    def test_both_blockers_are_reported_together(self):
        Product.objects.create(name='Jean', slug='jean', category=self.men)
        body = self._delete(self.men).json()

        self.assertEqual(body['child_count'], 1)
        self.assertEqual(body['product_count'], 1)
        self.assertIn('1 sub-category and 1 product', body['error'])

    def test_a_parent_deletes_once_its_child_is_gone(self):
        """The path the message tells the admin to take, from the bottom up."""
        self.assertEqual(self._delete(self.men).status_code, 409)
        self.boxers.delete()
        self.assertEqual(self._delete(self.men).status_code, 204)

    def test_it_deletes_once_the_products_move_away(self):
        """The path the message tells the admin to take has to actually work."""
        self.boxers.delete()                       # empty the branch first
        product = Product.objects.create(name='Jean', slug='jean', category=self.men)
        self.assertEqual(self._delete(self.men).status_code, 409)

        product.category = self.empty
        product.save(update_fields=['category'])

        self.assertEqual(self._delete(self.men).status_code, 204)

    def test_a_product_elsewhere_does_not_block(self):
        self.boxers.delete()
        Product.objects.create(name='Jean', slug='jean', category=self.empty)
        self.assertEqual(self._delete(self.men).status_code, 204)

    def test_requires_superuser(self):
        client = APIClient()
        self.assertIn(client.delete(f'/api/admin/categories/{self.empty.id}/').status_code,
                      (401, 403))


class CategoryDjangoAdminDeleteGuardTests(TestCase):
    """
    The same rule on the Django admin, which would otherwise be a way around it.
    """

    def setUp(self):
        from django.contrib.admin.sites import AdminSite
        from django.test import RequestFactory
        from products.admin import CategoryAdmin

        self.admin = CategoryAdmin(Category, AdminSite())
        # A real request with a real superuser: has_delete_permission falls
        # through to Django's own permission check, which reads request.user.
        _, self.user = _superuser_client()
        self.request = RequestFactory().get('/admin/products/category/')
        self.request.user = self.user
        self.men = Category.objects.create(name='Men', slug='men')

    def test_delete_is_refused_for_a_category_in_use(self):
        Product.objects.create(name='Jean', slug='jean', category=self.men)
        self.assertFalse(self.admin.has_delete_permission(self.request, self.men))

    def test_delete_is_allowed_for_an_empty_category(self):
        self.assertTrue(self.admin.has_delete_permission(self.request, self.men))

    def test_delete_is_refused_for_a_category_with_a_sub_category(self):
        Category.objects.create(name='Boxers', slug='boxers', parent=self.men)
        self.assertFalse(self.admin.has_delete_permission(self.request, self.men))

    def test_the_bulk_delete_action_is_removed(self):
        """delete_selected checks the permission once with no object, so the
        per-object guard cannot see what it is about to remove — the action has
        to go rather than silently bypass the rule."""
        self.assertNotIn('delete_selected', self.admin.get_actions(self.request))


class ProductListFilterTests(TestCase):
    """
    The Products page's search, filter and sort controls.

    A catalogue of a few dozen products is already past the point where
    scrolling finds anything, and every one of these narrows or orders the same
    paginated list — so the count in the header and the page the admin lands on
    both depend on them being applied server-side rather than to one page.
    """

    def setUp(self):
        self.client, self.user = _superuser_client()
        self.men = Category.objects.create(name='Men', slug='men')
        self.boxers = Category.objects.create(name='Boxers', slug='boxers', parent=self.men)
        self.shorts = Category.objects.create(name='Shorts', slug='shorts')

        self.live = Product.objects.create(
            name='Alpha Trouser', slug='alpha', category=self.men, is_active=True)
        self.draft = Product.objects.create(
            name='Beta Boxer', slug='beta', category=self.boxers, is_active=False)
        self.other = Product.objects.create(
            name='Gamma Short', slug='gamma', category=self.shorts, is_active=True)

    def _list(self, **params):
        r = self.client.get('/api/admin/products/', params)
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def _names(self, **params):
        return [p['name'] for p in self._list(**params)['results']]

    # ── status ───────────────────────────────────────────────────────────────

    def test_active_only(self):
        self.assertEqual(sorted(self._names(is_active='true')),
                         ['Alpha Trouser', 'Gamma Short'])

    def test_inactive_only(self):
        self.assertEqual(self._names(is_active='false'), ['Beta Boxer'])

    def test_no_status_shows_both(self):
        self.assertEqual(len(self._names()), 3)

    def test_an_unrecognised_status_is_ignored_not_treated_as_false(self):
        """A typo showing every product is recoverable; one silently hiding
        every live product looks like the catalogue emptied itself."""
        self.assertEqual(len(self._names(is_active='yes')), 3)

    def test_the_count_reflects_the_filter(self):
        """The header count comes from here, so it has to be the filtered
        total rather than the page length."""
        self.assertEqual(self._list(is_active='false')['count'], 1)

    # ── category ─────────────────────────────────────────────────────────────

    def test_filtering_by_a_main_category_includes_its_sub_categories(self):
        """Picking "Men" has to bring back the products filed under Men →
        Boxers as well, or the filter hides products from the very category it
        claims to show."""
        self.assertEqual(sorted(self._names(category=self.men.id)),
                         ['Alpha Trouser', 'Beta Boxer'])

    def test_filtering_by_a_sub_category_is_narrow(self):
        self.assertEqual(self._names(category=self.boxers.id), ['Beta Boxer'])

    # ── sort ─────────────────────────────────────────────────────────────────

    def test_sort_by_name(self):
        self.assertEqual(self._names(ordering='name'),
                         ['Alpha Trouser', 'Beta Boxer', 'Gamma Short'])

    def test_sort_by_name_descending(self):
        self.assertEqual(self._names(ordering='-name'),
                         ['Gamma Short', 'Beta Boxer', 'Alpha Trouser'])

    def test_sort_by_variation_count(self):
        """variation_count is an annotation, not a column — ordering by it only
        works because it is declared on the viewset."""
        size = SizeSet.objects.create(name='30 TO 36')
        for i in range(3):
            ProductVariation.objects.create(
                product=self.other, size_set=size, color=f'C{i}',
                sku=f'SKU-{i}', b2b_price=Decimal('100.00'))
        ProductVariation.objects.create(
            product=self.live, size_set=size, color='Solo',
            sku='SKU-SOLO', b2b_price=Decimal('100.00'))

        self.assertEqual(self._names(ordering='-variation_count')[0], 'Gamma Short')
        self.assertEqual(self._names(ordering='variation_count')[0], 'Beta Boxer')

    def test_default_order_is_newest_first(self):
        self.assertEqual(self._names()[0], 'Gamma Short')

    # ── together ─────────────────────────────────────────────────────────────

    def test_filters_combine(self):
        """They narrow the same queryset — applying one must not drop another."""
        self.assertEqual(
            self._names(category=self.men.id, is_active='true', ordering='name'),
            ['Alpha Trouser'])

    def test_search_still_applies_alongside_a_filter(self):
        self.assertEqual(self._names(search='Boxer', is_active='false'), ['Beta Boxer'])

    def test_a_filter_that_matches_nothing_returns_an_empty_page(self):
        body = self._list(category=self.shorts.id, is_active='false')
        self.assertEqual(body['count'], 0)
        self.assertEqual(body['results'], [])
