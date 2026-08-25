"""
Best-effort backfill: read the spec lines already sitting in each product's
description and turn them into attribute tags.

Deliberately a command and not a data migration. It is guessing — matching
"Fabric: Oxford Lycra (Stretchable & Durable)" against the Fabric options — and
a guess that runs automatically on deploy, against every product, with no
preview, is the kind of thing that quietly mis-tags a catalogue. So:

  * it prints what it would do and changes nothing unless --apply is passed;
  * it only ever adds tags, never removes one an admin chose;
  * it skips a product that already has a tag for that attribute;
  * it leaves the description untouched, so nothing is lost if the guess is
    wrong — the worst case is a tag to remove.

    python manage.py tag_attributes              # preview
    python manage.py tag_attributes --apply      # write
"""

import re

from django.core.management.base import BaseCommand

from products.models import Attribute, Product


def _normalise(text):
    """Lower-case, collapse whitespace — so 'Cotton  Lycra' matches 'cotton lycra'."""
    return re.sub(r'\s+', ' ', (text or '')).strip().lower()


class Command(BaseCommand):
    help = 'Tag products with attribute options found in their description text.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply', action='store_true',
            help='Write the tags. Without this the command only reports.',
        )
        parser.add_argument(
            '--product', type=int, default=None,
            help='Limit to one product id, for checking the matching first.',
        )

    def handle(self, *args, **options):
        apply_changes = options['apply']
        attributes = list(Attribute.objects.prefetch_related('options'))
        if not attributes:
            self.stdout.write(self.style.WARNING(
                'No attributes exist yet — run migrations first.'))
            return

        products = Product.objects.prefetch_related('attribute_options')
        if options['product']:
            products = products.filter(pk=options['product'])

        tagged = skipped = 0
        for product in products:
            matches = self._match(product, attributes)
            if not matches:
                continue

            already = {o.attribute_id for o in product.attribute_options.all()}
            # An attribute the admin has already answered is left alone: their
            # choice beats our guess, always.
            fresh = [o for o in matches if o.attribute_id not in already]
            if not fresh:
                skipped += 1
                continue

            self.stdout.write(
                f'{product.name[:60]:<60}  '
                + ', '.join(f'{o.attribute.name}={o.value}' for o in fresh)
            )
            if apply_changes:
                product.attribute_options.add(*fresh)
            tagged += 1

        self.stdout.write('')
        verb = 'Tagged' if apply_changes else 'Would tag'
        self.stdout.write(self.style.SUCCESS(f'{verb} {tagged} product(s).'))
        if skipped:
            self.stdout.write(f'{skipped} already tagged, left alone.')
        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                'Nothing was written. Re-run with --apply once the matches look right.'))

    def _match(self, product, attributes):
        """
        The options this product's text mentions, at most one per attribute.

        Longest value first, so "Cotton Lycra" wins over "Cotton" on a product
        that says "Cotton Lycra" — matching the shorter one first would tag
        every lycra blend as pure cotton.
        """
        haystack = _normalise(f'{product.description} {product.fabric_details}')
        if not haystack:
            return []

        found = []
        for attribute in attributes:
            options = sorted(attribute.options.all(),
                             key=lambda o: len(o.value), reverse=True)
            for option in options:
                # Word-bounded, so "40" does not match inside "1400" and "Linen"
                # does not match inside "Linens".
                if re.search(rf'\b{re.escape(_normalise(option.value))}\b', haystack):
                    found.append(option)
                    break            # one per attribute; the admin refines later
        return found
