"""
Tests for the accounts API (/api/accounts/*).

Currently focused on Address contact details, which are the part of the model
other systems read: the invoice prints them, and a courier rings them.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Address

User = get_user_model()

ADDRESSES = '/api/accounts/addresses/'


def _buyer_client(**extra):
    fields = dict(email='buyer@test.com', username='buyer', is_verified_b2b=True,
                  is_active=True, phone_number='9876543210')
    fields.update(extra)
    user = User(**fields)
    user.set_password('x')
    user.save()
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


class AddressContactTests(TestCase):
    """
    Per-address phone and email.

    In wholesale the delivery contact and the account holder are routinely
    different people: goods go to a warehouse with its own manager, the invoice
    goes to the office. Both fields are optional and fall back to the account,
    so nothing that existed before them had to be filled in.
    """

    def setUp(self):
        self.client, self.user = _buyer_client()

    def _payload(self, **extra):
        payload = {
            'address_line_1': 'Plot 44, GIDC Estate',
            'city': 'Ahmedabad', 'state': 'Gujarat', 'pincode': '382445',
        }
        payload.update(extra)
        return payload

    def _create(self, **extra):
        return self.client.post(ADDRESSES, self._payload(**extra), format='json')

    # ── storing them ─────────────────────────────────────────────────────────

    def test_contact_details_are_saved(self):
        r = self._create(contact_phone='9123456789', contact_email='wh@acme.com')
        self.assertEqual(r.status_code, 201, r.content)
        addr = Address.objects.get()
        self.assertEqual(addr.contact_phone, '9123456789')
        self.assertEqual(addr.contact_email, 'wh@acme.com')

    def test_they_are_optional(self):
        """Every address that existed before this feature has neither, so an
        address without them has to stay valid."""
        r = self._create()
        self.assertEqual(r.status_code, 201, r.content)
        addr = Address.objects.get()
        self.assertEqual(addr.contact_phone, '')
        self.assertEqual(addr.contact_email, '')

    def test_they_can_be_edited(self):
        addr = Address.objects.create(user=self.user, **self._payload())
        r = self.client.patch(f'{ADDRESSES}{addr.id}/',
                              {'contact_phone': '9000000001'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        addr.refresh_from_db()
        self.assertEqual(addr.contact_phone, '9000000001')

    def test_they_can_be_cleared_back_to_the_account(self):
        addr = Address.objects.create(user=self.user, contact_phone='9123456789',
                                      **self._payload())
        r = self.client.patch(f'{ADDRESSES}{addr.id}/',
                              {'contact_phone': ''}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['effective_phone'], '9876543210')

    # ── the fallback ─────────────────────────────────────────────────────────

    def test_a_blank_contact_falls_back_to_the_account(self):
        """A shipping block with no number on it is the one the courier calls
        the office about, so blank has to mean "use the account's", not "none"."""
        r = self._create()
        self.assertEqual(r.json()['effective_phone'], '9876543210')
        self.assertEqual(r.json()['effective_email'], 'buyer@test.com')

    def test_the_addresss_own_contact_wins(self):
        r = self._create(contact_phone='9123456789', contact_email='wh@acme.com')
        self.assertEqual(r.json()['effective_phone'], '9123456789')
        self.assertEqual(r.json()['effective_email'], 'wh@acme.com')

    def test_the_fallback_survives_an_account_with_no_phone(self):
        """phone_number is nullable on CustomUser — the property must return an
        empty string rather than None, which would render as "None"."""
        client, user = _buyer_client(email='b2@test.com', username='b2',
                                     phone_number=None)
        addr = Address.objects.create(user=user, **self._payload())
        self.assertEqual(addr.effective_phone, '')
        self.assertEqual(addr.effective_email, 'b2@test.com')

    def test_effective_fields_are_read_only(self):
        """They are derived. Accepting them as input would let a client store a
        contact that disagrees with both of the fields it is derived from."""
        r = self._create(effective_phone='0000000000',
                         effective_email='spoofed@test.com')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['effective_phone'], '9876543210')
        self.assertEqual(r.json()['effective_email'], 'buyer@test.com')

    # ── validation ───────────────────────────────────────────────────────────

    def test_a_junk_phone_is_refused(self):
        r = self._create(contact_phone='call the warehouse manager')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('contact_phone', r.json())

    def test_a_malformed_email_is_refused(self):
        r = self._create(contact_email='not-an-email')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('contact_email', r.json())

    def test_the_shapes_people_actually_type_are_accepted(self):
        """+91, brackets, spaces and hyphens all reach us from real forms."""
        for number in ('+91 98765 43210', '(079) 2685-1234', '079-26851234'):
            with self.subTest(number=number):
                Address.objects.all().delete()
                r = self._create(contact_phone=number)
                self.assertEqual(r.status_code, 201, r.content)

    # ── scoping ──────────────────────────────────────────────────────────────

    def test_an_address_is_only_visible_to_its_owner(self):
        Address.objects.create(user=self.user, contact_phone='9123456789',
                               **self._payload())
        other, _ = _buyer_client(email='other@test.com', username='other')
        self.assertEqual(other.get(ADDRESSES).json(), [])


class AddressInvoiceContactTests(TestCase):
    """
    The invoice reads effective_phone / effective_email off the shipping
    address. Which contact it resolves to is covered above; what these check is
    that the SHIP TO block still renders — a typo in an attribute name there
    would only ever surface as a 500 when a buyer downloads their invoice.
    """

    def _order(self, **address_extra):
        from orders.models import Order

        _, user = _buyer_client(email='inv@test.com', username='inv',
                                phone_number='9876500000')
        addr = Address.objects.create(
            user=user, address_line_1='Plot 44', city='Ahmedabad',
            state='Gujarat', pincode='382445', **address_extra,
        )
        return Order.objects.create(user=user, shipping_address=addr,
                                    billing_address=addr, total_amount=0)

    def test_it_renders_with_an_address_contact(self):
        from orders.invoice import generate_invoice_pdf
        pdf = generate_invoice_pdf(self._order(contact_phone='9123456789',
                                               contact_email='wh@acme.com'))
        self.assertTrue(pdf.getvalue().startswith(b'%PDF'))

    def test_it_renders_when_the_address_has_no_contact_of_its_own(self):
        from orders.invoice import generate_invoice_pdf
        pdf = generate_invoice_pdf(self._order())
        self.assertTrue(pdf.getvalue().startswith(b'%PDF'))
