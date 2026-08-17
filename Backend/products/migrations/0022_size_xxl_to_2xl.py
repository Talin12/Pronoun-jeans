"""
Rename the XXL size to 2XL in existing data.

The size vocabulary now reads XL, 2XL, 3XL, 4XL rather than switching notation
at XXL. New sets are built from that scale, so without this the panel would show
2XL for anything created from now on and XXL for everything older.

Touches the three places size text is stored: SizeSet.name ("S TO XXL") and
SizeSetBreakdown.label / breakdown_string ("1xL, 1xXXL"). ProductVariation holds
no size text of its own — it points at these by FK — so nothing else needs it.

The match refuses XXL preceded by another X, leaving XXXL alone: that spelling
means 3XL and is handled by its own alias, not by this rename.

Rows whose renamed value would collide with one that already exists are left
untouched rather than dropped or renamed twice — SizeSet.name is unique and
SizeSetBreakdown is unique per (size_set, breakdown_string). Collisions are
printed so they can be merged by hand.
"""

import re

from django.db import migrations

XXL_TO_2XL = (re.compile(r'(?<!X)XXL'), '2XL')
# 'x' in "1x2XL" is lowercase, so it is not excluded by the [0-9X] guard.
TWO_XL_TO_XXL = (re.compile(r'(?<![0-9X])2XL'), 'XXL')


def _rewrite(apps, schema_editor, pattern, replacement):
    SizeSet = apps.get_model('products', 'SizeSet')
    SizeSetBreakdown = apps.get_model('products', 'SizeSetBreakdown')
    skipped = []

    taken_names = set(SizeSet.objects.values_list('name', flat=True))
    for size_set in SizeSet.objects.all():
        new_name = pattern.sub(replacement, size_set.name or '')
        if new_name == size_set.name:
            continue
        if new_name in taken_names:
            skipped.append(f'SizeSet "{size_set.name}" → "{new_name}" (name already exists)')
            continue
        taken_names.discard(size_set.name)
        taken_names.add(new_name)
        size_set.name = new_name
        size_set.save(update_fields=['name'])

    taken_strings = set(
        SizeSetBreakdown.objects.values_list('size_set_id', 'breakdown_string')
    )
    for row in SizeSetBreakdown.objects.all():
        new_label  = pattern.sub(replacement, row.label or '')
        new_string = pattern.sub(replacement, row.breakdown_string or '')
        if new_label == row.label and new_string == row.breakdown_string:
            continue
        if new_string != row.breakdown_string and (row.size_set_id, new_string) in taken_strings:
            skipped.append(
                f'Breakdown "{row.breakdown_string}" on size set {row.size_set_id} '
                f'→ "{new_string}" (already exists on that set)'
            )
            continue
        taken_strings.discard((row.size_set_id, row.breakdown_string))
        taken_strings.add((row.size_set_id, new_string))
        row.label, row.breakdown_string = new_label, new_string
        row.save(update_fields=['label', 'breakdown_string'])

    if skipped:
        print('\n  Left unchanged — rename would collide with an existing row:')
        for line in skipped:
            print(f'    - {line}')


def forwards(apps, schema_editor):
    _rewrite(apps, schema_editor, *XXL_TO_2XL)


def backwards(apps, schema_editor):
    _rewrite(apps, schema_editor, *TWO_XL_TO_XXL)


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0021_alter_sizesetbreakdown_label_and_more'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
