"""
Model-level tests for the SEO fields and the alt-text defaults.

The API contract for the same fields lives in adminapi/tests.py; these pin the
behaviour that happens in save(), where the panel cannot see it.
"""

from django.test import TestCase

from .models import (
    ALT_TEXT_MAX, Category, Color, Product, ProductColorImage, ProductImage,
    default_alt_text,
)


class AltTextDefaultTests(TestCase):
    """
    Gallery images used to save with alt_text='' and nothing filled it in, so
    the storefront had a gallery of images no screen reader could describe.
    """

    def setUp(self):
        self.category = Category.objects.create(name='Cargo Pant', slug='cargo-pant')
        self.product = Product.objects.create(
            name='Urban Rise Cargo', slug='urban-rise-cargo', category=self.category,
        )
        self.color = Color.objects.create(name='Beige', hex_code='#D2B48C')

    def test_gallery_image_gets_a_default(self):
        image = ProductImage.objects.create(product=self.product, image='products/gallery/a.jpg')
        self.assertEqual(image.alt_text, 'Urban Rise Cargo — Cargo Pant')

    def test_an_explicit_alt_text_is_left_alone(self):
        image = ProductImage.objects.create(
            product=self.product, image='products/gallery/a.jpg',
            alt_text='Back pocket detail',
        )
        self.assertEqual(image.alt_text, 'Back pocket detail')

    def test_colour_image_names_its_colour(self):
        image = ProductColorImage.objects.create(
            product=self.product, color=self.color, image='products/colors/a.jpg',
        )
        self.assertEqual(image.alt_text, 'Urban Rise Cargo — Cargo Pant — Beige')

    def test_a_product_without_a_category_still_gets_alt_text(self):
        loose = Product.objects.create(name='Loose Product', slug='loose-product')
        image = ProductImage.objects.create(product=loose, image='products/gallery/b.jpg')
        self.assertEqual(image.alt_text, 'Loose Product')

    def test_alt_text_is_capped_to_the_column_width(self):
        long_name = 'X' * 400
        product = Product.objects.create(name=long_name, slug='very-long', category=self.category)
        self.assertEqual(len(default_alt_text(product)), ALT_TEXT_MAX)
        image = ProductImage.objects.create(product=product, image='products/gallery/c.jpg')
        self.assertLessEqual(len(image.alt_text), ALT_TEXT_MAX)

    def test_resaving_does_not_overwrite_the_default(self):
        image = ProductImage.objects.create(product=self.product, image='products/gallery/a.jpg')
        self.product.name = 'Renamed'
        self.product.save()
        image.save()
        self.assertEqual(image.alt_text, 'Urban Rise Cargo — Cargo Pant')


class SeoFieldTests(TestCase):
    def setUp(self):
        self.product = Product.objects.create(name='Test SEO', slug='test-seo')

    def test_meta_fields_default_to_blank(self):
        """Blank is what tells the storefront to generate its own metadata."""
        self.assertEqual(self.product.meta_title, '')
        self.assertEqual(self.product.meta_description, '')
        self.assertFalse(self.product.og_image)

    def test_updated_at_moves_on_save(self):
        """<lastmod> in the sitemap is only worth emitting if this is true."""
        first = self.product.updated_at
        self.product.name = 'Test SEO 2'
        self.product.save()
        self.product.refresh_from_db()
        self.assertGreater(self.product.updated_at, first)

    def test_category_description_defaults_to_blank(self):
        category = Category.objects.create(name='Shorts', slug='shorts')
        self.assertEqual(category.description, '')
        self.assertIsNotNone(category.updated_at)
