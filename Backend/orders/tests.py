"""
Tests for the cart's availability guard.

A variant carries an on/off switch because the business is not only online:
a colour sells out over the counter while stock_quantity still reads 40. The
switch is only worth having if it actually stops a purchase, and it has to
stop one at every point a buyer can reach -- filling the cart, changing a
quantity in it, and paying. A switch that merely greys out a row on the
product page is decoration, because the API is reachable without it.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from orders.models import Cart, CartItem
from products.models import (
    Category, Color, Product, ProductVariation, SizeSet, SizeSetBreakdown,
)


def _buyer_client():
    User = get_user_model()
    u = User(email='buyer@test.com', username='buyer', is_active=True)
    u.set_password('x')
    u.save()
    c = APIClient()
    c.force_authenticate(user=u)
    return c, u


class CartAvailabilityTests(TestCase):

    def setUp(self):
        self.client, self.user = _buyer_client()
        category = Category.objects.create(name='Shorts', slug='shorts')
        # MOQ 1 so these tests fail on availability and nothing else.
        self.product = Product.objects.create(
            name='D. NO 763 CARGO SHORTS', slug='d-no-763', code='PJ763',
            category=category, moq=1,
        )
        size_set = SizeSet.objects.create(name='L TO 3XL')
        breakdown = SizeSetBreakdown.objects.create(
            size_set=size_set, label='1xL, 1xXL, 1x2XL, 1x3XL',
            breakdown_string='1xL, 1xXL, 1x2XL, 1x3XL', pieces=4,
        )
        self.variation = ProductVariation.objects.create(
            product=self.product, size_set=size_set, size_breakdown=breakdown,
            color_palette=Color.objects.create(name='BEIGE', hex_code='#F5F5DC'),
            sku='PJ763_BEIGE_L3XL',
            per_piece_price=Decimal('645.00'), mrp_per_piece=Decimal('1299.00'),
            stock_quantity=20,
        )

    def add_to_cart(self, qty=2):
        return self.client.post('/api/orders/cart/update/', {
            'product_id': self.product.id,
            'items': [{'variation_id': self.variation.id, 'quantity': qty}],
        }, format='json')

    def switch_off(self):
        self.variation.is_available = False
        self.variation.save(update_fields=['is_available'])

    # ── filling the cart ────────────────────────────────────────────────────

    def test_an_available_variant_goes_into_the_cart(self):
        self.assertEqual(self.add_to_cart().status_code, 200)
        self.assertEqual(CartItem.objects.filter(cart__user=self.user).count(), 1)

    def test_a_switched_off_variant_is_refused(self):
        self.switch_off()
        response = self.add_to_cart()
        self.assertEqual(response.status_code, 400)
        self.assertIn('PJ763_BEIGE_L3XL', response.data['error'])
        self.assertFalse(CartItem.objects.filter(cart__user=self.user).exists())

    def test_the_stock_count_is_left_alone_by_the_switch(self):
        """The whole point: the count tracks the warehouse, the switch tracks
        whether it can be sold. Turning one off must not falsify the other."""
        self.switch_off()
        self.add_to_cart()
        self.variation.refresh_from_db()
        self.assertEqual(self.variation.stock_quantity, 20)

    # ── changing what is already in it ──────────────────────────────────────

    def test_a_quantity_cannot_be_raised_on_a_switched_off_variant(self):
        self.add_to_cart(qty=2)
        item = CartItem.objects.get(cart__user=self.user)
        self.switch_off()

        response = self.client.patch(
            f'/api/orders/cart/items/{item.id}/', {'quantity': 5}, format='json')
        self.assertEqual(response.status_code, 400)
        item.refresh_from_db()
        self.assertEqual(item.quantity, 2)

    def test_a_switched_off_variant_can_still_be_removed(self):
        """Refusing to let someone empty a cart they cannot check out with
        would leave them stuck."""
        self.add_to_cart(qty=2)
        item = CartItem.objects.get(cart__user=self.user)
        self.switch_off()

        response = self.client.patch(
            f'/api/orders/cart/items/{item.id}/', {'quantity': 0}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(CartItem.objects.filter(pk=item.pk).exists())

    # ── and back on again ───────────────────────────────────────────────────

    def test_switching_it_back_on_restores_ordering(self):
        self.switch_off()
        self.assertEqual(self.add_to_cart().status_code, 400)

        self.variation.is_available = True
        self.variation.save(update_fields=['is_available'])
        self.assertEqual(self.add_to_cart().status_code, 200)

    def test_the_cart_says_a_row_went_off_sale(self):
        """So the buyer finds out on the cart page rather than at payment."""
        self.add_to_cart(qty=2)
        self.switch_off()

        response = self.client.get('/api/orders/cart/')
        self.assertEqual(response.status_code, 200)
        row = response.data['items'][0]['variation']
        self.assertFalse(row['is_available'])


class CartAvailabilityIsolationTests(TestCase):
    """One colourway going off sale must not take the rest of the product
    with it -- that is the difference between this and deactivating the
    product."""

    def setUp(self):
        self.client, self.user = _buyer_client()
        category = Category.objects.create(name='Shorts', slug='shorts')
        self.product = Product.objects.create(
            name='D. NO 763 CARGO SHORTS', slug='d-no-763', code='PJ763',
            category=category, moq=1,
        )
        size_set = SizeSet.objects.create(name='L TO 3XL')
        breakdown = SizeSetBreakdown.objects.create(
            size_set=size_set, label='1xL', breakdown_string='1xL', pieces=4,
        )
        common = dict(
            product=self.product, size_set=size_set, size_breakdown=breakdown,
            per_piece_price=Decimal('645.00'), mrp_per_piece=Decimal('1299.00'),
            stock_quantity=20,
        )
        self.beige = ProductVariation.objects.create(
            sku='PJ763_BEIGE_L3XL',
            color_palette=Color.objects.create(name='BEIGE', hex_code='#F5F5DC'),
            **common)
        self.navy = ProductVariation.objects.create(
            sku='PJ763_NAVY_L3XL',
            color_palette=Color.objects.create(name='NAVY', hex_code='#000080'),
            **common)

    def test_the_other_colour_is_still_orderable(self):
        self.beige.is_available = False
        self.beige.save(update_fields=['is_available'])

        response = self.client.post('/api/orders/cart/update/', {
            'product_id': self.product.id,
            'items': [{'variation_id': self.navy.id, 'quantity': 3}],
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            CartItem.objects.get(cart__user=self.user).variation_id, self.navy.id)

    def test_one_switched_off_row_refuses_the_whole_submission(self):
        """The bulk order table posts the matrix in one go. Taking the good
        rows and silently dropping the bad one would charge for an order the
        buyer did not review."""
        self.beige.is_available = False
        self.beige.save(update_fields=['is_available'])

        response = self.client.post('/api/orders/cart/update/', {
            'product_id': self.product.id,
            'items': [
                {'variation_id': self.navy.id, 'quantity': 3},
                {'variation_id': self.beige.id, 'quantity': 3},
            ],
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('PJ763_BEIGE_L3XL', response.data['error'])
        self.assertFalse(Cart.objects.filter(user=self.user, items__isnull=False).exists())
