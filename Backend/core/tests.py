from unittest.mock import patch

from django.core.files.base import ContentFile
from django.test import SimpleTestCase

from core.storage import TimeoutMediaCloudinaryStorage, UPLOAD_TIMEOUT_SECONDS


class TimeoutMediaCloudinaryStorageTests(SimpleTestCase):
    """No DB access (SimpleTestCase) and cloudinary.uploader.upload is
    mocked, so this never touches the real database or Cloudinary."""

    @patch('core.storage.cloudinary.uploader.upload')
    def test_upload_passes_explicit_timeout(self, mock_upload):
        mock_upload.return_value = {'public_id': 'test/fake'}
        storage = TimeoutMediaCloudinaryStorage()

        storage._upload('products/test.jpg', ContentFile(b'fake image bytes'))

        self.assertEqual(mock_upload.call_count, 1)
        _, kwargs = mock_upload.call_args
        self.assertEqual(kwargs.get('timeout'), UPLOAD_TIMEOUT_SECONDS)
        self.assertEqual(kwargs.get('folder'), 'products')
