from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Video support for the media library.

    Additive and back-fill-free: media_type defaults to 'image', which is what
    every existing row already is, so no data migration is needed and the column
    is correct the moment it exists.
    """

    dependencies = [
        ('medialib', '0002_mediaasset_categories'),
    ]

    operations = [
        migrations.AddField(
            model_name='mediaasset',
            name='media_type',
            field=models.CharField(
                choices=[('image', 'Image'), ('video', 'Video')],
                db_index=True,
                default='image',
                max_length=8,
            ),
        ),
        migrations.AddField(
            model_name='mediaasset',
            name='duration',
            field=models.FloatField(
                blank=True,
                help_text='Seconds (video only)',
                null=True,
            ),
        ),
    ]
