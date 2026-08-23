"""
Model-level tests for the SEO fields and the alt-text defaults.

The API contract for the same fields lives in adminapi/tests.py; these pin the
behaviour that happens in save(), where the panel cannot see it.
"""

from django.core.cache import cache
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection

from .models import (
    ALT_TEXT_MAX, Category, Color, Product, ProductColorImage, ProductImage,
    ProductVariation, SizeSet, SizeSetBreakdown, default_alt_text,
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


class CatalogQueryCountTests(TestCase):
    """
    The catalog list serializes every product with all of its variations, and
    each variation reads size_set / size_breakdown / color_palette and its
    shared color gallery. Those must be prefetched so the query count stays
    flat as the number of variations grows — otherwise the endpoint N+1s until
    gunicorn times out and SIGKILLs the worker (production incident 2026-08-23).
    """

    def _make_product(self, slug, variation_count):
        category = Category.objects.create(name=f'Cat {slug}', slug=f'cat-{slug}')
        product = Product.objects.create(
            name=f'Product {slug}', slug=slug, category=category,
            image='products/hero.jpg',
        )
        size_set = SizeSet.objects.create(name=f'Set {slug}')
        breakdown = SizeSetBreakdown.objects.create(
            size_set=size_set, label='1xL, 1xXL', breakdown_string='1xL, 1xXL', pieces=2,
        )
        for i in range(variation_count):
            color = Color.objects.create(name=f'Color {slug} {i}', hex_code='#123456')
            ProductColorImage.objects.create(
                product=product, color=color, image=f'products/colors/{slug}-{i}.jpg',
            )
            ProductVariation.objects.create(
                product=product, size_set=size_set, size_breakdown=breakdown,
                color_palette=color, sku=f'{slug}-sku-{i}',
                b2b_price='100.00', per_piece_price='50.00',
                mrp='200.00', mrp_per_piece='100.00', stock_quantity=10,
            )
        return category

    def _catalog_query_count(self, category_slug):
        cache.clear()  # cache_page would otherwise serve later hits with 0 queries
        with CaptureQueriesContext(connection) as ctx:
            resp = self.client.get('/api/products/catalog/', {'category': category_slug})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)
        return len(ctx)

    def test_query_count_does_not_grow_with_variations(self):
        few = self._make_product('few', variation_count=2)
        many = self._make_product('many', variation_count=10)

        few_queries = self._catalog_query_count(few.slug)
        many_queries = self._catalog_query_count(many.slug)

        self.assertEqual(
            few_queries, many_queries,
            f'Catalog N+1: 2 variations took {few_queries} queries, '
            f'10 took {many_queries}. They must be equal.',
        )


class VariantVideoTests(TestCase):
    """
    A per-colour video attached to a variation must reach the storefront via
    the variation's `videos` field, and adding more of them must not add
    queries (the catalog would otherwise N+1 back into a worker timeout).
    """

    def _video_asset(self, key):
        from medialib.models import MediaAsset
        return MediaAsset.objects.create(
            storage_key=f'medialib/{key}', media_type='video',
            file_hash=key.ljust(64, '0'), original_filename=f'{key}.mp4',
            mime_type='video/mp4', duration=12.0,
            # Fully populated so serialization never calls out to Cloudinary.
            variants={
                'webm': f'https://cdn/{key}.webm', 'mp4': f'https://cdn/{key}.mp4',
                'poster': f'https://cdn/{key}-poster.jpg',
                'poster_thumb': f'https://cdn/{key}-thumb.jpg',
                'original': f'https://cdn/{key}-orig.mp4',
            },
        )

    def _variation_with_video(self, product, size_set, sku, video_key):
        from medialib.models import MediaAttachment
        color = Color.objects.create(name=f'C-{sku}', hex_code='#222222')
        variation = ProductVariation.objects.create(
            product=product, size_set=size_set, color_palette=color, sku=sku,
            b2b_price='100.00', stock_quantity=5,
        )
        MediaAttachment.objects.create(
            media=self._video_asset(video_key), attachable_type='variation',
            attachable_id=variation.id, role='gallery',
        )
        return variation

    def setUp(self):
        self.category = Category.objects.create(name='Joggers', slug='joggers')
        self.product = Product.objects.create(
            name='Trail Jogger', slug='trail-jogger', category=self.category,
            image='products/hero.jpg',
        )
        self.size_set = SizeSet.objects.create(name='M TO 2XL')

    def test_variation_video_reaches_the_storefront(self):
        self._variation_with_video(self.product, self.size_set, 'tj-black', 'vidblack')
        cache.clear()
        resp = self.client.get(f'/api/products/catalog/{self.product.slug}/')
        self.assertEqual(resp.status_code, 200)
        variation = resp.json()['variations'][0]
        self.assertEqual(len(variation['videos']), 1)
        media = variation['videos'][0]['media']
        self.assertEqual(media['media_type'], 'video')
        self.assertEqual(media['duration'], 12.0)
        # The <source> list the player needs, both codecs present.
        types = {s['type'] for s in media['sources']}
        self.assertEqual(types, {'video/webm', 'video/mp4'})

    def test_variation_videos_do_not_add_queries(self):
        self._variation_with_video(self.product, self.size_set, 'tj-a', 'vida')

        def count():
            cache.clear()
            with CaptureQueriesContext(connection) as ctx:
                resp = self.client.get(f'/api/products/catalog/{self.product.slug}/')
            self.assertEqual(resp.status_code, 200)
            return len(ctx)

        one_video = count()
        # Two more variations, each with its own video.
        self._variation_with_video(self.product, self.size_set, 'tj-b', 'vidb')
        self._variation_with_video(self.product, self.size_set, 'tj-c', 'vidc')
        three_videos = count()

        self.assertEqual(
            one_video, three_videos,
            f'Variant-video N+1: 1 video took {one_video} queries, '
            f'3 took {three_videos}. They must be equal.',
        )
