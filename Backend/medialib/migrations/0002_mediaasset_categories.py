from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0020_sizesetbreakdown_pieces_productcolorimage'),
        ('medialib', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='mediaasset',
            name='categories',
            field=models.ManyToManyField(
                blank=True,
                help_text='Library sections this image appears under.',
                related_name='media_assets',
                to='products.category',
            ),
        ),
    ]
