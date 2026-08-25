from django.db import migrations
from django.utils.text import slugify


# The attributes the catalogue actually needs on day one, with the options that
# already appear in the existing product copy. Deliberately a starting set, not
# an exhaustive one — the whole point of these living in the database is that
# the admin adds the rest without a deploy.
SEED = [
    # (name, multi_select, [options])
    ('Fit', False, [
        'Slim Fit', 'Ankle Fit', 'Baggy Fit', 'Regular Fit', 'Straight Fit',
        'Relaxed Fit',
    ]),
    ('Fabric', False, [
        'Pure Cotton', 'Cotton Lycra', 'Linen', 'Linen Lycra', 'Oxford Lycra',
        'Denim', 'Poly Cotton',
    ]),
    # The one multi-select of the set: a style is routinely cut in several
    # lengths, where it has exactly one fit and one fabric.
    ('Length', True, ['36', '38', '39', '40', '42']),
    ('Wash', False, ['Bio Washed', 'Stone Washed', 'Enzyme Washed', 'Raw / Unwashed']),
    ('Style', False, ['6 Pocket Cargo', '5 Pocket', 'Jogger', 'Track Pant', 'Chino']),
]


def seed(apps, schema_editor):
    """
    Create the starting attributes and options.

    get_or_create throughout, so re-running is inert and an attribute the admin
    has already made by hand is adopted rather than duplicated.
    """
    Attribute = apps.get_model('products', 'Attribute')
    AttributeOption = apps.get_model('products', 'AttributeOption')

    for position, (name, multi, options) in enumerate(SEED):
        attribute, _ = Attribute.objects.get_or_create(
            slug=slugify(name),
            defaults={'name': name, 'multi_select': multi, 'order': position},
        )
        for index, value in enumerate(options):
            AttributeOption.objects.get_or_create(
                attribute=attribute, value=value, defaults={'order': index},
            )


def unseed(apps, schema_editor):
    """
    Remove the seeded attributes, but only those nothing is using.

    An attribute an admin has since attached to products is theirs, not ours —
    deleting it would strip those spec lines off every product that has one.
    Reversing this migration is a rollback of the feature, not permission to
    throw away catalogue data.
    """
    Attribute = apps.get_model('products', 'Attribute')
    for name, _multi, _options in SEED:
        attribute = Attribute.objects.filter(slug=slugify(name)).first()
        if attribute and not attribute.options.filter(products__isnull=False).exists():
            attribute.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0026_attribute_attributeoption_product_attribute_options'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
