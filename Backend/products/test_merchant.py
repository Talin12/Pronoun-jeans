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
    def test_a_category_with_no_gender_in_its_name_falls_back_to_male(self):
        """Which is every real category: they are cuts and fabrics.

        The fallback is MALE rather than UNISEX because the catalogue is
        menswear throughout, and a unisex listing loses the men's filters
        that are the only ones these products belong in.
        """
        self.category.name = 'Travel Wear'
        self.category.save()
        self.assertEqual(self.payload()['productAttributes']['gender'], 'MALE')

    @override_settings(**MERCHANT_ON, MERCHANT_DEFAULT_GENDER='UNISEX')
    def test_the_fallback_gender_is_still_a_setting(self):
        """A women's line later changes the setting, not this code."""
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


class ReadinessFixture:
    """A listable product, shared by the two readiness test classes.

    A mixin rather than a base test case: inheriting from the first class
    would re-run all of its tests under the second one's name.
    """

    def setUp(self):
        cache.clear()
        self.category = Category.objects.create(name='Mens Cargo Pant', slug='mens-cargo')
        self.product = Product.objects.create(
            name="D. NO 1891 MEN'S LINEN CARGO PANT",
            slug='d-no-1891', code='PJ1891', category=self.category,
            description='Travel wear cargo track pants in oxford lycra, '
                        'bio washed, set of four pieces L to 3XL.',
            image='products/1891.jpg',
        )
        self.size_set = SizeSet.objects.create(name='L TO 3XL')
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

    def report(self):
        self.product.refresh_from_db()
        return merchant.readiness(self.product)

    def fields(self, level=None):
        return {c['field'] for c in self.report()['checks']
                if level is None or c['level'] == level}



class MerchantReadinessTests(ReadinessFixture, TestCase):
    """
    What the panel tells the client is still missing.

    The catalogue this ships against has a real problem these checks exist to
    surface: roughly half the variations carry an MRP of exactly 5000, which
    is a placeholder someone typed past a required field rather than a retail
    price. Publishing it advertises a saving that never existed, so it is
    flagged even though Google would accept the listing.
    """

    def test_a_complete_product_is_ready(self):
        report = self.report()
        self.assertTrue(report['ready'])
        self.assertEqual(report['blockers'], 0)

    def test_a_product_with_no_variations_cannot_be_listed(self):
        self.variation.delete()
        report = self.report()
        self.assertFalse(report['ready'])
        self.assertIn('variations', self.fields('blocker'))

    def test_a_missing_image_blocks_listing(self):
        self.product.image = ''
        self.product.save(update_fields=['image'])
        self.assertFalse(self.report()['ready'])
        self.assertIn('image', self.fields('blocker'))

    def test_a_missing_mrp_blocks_listing(self):
        ProductVariation.objects.filter(pk=self.variation.pk).update(
            mrp_per_piece=None, mrp=None)
        self.assertFalse(self.report()['ready'])
        self.assertIn('mrp', self.fields('blocker'))

    def test_the_placeholder_mrp_is_flagged_but_does_not_block(self):
        ProductVariation.objects.filter(pk=self.variation.pk).update(
            mrp_per_piece=Decimal('5000.00'))
        report = self.report()
        self.assertTrue(report['ready'])
        self.assertIn('mrp', self.fields('warning'))

    def test_a_wholesale_price_above_the_mrp_is_flagged(self):
        ProductVariation.objects.filter(pk=self.variation.pk).update(
            per_piece_price=Decimal('1500.00'))
        self.assertIn('b2b_price', self.fields('warning'))

    def test_blank_per_piece_columns_are_flagged(self):
        ProductVariation.objects.filter(pk=self.variation.pk).update(
            per_piece_price=None, mrp_per_piece=None,
            mrp=Decimal('5196.00'), b2b_price=Decimal('2580.00'))
        self.assertIn('per_piece_price', self.fields('warning'))

    def test_zero_stock_is_flagged(self):
        ProductVariation.objects.filter(pk=self.variation.pk).update(stock_quantity=0)
        self.assertIn('stock_quantity', self.fields('warning'))

    def test_a_missing_sku_is_flagged(self):
        ProductVariation.objects.filter(pk=self.variation.pk).update(sku='')
        self.assertIn('sku', self.fields('warning'))

    def test_a_thin_description_is_flagged(self):
        self.product.description = 'Nice pant.'
        self.product.fabric_details = ''
        self.product.meta_description = ''
        self.product.save()
        self.assertIn('description', self.fields('warning'))

    def test_a_name_that_contradicts_the_published_gender_is_flagged(self):
        """The check that survives the MALE fallback.

        With every category gender-neutral and the fallback set to male, a
        men's product is published correctly and has nothing to say. A
        women's product under the same category is not: it publishes as
        menswear, and that is exactly the case this has to catch, because it
        is the one the client will hit the day they add a women's line.
        """
        self.category.name = 'Cargo Pant'
        self.category.save(update_fields=['name'])
        self.assertNotIn('category', self.fields('warning'))

        self.product.name = "PRO-NOUN Women's Linen Cargo Pant"
        self.product.save(update_fields=['name'])
        self.assertIn('category', self.fields('warning'))

    def test_a_name_that_says_nothing_about_gender_is_not_flagged(self):
        self.category.name = 'Cargo Pant'
        self.category.save(update_fields=['name'])
        self.product.name = 'D. NO 1891 LINEN CARGO PANT'
        self.product.save(update_fields=['name'])
        self.assertNotIn('category', self.fields('warning'))

    def test_every_check_names_the_thing_to_do(self):
        """The panel shows these verbatim, so each has to stand on its own."""
        self.variation.delete()
        for check in self.report()['checks']:
            self.assertTrue(check['label'])
            self.assertTrue(check['detail'])
            self.assertIn(check['level'], ('blocker', 'warning'))


class MerchantReadinessFixTargetsTests(ReadinessFixture, TestCase):
    """
    Where each finding says it is fixed.

    The panel renders `fix` as a "Take me there" button that opens a wizard
    step, opens a variant's panel and puts the cursor in a field. A fix
    pointing at the wrong step or at a stale variation sends the admin to an
    empty form, which is worse than no button, so the destinations are
    asserted rather than eyeballed.
    """

    def fix_for(self, field):
        for check in self.report()['checks']:
            if check['field'] == field:
                return check['fix']
        self.fail(f'no check for {field!r}')

    def test_every_finding_carries_a_destination(self):
        self.product.image = ''
        self.product.description = ''
        self.product.fabric_details = ''
        self.product.meta_description = ''
        self.product.save()
        ProductVariation.objects.filter(pk=self.variation.pk).update(
            sku='', stock_quantity=0)

        checks = self.report()['checks']
        self.assertTrue(checks)
        for check in checks:
            fix = check['fix']
            self.assertIsNotNone(fix, check['field'])
            self.assertIn(fix['step'], merchant.STEP_LABELS)
            self.assertTrue(fix['field'])
            self.assertTrue(fix['label'])

    def test_a_variant_field_points_at_that_variant_row(self):
        ProductVariation.objects.filter(pk=self.variation.pk).update(
            mrp_per_piece=Decimal('5000.00'))
        fix = self.fix_for('mrp')
        self.assertEqual(fix['step'], 'variants')
        self.assertEqual(fix['field'], 'mrp_per_piece')
        self.assertEqual(fix['variation'], self.variation.pk)
        # The SKU is in the button so it is obvious which row is about to open.
        self.assertIn(self.variation.sku, fix['label'])

    def test_a_product_field_points_at_no_variant(self):
        self.product.description = 'Nice pant.'
        self.product.fabric_details = ''
        self.product.meta_description = ''
        self.product.save()
        fix = self.fix_for('description')
        self.assertEqual(fix['step'], 'base')
        self.assertEqual(fix['field'], 'description')
        self.assertIsNone(fix['variation'])

    def test_a_missing_image_points_at_the_images_step(self):
        self.product.image = ''
        self.product.save(update_fields=['image'])
        fix = self.fix_for('image')
        self.assertEqual(fix['step'], 'images')
        self.assertEqual(fix['field'], 'cover-image')

    def test_the_category_warning_points_at_the_category_field(self):
        # A women's name under a gender-neutral category: with the MALE
        # fallback that is the case that still contradicts itself.
        self.category.name = 'Cargo Pant'
        self.category.save(update_fields=['name'])
        self.product.name = "PRO-NOUN Women's Linen Cargo Pant"
        self.product.save(update_fields=['name'])
        fix = self.fix_for('category')
        self.assertEqual((fix['step'], fix['field']), ('base', 'category'))

    def test_no_variations_points_at_the_add_buttons(self):
        self.variation.delete()
        fix = self.fix_for('variations')
        self.assertEqual((fix['step'], fix['field']), ('variants', 'add-variant'))
        # There is no row to open, so nothing should be asked to open one.
        self.assertIsNone(fix['variation'])

    def test_the_colour_and_size_fixes_name_the_editor_selects(self):
        """The variant form labels them Colour and Size set; the fix has to
        point at those controls, not at the model's own field names."""
        # `color` is a stored column written from the palette on save, so
        # clearing the palette alone leaves the old name behind.
        ProductVariation.objects.filter(pk=self.variation.pk).update(
            color_palette=None, color='', size_set=None, size_breakdown=None)
        self.assertEqual(self.fix_for('color')['field'], 'color_palette')
        self.assertEqual(self.fix_for('size')['field'], 'size_set')


class VariantAvailabilityTests(ReadinessFixture, TestCase):
    """
    The per-variant on/off switch, and what it changes.

    It exists because the business is not only online: a colour sells out
    over the counter while stock_quantity still reads 40. Everything that
    gates a purchase or a listing therefore asks `sellable`, not the count,
    so switching a variant off and running it down to zero behave the same
    way everywhere.
    """

    def test_a_switched_off_variant_is_not_sellable(self):
        self.assertTrue(self.variation.sellable)
        self.variation.is_available = False
        self.variation.save(update_fields=['is_available'])
        self.assertFalse(self.variation.sellable)
        # The count is deliberately untouched: it tracks something else.
        self.assertEqual(self.variation.stock_quantity, 12)

    def test_a_variant_at_zero_is_not_sellable_even_when_switched_on(self):
        self.variation.stock_quantity = 0
        self.variation.save(update_fields=['stock_quantity'])
        self.assertTrue(self.variation.is_available)
        self.assertFalse(self.variation.sellable)

    def test_variants_are_on_sale_by_default(self):
        """The column arrives on a live catalogue, so the default has to be
        the state every existing row is already in."""
        self.assertTrue(
            ProductVariation.objects.get(pk=self.variation.pk).is_available)

    @override_settings(**MERCHANT_ON)
    def test_switching_every_variant_off_publishes_out_of_stock(self):
        self.variation.is_available = False
        self.variation.save(update_fields=['is_available'])
        self.product.refresh_from_db()
        payload = merchant.build_payload(self.product)
        self.assertEqual(
            payload['productAttributes']['availability'], 'OUT_OF_STOCK')

    @override_settings(**MERCHANT_ON)
    def test_a_switched_on_variant_still_publishes_in_stock(self):
        """One colourway going off sale must not take the listing with it."""
        second = ProductVariation.objects.create(
            product=self.product, size_set=self.size_set,
            size_breakdown=self.breakdown,
            color_palette=Color.objects.create(name='NAVY', hex_code='#000080'),
            sku='PJ1891_NAVY_L3XL',
            per_piece_price=Decimal('645.00'), mrp_per_piece=Decimal('1299.00'),
            stock_quantity=4,
        )
        self.variation.is_available = False
        self.variation.save(update_fields=['is_available'])
        self.product.refresh_from_db()

        payload = merchant.build_payload(self.product)
        self.assertEqual(
            payload['productAttributes']['availability'], 'IN_STOCK')
        # ...and the listing represents the colourway that can be bought.
        self.assertEqual(payload['productAttributes']['mpn'], second.sku)

    def test_the_panel_says_switch_one_back_on_rather_than_add_stock(self):
        """Telling someone to add stock to a row they switched off on purpose
        is the checklist being wrong at them."""
        self.variation.is_available = False
        self.variation.save(update_fields=['is_available'])

        labels = {c['label'] for c in self.report()['checks']}
        self.assertIn('Switch a variant back on', labels)
        self.assertNotIn('Add stock', labels)

    def test_that_finding_points_at_the_row_switch(self):
        self.variation.is_available = False
        self.variation.save(update_fields=['is_available'])

        fix = next(c['fix'] for c in self.report()['checks']
                   if c['label'] == 'Switch a variant back on')
        self.assertEqual(fix['step'], 'variants')
        self.assertEqual(fix['field'], 'is_available')
        self.assertEqual(fix['variation'], self.variation.pk)

    def test_a_mix_of_switched_off_and_zero_still_asks_for_stock(self):
        olive = ProductVariation.objects.create(
            product=self.product, size_set=self.size_set,
            size_breakdown=self.breakdown,
            color_palette=Color.objects.create(name='OLIVE', hex_code='#556B2F'),
            sku='PJ1891_OLIVE_L3XL',
            per_piece_price=Decimal('645.00'), mrp_per_piece=Decimal('1299.00'),
            stock_quantity=0,
        )
        self.variation.is_available = False
        self.variation.save(update_fields=['is_available'])

        checks = self.report()['checks']
        self.assertIn('Add stock', {c['label'] for c in checks})

        # And it opens the row that is still on sale: typing a quantity into
        # the switched-off one would change nothing.
        fix = next(c['fix'] for c in checks if c['label'] == 'Add stock')
        self.assertEqual(fix['variation'], olive.pk)
