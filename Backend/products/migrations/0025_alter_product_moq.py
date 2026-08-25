from django.db import migrations, models


def set_all_moq_to_one(apps, schema_editor):
    """
    Put every existing product on the new floor of 1.

    Changing the field default only affects products created afterwards, and
    the catalogue is full of products carrying 10 — the old default, which was
    never a decision anyone made per product. Leaving them would mean the same
    catalogue advertising two different minimums depending on when a product
    was added.
    """
    Product = apps.get_model('products', 'Product')
    Product.objects.exclude(moq=1).update(moq=1)


def unset(apps, schema_editor):
    """
    Deliberately does nothing.

    The forward pass overwrites each product's previous MOQ without recording
    it, so there is nothing to restore — reversing this migration returns the
    default to 10 for new products and leaves existing ones at 1. Anything that
    genuinely needs a higher minimum has to be set again by hand.
    """


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0024_category_description_category_updated_at_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='product',
            name='moq',
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.RunPython(set_all_moq_to_one, unset),
    ]
