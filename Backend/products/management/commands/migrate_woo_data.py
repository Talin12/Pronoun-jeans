# Backend/products/management/commands/migrate_woo_data.py

import csv
import os
import re
import requests
from django.core.management.base import BaseCommand, CommandError
from django.utils.text import slugify
from django.core.files.base import ContentFile
from products.models import Category, Product, ProductVariation


class Command(BaseCommand):
    help = "Migrate WooCommerce exported CSV data into Django models (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument('--products', type=str, help='Path to products CSV file')
        parser.add_argument('--flush',    action='store_true', help='Delete all products before importing')

    def handle(self, *args, **options):
        if not options['products']:
            raise CommandError("--products <path> is required.")

        filepath = options['products']
        if not os.path.exists(filepath):
            raise CommandError(f"File not found: {filepath}")

        if options['flush']:
            self.stdout.write(self.style.WARNING("Flushing all existing products, variations and categories..."))
            ProductVariation.objects.all().delete()
            Product.objects.all().delete()
            Category.objects.all().delete()
            self.stdout.write(self.style.SUCCESS("Flush complete.\n"))

        self.migrate_products(filepath)
        self.stdout.write(self.style.SUCCESS("\nMigration complete."))

    def migrate_products(self, filepath):
        prod_created = var_created = var_skipped = img_ok = img_fail = 0

        with open(filepath, newline='', encoding='utf-8-sig') as f:
            rows = list(csv.DictReader(f))

        # ── Pass 1: variable rows → Products ──────────────────────────── #
        parent_map = {}

        for row in rows:
            if row.get('Type', '').strip().lower() != 'variable':
                continue

            name = row.get('Name', '').strip()
            if not name or 'AUTO-DRAFT' in name.upper():
                continue

            # Category — use the leaf-most top-level name before '>'
            raw_cats   = row.get('Categories', '').strip()
            first_cat  = raw_cats.split(',')[0].strip()
            cat_name   = first_cat.split('>')[0].strip() or 'Uncategorised'
            category, _ = Category.objects.get_or_create(
                slug=slugify(cat_name),
                defaults={'name': cat_name}
            )

            # MOQ from product name ("SET OF 4 PCS" etc.)
            moq = self._extract_moq(name)

            # Slug
            slug = self._unique_slug(name)

            product, p_created = Product.objects.get_or_create(
                slug=slug,
                defaults={
                    'name':           name,
                    'category':       category,
                    'description':    self._strip_html(row.get('Description', '')),
                    'fabric_details': row.get('Short description', '').strip() or None,
                    'is_active':      row.get('Published', '1').strip() == '1',
                    'moq':            moq,
                }
            )

            if p_created:
                prod_created += 1

            # Image — comma-separated list; take the first URL
            if not product.image:
                raw_images = row.get('Images', '').strip()
                first_url  = raw_images.split(',')[0].strip()
                # Strip query string (?wsr etc.)
                clean_url  = first_url.split('?')[0].strip()
                if clean_url.startswith('http'):
                    if self._download_image(product, clean_url):
                        img_ok += 1
                    else:
                        img_fail += 1

            wc_id = row.get('ID', '').strip()
            if wc_id:
                parent_map[f"id:{wc_id}"] = product
                parent_map[wc_id]         = product

            wc_sku = row.get('SKU', '').strip()
            if wc_sku:
                parent_map[wc_sku] = product

        self.stdout.write(self.style.SUCCESS(
            f"Products  — created: {prod_created} | "
            f"Images OK: {img_ok} | Images failed: {img_fail}"
        ))

        # ── Pass 2: variation rows → ProductVariations ────────────────── #
        for row in rows:
            if row.get('Type', '').strip().lower() != 'variation':
                continue

            name       = row.get('Name', '').strip()
            parent_ref = row.get('Parent', '').strip()
            size       = row.get('Attribute 1 value(s)', '').strip() or 'One Size'
            color      = row.get('Attribute 2 value(s)', '').strip() or 'Default'
            price_raw  = row.get('Regular price', '0').strip() or '0'

            if 'AUTO-DRAFT' in name.upper():
                var_skipped += 1
                continue

            product = parent_map.get(parent_ref)
            if not product:
                self.stdout.write(self.style.WARNING(
                    f"  Variation skipped — no parent for '{parent_ref}' (Name: {name[:40]})"
                ))
                var_skipped += 1
                continue

            # Generate SKU if missing: parentID_size_color
            sku = row.get('SKU', '').strip()
            if not sku:
                wc_id = parent_ref.replace('id:', '')
                sku   = slugify(f"{wc_id}-{size}-{color}")[:100]

            try:
                _, created = ProductVariation.objects.get_or_create(
                    sku=sku,
                    defaults={
                        'product':        product,
                        'size':           size,
                        'color':          color,
                        'b2b_price':      float(price_raw),
                        'stock_quantity': 0,
                    }
                )
                if created:
                    var_created += 1
                else:
                    var_skipped += 1

            except Exception as e:
                var_skipped += 1
                self.stdout.write(self.style.WARNING(f"  Variation error — {e}"))

        self.stdout.write(self.style.SUCCESS(
            f"Variations — created: {var_created} | skipped/duplicate: {var_skipped}"
        ))

    # ── Helpers ──────────────────────────────────────────────────────── #

    def _extract_moq(self, name):
        m = re.search(r'set\s+of\s+(\d+)\s+pcs?', name, re.IGNORECASE)
        return int(m.group(1)) if m else 10

    def _download_image(self, product, url):
        try:
            response = requests.get(url, timeout=15)
            response.raise_for_status()
            filename = url.split('/')[-1] or f"product_{product.id}.jpg"
            product.image.save(filename, ContentFile(response.content), save=True)
            self.stdout.write(f"    ✓ {filename}")
            return True
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"    ✗ Image failed for '{product.name}': {e}"))
            return False

    def _unique_slug(self, name):
        base = slugify(name)[:200]
        slug, n = base, 1
        while Product.objects.filter(slug=slug).exists():
            slug = f"{base}-{n}"
            n   += 1
        return slug

    def _strip_html(self, text):
        return re.sub(r'<[^>]+>', '', text).strip()