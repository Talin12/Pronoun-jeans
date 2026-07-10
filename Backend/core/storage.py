import os

import cloudinary.uploader
from django.contrib.staticfiles.storage import ManifestStaticFilesStorage
from cloudinary_storage.storage import MediaCloudinaryStorage


class NonStrictManifestStaticFilesStorage(ManifestStaticFilesStorage):
    manifest_strict = False

    def hashed_name(self, name, content=None, filename=None):
        try:
            return super().hashed_name(name, content, filename)
        except ValueError:
            return name


# django-cloudinary-storage never passes a `timeout` to the Cloudinary API
# call, so a network blip on any single image upload can hang the request
# indefinitely — with several images saved synchronously in one admin POST
# (e.g. adding a product with multiple variations), that eventually exceeds
# the gunicorn worker timeout and the connection is killed with no HTTP
# response, which is what makes the browser show "Confirm Form Resubmission"
# on retry. Bounding each upload call lets a bad connection fail fast with a
# normal 500 instead.
UPLOAD_TIMEOUT_SECONDS = 30


class TimeoutMediaCloudinaryStorage(MediaCloudinaryStorage):
    def _upload(self, name, content):
        options = {
            'use_filename': True,
            'resource_type': self._get_resource_type(name),
            'tags': self.TAG,
            'timeout': UPLOAD_TIMEOUT_SECONDS,
        }
        folder = os.path.dirname(name)
        if folder:
            options['folder'] = folder
        return cloudinary.uploader.upload(content, **options)