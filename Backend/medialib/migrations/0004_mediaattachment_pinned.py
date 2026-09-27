from django.db import migrations, models


def pin_existing_product_videos(apps, schema_editor):
    # Product gallery clips were always shown whichever colour was selected.
    # Pinning them keeps that; photos stay unpinned, as they behaved before.
    MediaAttachment = apps.get_model('medialib', 'MediaAttachment')
    MediaAttachment.objects.filter(
        attachable_type='product', role='gallery', media__media_type='video',
    ).update(pinned=True)


class Migration(migrations.Migration):

    dependencies = [
        ('medialib', '0003_mediaasset_video'),
    ]

    operations = [
        migrations.AddField(
            model_name='mediaattachment',
            name='pinned',
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(pin_existing_product_videos, migrations.RunPython.noop),
    ]
