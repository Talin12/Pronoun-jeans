"""
Tests for the Google Merchant Center push (products/merchant.py).

The payload shape is pinned against the listings the client built by hand in
the Merchant Center UI: MRP as the price, the wholesale rate as the sale
price, and the homepage as the landing page. Those three are the contract —
if one of them changes, the listings stop matching what is already live.

Nothing here touches the network. `enabled()` is false without credentials,
which is also what makes the whole feature inert in CI.
"""

from decimal import Decimal
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings

from products import merchant
from products.models import (
    Category, Color, Product, ProductVariation, SizeSet, SizeSetBreakdown,
)

MERCHANT_ON = dict(
    MERCHANT_ACCOUNT_ID='5532741007',
    MERCHANT_DATA_SOURCE_ID='104628',
    MERCHANT_SERVICE_ACCOUNT_JSON='{"type": "service_account"}',
    MERCHANT_FEED_LABEL='IN',
    MERCHANT_CONTENT_LANGUAGE='en',
    MERCHANT_CURRENCY='INR',
    MERCHANT_BRAND='PRO-NOUN',
    MERCHANT_LANDING_URL='https://www.pronounjeans.com/',
    MERCHANT_PRICE_BASIS='per_piece',
)


class MerchantPayloadTests(TestCase):
    """What gets sent, built from the same row the storefront reads."""

    def setUp(self):
        cache.clear()
        self.category = Category.objects.create(name='Mens Cargo Pant', slug='mens-cargo-pant')
        self.product = Product.objects.create(
            name='D. NO 1891 MENS LINEN CARGO PANT',
            slug='d-no-1891-mens-linen-cargo-pant',
            code='PJ1891',
            category=self.category,
            description='Travel wear cargo track pants.',
            fabric_details='Oxford Lycra.',
            image='products/1891.jpg',
            list_on_merchant=True,
        )
        self.size_set = SizeSet.objects.create(name='L TO 3XL')
        # Four pieces to a set, so ProductVariation.save() computes the set
        # totals as 4x the per-piece figures — 1299 -> 5196, 645 -> 2580.
        # Setting mrp directly would not survive that recalculation.
        self.breakdown = SizeSetBreakdown.objects.create(
            size_set=self.size_set, label='1xL, 1xXL, 1x2XL, 1x3XL',
            breakdown_string='1xL, 1xXL, 1x2XL, 1x3XL', pieces=4,
        )
        self.colour = Color.objects.create(name='LT-GREY', hex_code='#CCCCCC')
        self.variation = ProductVariation.objects.create(
            product=self.product, size_set=self.size_set,
            size_breakdown=self.breakdown, color_palette=self.colour,
            sku='PJ1891_LTGREY_L3XL',
            per_piece_price=Decimal('645.00'), mrp_per_piece=Decimal('1299.00'),
            stock_quantity=12,
        )

    def payload(self):
        self.product.refresh_from_db()
        return merchant.build_payload(self.product)

    @override_settings(**MERCHANT_ON)
    def test_identity_matches_the_account_feed(self):
        body = self.payload()
        self.assertEqual(body['offerId'], 'PJ1891')
        self.assertEqual(body['contentLanguage'], 'en')
        self.assertEqual(body['feedLabel'], 'IN')

    @override_settings(**MERCHANT_ON)
    def test_mrp_is_the_price_and_wholesale_is_the_sale_price(self):
        attrs = self.payload()['productAttributes']
        self.assertEqual(attrs['price'], {'amountMicros': '1299000000', 'currencyCode': 'INR'})
        self.assertEqual(attrs['salePrice'], {'amountMicros': '645000000', 'currencyCode': 'INR'})

    @override_settings(**dict(MERCHANT_ON, MERCHANT_PRICE_BASIS='set'))
    def test_the_set_basis_reads_the_set_totals_instead(self):
        attrs = self.payload()['productAttributes']
        self.assertEqual(attrs['price']['amountMicros'], '5196000000')
        self.assertEqual(attrs['salePrice']['amountMicros'], '2580000000')

    @override_settings(**MERCHANT_ON)
    def test_a_sale_price_at_or_above_the_mrp_is_dropped(self):
        """Google rejects a discount that costs more, and so should we."""
        self.variation.per_piece_price = Decimal('1500.00')
        self.variation.save()
        self.assertNotIn('salePrice', self.payload()['productAttributes'])

    @override_settings(**MERCHANT_ON)
    def test_the_landing_page_is_the_homepage(self):
        """
        Deliberate. Product pages carry no price, because wholesale rates are
        gated, so a crawler reaching one would find nothing matching the feed.
        Pointing at real product URLs needs public prices there first.
        """
        self.assertEqual(
            self.payload()['productAttributes']['link'],
            'https://www.pronounjeans.com/',
        )

    @override_settings(**MERCHANT_ON)
    def test_stock_drives_availability(self):
        self.assertEqual(self.payload()['productAttributes']['availability'], 'IN_STOCK')
        self.variation.stock_quantity = 0
        self.variation.save()
        self.assertEqual(self.payload()['productAttributes']['availability'], 'OUT_OF_STOCK')

    @override_settings(**MERCHANT_ON)
    def test_the_sku_is_published_as_the_part_number(self):
        attrs = self.payload()['productAttributes']
        self.assertEqual(attrs['mpn'], 'PJ1891_LTGREY_L3XL')
        self.assertNotIn('identifierExists', attrs)

    @override_settings(**MERCHANT_ON)
    def test_gender_comes_from_the_category(self):
        self.assertEqual(self.payload()['productAttributes']['gender'], 'MALE')
        self.category.name = 'Womens Cargo Pant'
        self.category.save()
        self.assertEqual(self.payload()['productAttributes']['gender'], 'FEMALE')

    @override_settings(**MERCHANT_ON)
    def test_an_uncategorised_product_is_unisex_rather_than_guessed(self):
        self.category.name = 'Travel Wear'
        self.category.save()
        self.assertEqual(self.payload()['productAttributes']['gender'], 'UNISEX')

    @override_settings(**MERCHANT_ON)
    def test_colour_and_size_come_from_the_variation(self):
        attrs = self.payload()['productAttributes']
        self.assertEqual(attrs['color'], 'LT-GREY')
        self.assertEqual(attrs['size'], 'L TO 3XL')

    @override_settings(**MERCHANT_ON)
    def test_the_condition_and_brand_are_fixed(self):
        attrs = self.payload()['productAttributes']
        self.assertEqual(attrs['condition'], 'NEW')
        self.assertEqual(attrs['brand'], 'PRO-NOUN')

    @override_settings(**MERCHANT_ON)
    def test_a_product_without_an_mrp_is_refused_with_a_fixable_reason(self):
        self.variation.mrp = None
        self.variation.mrp_per_piece = None
        self.variation.save()
        with self.assertRaises(ValueError) as caught:
            self.payload()
        self.assertIn('MRP', str(caught.exception))

    @override_settings(**MERCHANT_ON)
    def test_a_product_without_an_image_is_refused(self):
        self.product.image = None
        self.product.save()
        with self.assertRaises(ValueError) as caught:
            self.payload()
        self.assertIn('image', str(caught.exception).lower())

    @override_settings(**MERCHANT_ON)
    def test_a_product_without_variations_is_refused(self):
        self.variation.delete()
        with self.assertRaises(ValueError):
            self.payload()


class MerchantOfferIdTests(TestCase):
    """
    The offer ID is the listing's key at Google. If it moved when a product
    was renamed, the old listing would be stranded and a duplicate published
    beside it.
    """

    def setUp(self):
        cache.clear()
        self.product = Product.objects.create(name='Urban Rise', slug='urban-rise', code='PJ100')

    def test_it_prefers_the_product_code(self):
        self.assertEqual(merchant.offer_id_for(self.product), 'PJ100')

    def test_it_falls_back_to_the_slug(self):
        product = Product.objects.create(name='No Code', slug='no-code')
        self.assertEqual(merchant.offer_id_for(product), 'no-code')

    def test_it_survives_a_rename(self):
        first = merchant.offer_id_for(self.product)
        self.product.code = 'PJ999'
        self.product.slug = 'renamed-entirely'
        self.product.save()
        self.assertEqual(merchant.offer_id_for(self.product), first)

    def test_it_is_persisted_on_first_use(self):
        merchant.offer_id_for(self.product)
        self.product.refresh_from_db()
        self.assertEqual(self.product.merchant_offer_id, 'PJ100')

    def test_a_collision_is_broken_with_the_pk(self):
        """
        Two products cannot share an offer ID: the second listing would
        overwrite the first at Google.
        """
        later = Product.objects.create(name='Clash', slug='clash', code='PJ200')
        # An offer ID already occupying the string PJ200 would compute for.
        Product.objects.filter(pk=self.product.pk).update(merchant_offer_id='PJ200')
        assigned = merchant.offer_id_for(later)
        self.assertNotEqual(assigned, 'PJ200')
        self.assertIn(str(later.pk), assigned)


class MerchantSyncTests(TestCase):
    """Deciding whether to publish, withdraw, or stay out of it entirely."""

    def setUp(self):
        cache.clear()
        self.category = Category.objects.create(name='Shorts', slug='shorts')
        self.product = Product.objects.create(
            name='Denim Short', slug='denim-short', code='PJ200',
            category=self.category, image='products/s.jpg', list_on_merchant=True,
        )
        size_set = SizeSet.objects.create(name='M TO XL')
        ProductVariation.objects.create(
            product=self.product, size_set=size_set, sku='PJ200_M_XL',
            b2b_price=Decimal('465.00'), per_piece_price=Decimal('465.00'),
            mrp=Decimal('949.00'), mrp_per_piece=Decimal('949.00'),
            stock_quantity=5,
        )

    def test_nothing_is_sent_when_the_credentials_are_missing(self):
        """The default for local development and CI: entirely offline."""
        self.assertFalse(merchant.enabled())
        with mock.patch('products.merchant.push') as push:
            self.assertEqual(merchant.sync(self.product), '')
            push.assert_not_called()

    @override_settings(**MERCHANT_ON)
    def test_a_listed_product_is_pushed(self):
        with mock.patch('products.merchant.push', return_value='') as push:
            self.assertEqual(merchant.sync(self.product), '')
            push.assert_called_once_with(self.product)
        self.product.refresh_from_db()
        self.assertIsNotNone(self.product.merchant_synced_at)
        self.assertEqual(self.product.merchant_sync_error, '')

    @override_settings(**MERCHANT_ON)
    def test_an_unlisted_product_is_withdrawn(self):
        self.product.list_on_merchant = False
        with mock.patch('products.merchant.remove', return_value='') as remove:
            merchant.sync(self.product)
            remove.assert_called_once_with(self.product)

    @override_settings(**MERCHANT_ON)
    def test_an_inactive_product_is_withdrawn_even_when_listed(self):
        """A draft that kept advertising itself would send buyers nowhere."""
        self.product.is_active = False
        with mock.patch('products.merchant.remove', return_value='') as remove:
            merchant.sync(self.product)
            remove.assert_called_once_with(self.product)

    @override_settings(**MERCHANT_ON)
    def test_a_failure_is_recorded_on_the_row_not_just_logged(self):
        with mock.patch('products.merchant.push', return_value='HTTP 400: bad price'):
            self.assertEqual(merchant.sync(self.product), 'HTTP 400: bad price')
        self.product.refresh_from_db()
        self.assertEqual(self.product.merchant_sync_error, 'HTTP 400: bad price')
        self.assertIsNone(self.product.merchant_synced_at)

    @override_settings(**MERCHANT_ON)
    def test_an_unexpected_exception_is_captured_rather_than_raised(self):
        """A product save must never fail because Google had a bad day."""
        with mock.patch('products.merchant.push', side_effect=RuntimeError('socket closed')):
            error = merchant.sync(self.product)
        self.assertIn('socket closed', error)
        self.product.refresh_from_db()
        self.assertIn('socket closed', self.product.merchant_sync_error)

    @override_settings(**MERCHANT_ON)
    def test_a_fixable_payload_problem_reads_as_advice(self):
        self.product.variations.all().delete()
        error = merchant.sync(self.product)
        self.assertIn('no variations', error.lower())


class MerchantTransportTests(TestCase):
    """The HTTP shape, without going near the network."""

    def setUp(self):
        cache.clear()
        self.product = Product.objects.create(
            name='Lounge Pant', slug='lounge-pant', code='PJ300',
            image='products/l.jpg', list_on_merchant=True,
        )
        size_set = SizeSet.objects.create(name='M TO 2XL')
        ProductVariation.objects.create(
            product=self.product, size_set=size_set, sku='PJ300_M_2XL',
            b2b_price=Decimal('500.00'), per_piece_price=Decimal('500.00'),
            mrp=Decimal('999.00'), mrp_per_piece=Decimal('999.00'),
            stock_quantity=3,
        )

    @override_settings(**MERCHANT_ON)
    def test_insert_targets_the_merchant_api_not_the_sunset_content_api(self):
        """
        Content API for Shopping was sunset on 18 August 2026. Pointing this
        back at shoppingcontent.googleapis.com would fail outright.
        """
        with mock.patch('products.merchant._access_token', return_value='tok'), \
             mock.patch('requests.post') as post:
            post.return_value = mock.Mock(status_code=200)
            merchant.push(self.product)

        url = post.call_args[0][0]
        self.assertTrue(url.startswith('https://merchantapi.googleapis.com/products/v1/'))
        self.assertTrue(url.endswith('accounts/5532741007/productInputs:insert'))
        self.assertEqual(
            post.call_args[1]['params']['dataSource'],
            'accounts/5532741007/dataSources/104628',
        )

    @override_settings(**MERCHANT_ON)
    def test_an_api_error_comes_back_as_a_readable_message(self):
        with mock.patch('products.merchant._access_token', return_value='tok'), \
             mock.patch('requests.post') as post:
            post.return_value = mock.Mock(
                status_code=400,
                json=mock.Mock(return_value={'error': {'message': 'price is required'}}),
            )
            error = merchant.push(self.product)
        self.assertEqual(error, 'HTTP 400: price is required')

    @override_settings(**MERCHANT_ON)
    def test_delete_uses_the_language_feed_offer_resource_name(self):
        merchant.offer_id_for(self.product)
        with mock.patch('products.merchant._access_token', return_value='tok'), \
             mock.patch('requests.delete') as delete:
            delete.return_value = mock.Mock(status_code=200)
            merchant.remove(self.product)

        self.assertTrue(
            delete.call_args[0][0].endswith(
                'accounts/5532741007/productInputs/en~IN~PJ300'
            )
        )

    @override_settings(**MERCHANT_ON)
    def test_deleting_something_google_already_lost_is_not_a_failure(self):
        merchant.offer_id_for(self.product)
        with mock.patch('products.merchant._access_token', return_value='tok'), \
             mock.patch('requests.delete') as delete:
            delete.return_value = mock.Mock(status_code=404)
            self.assertEqual(merchant.remove(self.product), '')

    @override_settings(**MERCHANT_ON)
    def test_a_product_never_pushed_has_nothing_to_withdraw(self):
        with mock.patch('requests.delete') as delete:
            self.assertEqual(merchant.remove(self.product), '')
            delete.assert_not_called()
