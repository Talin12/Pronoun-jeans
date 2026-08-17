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
from products.models import Product


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
