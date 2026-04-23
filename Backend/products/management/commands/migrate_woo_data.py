import csv
import os
import re
import requests
from django.core.management.base import BaseCommand, CommandError
from django.utils.text import slugify
from django.core.files.base import ContentFile
from accounts.models import CustomUser, Address
from products.models import Category, Product, ProductVariation


class Command(BaseCommand):
    help = "Migrate WooCommerce exported CSV data into Django models (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument('--products', type=str, help='Path to products CSV file')
        parser.add_argument('--users',    type=str, help='Path to users CSV file')
        parser.add_argument('--flush',    action='store_true', help='Delete all products before importing')

    def handle(self, *args, **options):
        if not options['products'] and not options['users']:
            raise CommandError("Provide --products and/or --users.")

        if options['flush'] and options['products']:
            self.stdout.write(self.style.WARNING("Flushing all products, variations and categories..."))
            ProductVariation.objects.all().delete()
            Product.objects.all().delete()
            Category.objects.all().delete()
            self.stdout.write(self.style.SUCCESS("Flush complete.\n"))

        if options['users']:
            self.migrate_users(options['users'])

        if options['products']:
            self.migrate_products(options['products'])

        self.stdout.write(self.style.SUCCESS("\nMigration complete."))

    def migrate_users(self, filepath):
        self._check_file(filepath)
        created = skipped = addr_created = 0

        with open(filepath, newline='', encoding='utf-8-sig') as f:
            rows = list(csv.DictReader(f))

        for row in rows:
            email = row.get('user_email', '').strip().lower()
            if not email:
                continue

            role = row.get('roles', '').strip().lower()
            if role and 'customer' not in role and 'subscriber' not in role:
                skipped += 1
                continue

            if CustomUser.objects.filter(email=email).exists():
                skipped += 1
                continue

            first   = (row.get('billing_first_name', '') or row.get('first_name', '')).strip()
            last    = (row.get('billing_last_name',  '') or row.get('last_name',  '')).strip()
            phone   = row.get('billing_phone', '').strip().lstrip('+').replace(' ', '')
            company = row.get('billing_company', '').strip() or None

            user = CustomUser(
                email           = email,
                username        = email,
                first_name      = first[:150],
                last_name       = last[:150],
                company_name    = company[:255] if company else None,
                phone_number    = phone[:15] if phone else None,
                gst_number      = None,
                is_verified_b2b = True,
            )
            user.set_unusable_password()
            user.save()
            created += 1

            # Billing address
            b_addr1 = row.get('billing_address_1', '').strip()
            b_city  = row.get('billing_city', '').strip()
            b_state = row.get('billing_state', '').strip()
            b_pin   = row.get('billing_postcode', '').strip()
            if b_addr1 and b_addr1.lower() != 'phone' and b_city and b_city.lower() != 'phone' and b_pin:
                Address.objects.create(
                    user                = user,
                    address_line_1      = b_addr1[:255],
                    address_line_2      = row.get('billing_address_2', '').strip()[:255] or None,
                    city                = b_city[:100],
                    state               = b_state[:100],
                    pincode             = b_pin[:10],
                    is_default_billing  = True,
                    is_default_shipping = False,
                )
                addr_created += 1

            # Shipping address (only if different from billing)
            s_addr1 = row.get('shipping_address_1', '').strip()
            s_city  = row.get('shipping_city', '').strip()
            s_state = row.get('shipping_state', '').strip()
            s_pin   = row.get('shipping_postcode', '').strip()
            if (s_addr1 and s_addr1.lower() != 'phone'
                    and s_city and s_city.lower() != 'phone'
                    and s_pin and s_addr1 != b_addr1):
                Address.objects.create(
                    user                = user,
                    address_line_1      = s_addr1[:255],
                    address_line_2      = row.get('shipping_address_2', '').strip()[:255] or None,
                    city                = s_city[:100],
                    state               = s_state[:100],
                    pincode             = s_pin[:10],
                    is_default_billing  = False,
                    is_default_shipping = True,
                )
                addr_created += 1

        self.stdout.write(self.style.SUCCESS(
            f"  Users     — created: {created} | skipped: {skipped} | addresses: {addr_created}"
        ))
        self.stdout.write(self.style.WARNING(
            "  NOTE: All imported users have unusable passwords. They must reset via 'Forgot Password'."
        ))

    def migrate_products(self, filepath):
        self._check_file(filepath)
        prod_created = var_created = var_skipped = img_ok = img_fail = 0

        with open(filepath, newline='', encoding='utf-8-sig') as f:
            rows = list(csv.DictReader(f))

        parent_map = {}
        for row in rows:
            if row.get('Type', '').strip().lower() != 'variable':
                continue
            name = row.get('Name', '').strip()
            if not name or 'AUTO-DRAFT' in name.upper():
                continue

            raw_cats  = row.get('Categories', '').strip()
            first_cat = raw_cats.split(',')[0].strip()
            cat_name  = first_cat.split('>')[0].strip() or 'Uncategorised'
            category, _ = Category.objects.get_or_create(
                slug=slugify(cat_name), defaults={'name': cat_name}
            )

            moq  = self._extract_moq(name)
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

            if not product.image:
                raw_images = row.get('Images', '').strip()
                first_url  = raw_images.split(',')[0].strip()
                clean_url  = first_url.split('?')[0].strip()
                if clean_url.startswith('http'):
                    if self._download_image(product, clean_url):
                        img_ok += 1
                    else:
                        img_fail += 1

            wc_id  = row.get('ID', '').strip()
            wc_sku = row.get('SKU', '').strip()
            if wc_id:
                parent_map[f"id:{wc_id}"] = product
                parent_map[wc_id]         = product
            if wc_sku:
                parent_map[wc_sku] = product

        self.stdout.write(self.style.SUCCESS(
            f"  Products  — created: {prod_created} | Images OK: {img_ok} | Failed: {img_fail}"
        ))

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
                var_skipped += 1
                continue

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
            f"  Variations — created: {var_created} | skipped/duplicate: {var_skipped}"
        ))

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

    def _check_file(self, filepath):
        if not os.path.exists(filepath):
            raise CommandError(f"File not found: {filepath}")