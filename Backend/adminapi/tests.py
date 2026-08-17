"""
Tests for the JWT admin API (/api/admin/*) that powers the custom React panel.

The Django-admin picker and this API share medialib.services, but they are
different URL surfaces with different auth — a fix verified only against
/admin/medialib/api/* says nothing about what the React panel actually calls.
"""

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from medialib.models import MediaAsset, MediaAttachment
from products.models import (
    Product, ProductVariation, SizeSet, SizeSetBreakdown,
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
