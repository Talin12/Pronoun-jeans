import razorpay
from decimal import Decimal, ROUND_HALF_UP
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.conf import settings
from django.db import transaction
from django.db.models import F, Sum
from django.http import FileResponse
from django.utils import timezone
from .invoice import generate_invoice_pdf

from .models import Cart, CartItem, Order, OrderItem, Commission, SampleOrder, Coupon
from core.email_utils import send_order_placed_email
from .tracking_service import get_bigship_tracking
from products.models import Product, ProductVariation
from accounts.models import Address, AgentPayment
from accounts.views import IsAgent
from .serializers import (
    CartSerializer, OrderSerializer, CommissionSerializer,
    SampleOrderSerializer, OrderTrackingUpdateSerializer, CouponSerializer,
)

SHIPPING_FEE            = Decimal('300.00')
FREE_SHIPPING_THRESHOLD = Decimal('15000.00')
Q2                      = Decimal('0.01')


def _r(value):
    return value.quantize(Q2, rounding=ROUND_HALF_UP)


def calc_gst_split(subtotal, coupon_pct=Decimal('0'), upi_pct=Decimal('0')):
    base         = _r(subtotal * Decimal('0.95'))
    gst          = _r(subtotal * Decimal('0.05'))
    coupon_disc  = _r(base * coupon_pct)
    upi_disc     = _r(base * upi_pct)
    total_disc   = _r(coupon_disc + upi_disc)
    disc_base    = _r(base - total_disc)
    pre_shipping = _r(disc_base + gst)
    shipping     = SHIPPING_FEE if pre_shipping < FREE_SHIPPING_THRESHOLD else Decimal('0.00')
    grand_total  = _r(pre_shipping + shipping)
    return {
        'base': base, 'gst': gst,
        'coupon_disc': coupon_disc, 'upi_disc': upi_disc,
        'total_disc': total_disc, 'disc_base': disc_base,
        'pre_shipping': pre_shipping, 'shipping': shipping,
        'grand_total': grand_total,
    }


def get_razorpay_client():
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


def _resolve_address(address_id, user):
    if not address_id:
        return None
    try:
        return Address.objects.get(pk=address_id, user=user)
    except Address.DoesNotExist:
        return None


def _compute_subtotal(cart_items):
    return sum(
        Decimal(str(item.quantity)) * item.variation.b2b_price
        for item in cart_items
    )


def _validate_cart_moq(cart_items):
    """Returns an error string if any product is below its MOQ, else None."""
    totals = {}
    for item in cart_items:
        product = item.variation.product
        if product.pk not in totals:
            totals[product.pk] = {'name': product.name, 'moq': product.moq, 'qty': 0}
        totals[product.pk]['qty'] += item.quantity
    for data in totals.values():
        if data['qty'] < data['moq']:
            return (
                f"Total quantity for {data['name']} ({data['qty']} sets) is below "
                f"the minimum order quantity of {data['moq']} sets."
            )
    return None


def _resolve_coupon(coupon_code, subtotal):
    if not coupon_code:
        return None, Decimal('0')
    try:
        coupon = Coupon.objects.get(code=coupon_code.strip().upper())
        now    = timezone.now()
        if (coupon.is_active
                and coupon.valid_from <= now <= coupon.valid_to
                and subtotal >= coupon.min_order_value
                and coupon.discount_type == Coupon.DiscountType.PERCENTAGE):
            pct = Decimal(str(coupon.discount_value)) / Decimal('100')
            return coupon, pct
    except Coupon.DoesNotExist:
        pass
    return None, Decimal('0')


def _resolve_buyer(request, buyer_id=None):
    if request.user.is_agent and buyer_id:
        try:
            buyer = request.user.assigned_buyers.get(pk=buyer_id, is_verified_b2b=True)
        except Exception:
            return None, None, 'Buyer not found or not assigned to you.'
        if not buyer.agent_can_order:
            return None, None, 'This buyer has not granted you permission to place orders on their behalf.'
        return buyer, request.user, None
    return request.user, None, None


# ── Cart ──────────────────────────────────────────────────────────────────────

_CART_PREFETCH = [
    'items__variation__product',
    'items__variation__size_set',
    'items__variation__size_breakdown',
    'items__variation__color_palette',
]


def _fetch_cart(user, pk=None):
    qs = Cart.objects.prefetch_related(*_CART_PREFETCH)
    return qs.get(pk=pk) if pk else qs.get(user=user)


class CartDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        cart = _fetch_cart(request.user, pk=cart.pk)
        return Response(CartSerializer(cart, context={'request': request}).data)


class CartItemUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        product_id = request.data.get('product_id')
        items      = request.data.get('items', [])

        if not product_id or not items:
            return Response({'error': 'product_id and items are required.'},
                            status=status.HTTP_400_BAD_REQUEST)

        total_quantity = sum(int(i.get('quantity', 0)) for i in items if int(i.get('quantity', 0)) > 0)
        if total_quantity == 0:
            return Response({'error': 'No valid quantities provided.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            product = Product.objects.get(pk=product_id)
        except Product.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)

        if total_quantity < product.moq:
            return Response(
                {'error': f'Total quantity ({total_quantity}) must be >= MOQ ({product.moq}).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Every row is checked before any of them is written. The bulk order
        # table posts the whole matrix in one request and gets back a single
        # error, so applying the rows that passed and refusing the rest would
        # leave a cart the buyer never agreed to -- and the atomic block does
        # not help here, because returning a 400 commits, only a raised
        # exception rolls back.
        wanted = []
        for item in items:
            qty = int(item.get('quantity', 0))
            if qty <= 0:
                continue
            try:
                variation = ProductVariation.objects.get(
                    pk=item.get('variation_id'), product=product)
            except ProductVariation.DoesNotExist:
                continue
            # Switched off by the admin -- sold out over the counter, most
            # often, which the stock column does not know about.
            if not variation.is_available:
                return Response(
                    {'error': f'{variation.sku} is not available right now.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if qty > variation.stock_quantity:
                return Response(
                    {'error': f'Only {variation.stock_quantity} sets available for {variation.sku}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            wanted.append((variation, qty))

        cart, _ = Cart.objects.get_or_create(user=request.user)
        for variation, qty in wanted:
            CartItem.objects.update_or_create(
                cart=cart, variation=variation, defaults={'quantity': qty}
            )

        cart = _fetch_cart(request.user, pk=cart.pk)
        return Response(CartSerializer(cart, context={'request': request}).data, status=status.HTTP_200_OK)


class CartItemDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, pk):
        try:
            item = CartItem.objects.select_related('cart', 'variation__product').get(pk=pk, cart__user=request.user)
        except CartItem.DoesNotExist:
            return Response({'error': 'Cart item not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            quantity = int(request.data.get('quantity', 1))
        except (TypeError, ValueError):
            return Response({'error': 'quantity must be a whole number.'}, status=status.HTTP_400_BAD_REQUEST)

        if quantity <= 0:
            item.delete()
        else:
            if not item.variation.is_available:
                return Response(
                    {'error': f'{item.variation.sku} is not available right now.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if quantity > item.variation.stock_quantity:
                return Response(
                    {'error': f'Only {item.variation.stock_quantity} sets available for {item.variation.sku}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # MOQ check: total qty for this product after update must still meet MOQ
            product   = item.variation.product
            other_qty = CartItem.objects.filter(
                cart=item.cart, variation__product=product,
            ).exclude(pk=item.pk).aggregate(total=Sum('quantity'))['total'] or 0
            new_total = other_qty + quantity
            if new_total < product.moq:
                return Response(
                    {'error': f'Total quantity for {product.name} must be at least {product.moq} sets (would be {new_total} after this change).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            item.quantity = quantity
            item.save()

        cart = _fetch_cart(request.user)
        return Response(CartSerializer(cart, context={'request': request}).data)


# ── Coupons ───────────────────────────────────────────────────────────────────

class ActiveCouponsListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class   = CouponSerializer

    def get_queryset(self):
        now = timezone.now()
        return Coupon.objects.filter(
            is_active=True, valid_from__lte=now, valid_to__gte=now,
        ).order_by('min_order_value')


class ApplyCouponView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        coupon_code = request.data.get('coupon_code', '').strip().upper()
        if not coupon_code:
            return Response({'error': 'Please enter a coupon code.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            coupon = Coupon.objects.get(code=coupon_code)
        except Coupon.DoesNotExist:
            return Response({'error': 'Invalid coupon code.'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        if not coupon.is_active:
            return Response({'error': 'This coupon is no longer active.'}, status=status.HTTP_400_BAD_REQUEST)
        if now < coupon.valid_from:
            return Response({'error': 'This coupon is not yet valid.'}, status=status.HTTP_400_BAD_REQUEST)
        if now > coupon.valid_to:
            return Response({'error': 'This coupon has expired.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            cart = _fetch_cart(request.user)
        except Cart.DoesNotExist:
            return Response({'error': 'Your cart is empty.'}, status=status.HTTP_400_BAD_REQUEST)

        cart_items = cart.items.all()
        if not cart_items.exists():
            return Response({'error': 'Your cart is empty.'}, status=status.HTTP_400_BAD_REQUEST)

        subtotal = _compute_subtotal(cart_items)
        if subtotal < coupon.min_order_value:
            return Response(
                {'error': f'Minimum order value for this coupon is ₹{coupon.min_order_value}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        coupon_pct = Decimal(str(coupon.discount_value)) / Decimal('100')
        calc       = calc_gst_split(subtotal, coupon_pct=coupon_pct)

        return Response({
            'coupon_code':        coupon.code,
            'discount_type':      coupon.discount_type,
            'discount_value':     str(coupon.discount_value),
            'coupon_disc_amount': str(calc['coupon_disc']),
            'subtotal':           str(subtotal),
            'base':               str(calc['base']),
            'gst':                str(calc['gst']),
            'shipping':           str(calc['shipping']),
            'grand_total':        str(calc['grand_total']),
        })


# ── Direct UPI Checkout ───────────────────────────────────────────────────────

class DirectUPICheckoutView(APIView):
    """
    POST /api/orders/upi/checkout/

    Accepts multipart/form-data to support screenshot uploads.

    Payload fields (all as form fields, not JSON):
        payment_plan         'advance' | 'full'
        proof_type           'utr' | 'screenshot' | 'none'
        utr_number           str   (required if proof_type == 'utr')
        payment_screenshot   file  (required if proof_type == 'screenshot')
        shipping_address_id  int
        billing_address_id   int
        coupon_code          str   (optional)
        buyer_id             int   (optional, for OOBO)
    """
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    @transaction.atomic
    def post(self, request):
        data = request.data

        payment_plan        = data.get('payment_plan', '').strip()
        proof_type          = data.get('proof_type', 'none').strip()
        utr_number          = data.get('utr_number', '').strip()
        shipping_address_id = data.get('shipping_address_id')
        billing_address_id  = data.get('billing_address_id')
        coupon_code         = data.get('coupon_code', '')
        buyer_id            = data.get('buyer_id')
        screenshot_file     = request.FILES.get('payment_screenshot')

        # ── Validate payment_plan ──
        if payment_plan not in ('advance', 'full'):
            return Response({'error': "payment_plan must be 'advance' or 'full'."},
                            status=status.HTTP_400_BAD_REQUEST)

        # ── Validate proof_type ──
        if proof_type not in ('utr', 'screenshot', 'none'):
            return Response({'error': "proof_type must be 'utr', 'screenshot', or 'none'."},
                            status=status.HTTP_400_BAD_REQUEST)

        # ── Proof-specific validation ──
        if proof_type == 'utr' and not utr_number:
            return Response({'error': 'Please enter your UPI Transaction Reference ID (UTR).'},
                            status=status.HTTP_400_BAD_REQUEST)

        if proof_type == 'screenshot' and not screenshot_file:
            return Response({'error': 'Please upload a payment screenshot.'},
                            status=status.HTTP_400_BAD_REQUEST)

        if proof_type == 'screenshot' and screenshot_file:
            allowed_types = ['image/jpeg', 'image/png', 'image/webp']
            if screenshot_file.content_type not in allowed_types:
                return Response({'error': 'Screenshot must be a JPG, PNG, or WebP image.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if screenshot_file.size > 5 * 1024 * 1024:
                return Response({'error': 'Screenshot must be smaller than 5MB.'},
                                status=status.HTTP_400_BAD_REQUEST)

        # ── Resolve buyer (OOBO or self) ──
        buyer, placed_by_agent, err = _resolve_buyer(request, buyer_id)
        if err:
            return Response({'error': err}, status=status.HTTP_403_FORBIDDEN)

        # ── Addresses ──
        shipping_address = _resolve_address(shipping_address_id, buyer)
        billing_address  = _resolve_address(billing_address_id,  buyer)
        if not shipping_address:
            return Response({'error': 'Please select a shipping address.'}, status=status.HTTP_400_BAD_REQUEST)
        if not billing_address:
            return Response({'error': 'Please select a billing address.'}, status=status.HTTP_400_BAD_REQUEST)

        # ── Cart ──
        try:
            cart = Cart.objects.prefetch_related('items__variation__product').get(user=request.user)
        except Cart.DoesNotExist:
            return Response({'error': 'Cart not found.'}, status=status.HTTP_400_BAD_REQUEST)

        cart_items = cart.items.all()
        if not cart_items.exists():
            return Response({'error': 'Cart is empty.'}, status=status.HTTP_400_BAD_REQUEST)

        moq_error = _validate_cart_moq(cart_items)
        if moq_error:
            return Response({'error': moq_error}, status=status.HTTP_400_BAD_REQUEST)

        # ── Compute totals ──
        subtotal           = _compute_subtotal(cart_items)
        coupon, coupon_pct = _resolve_coupon(coupon_code, subtotal)
        upi_pct            = Decimal('0.01') if payment_plan == 'full' else Decimal('0')
        calc               = calc_gst_split(subtotal, coupon_pct=coupon_pct, upi_pct=upi_pct)

        # Lock variations and validate stock atomically
        variation_ids = [item.variation_id for item in cart_items]
        qty_map       = {item.variation_id: item.quantity for item in cart_items}
        locked_vars   = {
            v.id: v for v in
            ProductVariation.objects.select_for_update().filter(id__in=variation_ids)
        }
        for var_id, qty in qty_map.items():
            lv = locked_vars[var_id]
            # Checked again here, under the row lock, because a variant can be
            # switched off between filling the cart and paying for it.
            if not lv.is_available:
                return Response(
                    {'error': f'{lv.sku} is no longer available.'},
                    status=status.HTTP_409_CONFLICT,
                )
            if qty > lv.stock_quantity:
                return Response(
                    {'error': f'Only {lv.stock_quantity} sets available for {lv.sku}.'},
                    status=status.HTTP_409_CONFLICT,
                )

        grand_total        = calc['grand_total']
        pre_shipping       = calc['pre_shipping']
        shipping           = calc['shipping']

        if payment_plan == 'advance':
            amount_paid        = _r(pre_shipping * Decimal('0.10') + shipping)
            balance_due        = _r(pre_shipping - pre_shipping * Decimal('0.10'))
            payment_status_val = Order.PaymentStatus.PARTIAL
        else:
            amount_paid        = grand_total
            balance_due        = Decimal('0.00')
            payment_status_val = Order.PaymentStatus.PENDING

        # ── Map proof_type to model choices ──
        proof_type_map = {
            'utr':        Order.PaymentProofType.UTR,
            'screenshot': Order.PaymentProofType.SCREENSHOT,
            'none':       Order.PaymentProofType.NONE,
        }

        # ── Create Order ──
        order = Order.objects.create(
            user                = buyer,
            placed_by_agent     = placed_by_agent,
            shipping_address    = shipping_address,
            billing_address     = billing_address,
            payment_method      = Order.PaymentMethod.DIRECT_UPI,
            payment_status      = payment_status_val,
            status              = Order.Status.PENDING_VERIFICATION,
            total_amount        = subtotal,
            coupon              = coupon,
            discount_amount     = calc['coupon_disc'],
            payment_plan        = payment_plan,
            upi_discount        = calc['upi_disc'],
            amount_paid         = amount_paid,
            balance_due         = balance_due,
            payment_proof_type  = proof_type_map[proof_type],
            utr_number          = utr_number if proof_type == 'utr' else None,
            payment_screenshot  = screenshot_file if proof_type == 'screenshot' else None,
            payment_verified    = False,
        )

        OrderItem.objects.bulk_create([
            OrderItem(order=order, variation=item.variation,
                      quantity=item.quantity, price=item.variation.b2b_price)
            for item in cart_items
        ])

        # Decrement stock for each variation
        for var_id, qty in qty_map.items():
            ProductVariation.objects.filter(pk=var_id).update(
                stock_quantity=F('stock_quantity') - qty
            )

        cart.items.all().delete()
        send_order_placed_email(order)

        # ── Response message based on proof type ──
        messages = {
            'utr':        'Order placed. UTR submitted — we\'ll verify within 2 hours.',
            'screenshot': 'Order placed. Screenshot submitted — we\'ll verify within 2 hours.',
            'none':       'Order placed without proof. Manual bank verification may take up to 24 hours.',
        }

        return Response({
            'order_id':    order.id,
            'grand_total': str(grand_total),
            'amount_paid': str(amount_paid),
            'balance_due': str(balance_due),
            'shipping':    str(shipping),
            'proof_type':  proof_type,
            'message':     messages[proof_type],
        }, status=status.HTTP_201_CREATED)


# ── Razorpay ──────────────────────────────────────────────────────────────────

class RazorpayCreateOrderView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        shipping_address_id = request.data.get('shipping_address_id')
        billing_address_id  = request.data.get('billing_address_id')
        coupon_code         = request.data.get('coupon_code', '')
        buyer_id            = request.data.get('buyer_id')

        buyer, placed_by_agent, err = _resolve_buyer(request, buyer_id)
        if err:
            return Response({'error': err}, status=status.HTTP_403_FORBIDDEN)

        shipping_address = _resolve_address(shipping_address_id, buyer)
        billing_address  = _resolve_address(billing_address_id,  buyer)
        if not shipping_address:
            return Response({'error': 'Shipping address not found.'}, status=status.HTTP_400_BAD_REQUEST)
        if not billing_address:
            return Response({'error': 'Billing address not found.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            cart = Cart.objects.prefetch_related('items__variation__product').get(user=request.user)
        except Cart.DoesNotExist:
            return Response({'error': 'Cart not found.'}, status=status.HTTP_400_BAD_REQUEST)

        cart_items = cart.items.all()
        if not cart_items.exists():
            return Response({'error': 'Cart is empty.'}, status=status.HTTP_400_BAD_REQUEST)

        moq_error = _validate_cart_moq(cart_items)
        if moq_error:
            return Response({'error': moq_error}, status=status.HTTP_400_BAD_REQUEST)

        subtotal           = _compute_subtotal(cart_items)
        coupon, coupon_pct = _resolve_coupon(coupon_code, subtotal)
        calc               = calc_gst_split(subtotal, coupon_pct=coupon_pct)
        grand_total        = calc['grand_total']

        # Pre-flight stock check (stock committed at payment verification)
        for item in cart_items:
            if item.quantity > item.variation.stock_quantity:
                return Response(
                    {'error': f'Only {item.variation.stock_quantity} sets available for {item.variation.sku}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            client         = get_razorpay_client()
            razorpay_order = client.order.create({
                'amount':          int(grand_total * 100),
                'currency':        'INR',
                'payment_capture': 1,
            })
        except Exception as e:
            return Response({'error': f'Failed to create Razorpay order: {str(e)}'},
                            status=status.HTTP_502_BAD_GATEWAY)

        django_order = Order.objects.create(
            user              = buyer,
            placed_by_agent   = placed_by_agent,
            shipping_address  = shipping_address,
            billing_address   = billing_address,
            payment_method    = Order.PaymentMethod.RAZORPAY,
            payment_status    = Order.PaymentStatus.PENDING,
            total_amount      = subtotal,
            coupon            = coupon,
            discount_amount   = calc['coupon_disc'],
            status            = Order.Status.PENDING,
            razorpay_order_id = razorpay_order['id'],
        )

        OrderItem.objects.bulk_create([
            OrderItem(order=django_order, variation=item.variation,
                      quantity=item.quantity, price=item.variation.b2b_price)
            for item in cart_items
        ])

        return Response({
            'razorpay_order_id': razorpay_order['id'],
            'amount':            int(grand_total * 100),
            'currency':          'INR',
            'key_id':            settings.RAZORPAY_KEY_ID,
            'django_order_id':   django_order.id,
            'name':              getattr(buyer, 'company_name', '') or buyer.email,
            'email':             buyer.email,
            'contact':           getattr(buyer, 'phone_number', '') or '',
        }, status=status.HTTP_201_CREATED)


class RazorpayVerifyPaymentView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        razorpay_order_id   = request.data.get('razorpay_order_id', '')
        razorpay_payment_id = request.data.get('razorpay_payment_id', '')
        razorpay_signature  = request.data.get('razorpay_signature', '')

        if not all([razorpay_order_id, razorpay_payment_id, razorpay_signature]):
            return Response({'error': 'All three Razorpay fields are required.'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            client = get_razorpay_client()
            client.utility.verify_payment_signature({
                'razorpay_order_id':   razorpay_order_id,
                'razorpay_payment_id': razorpay_payment_id,
                'razorpay_signature':  razorpay_signature,
            })
        except razorpay.errors.SignatureVerificationError:
            return Response({'error': 'Payment signature verification failed.'},
                            status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Verification error: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            order = Order.objects.get(razorpay_order_id=razorpay_order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Lock variations and decrement stock now that payment is confirmed
        order_items = list(order.items.select_related('variation').all())
        var_ids     = [oi.variation_id for oi in order_items]
        rz_qty_map  = {oi.variation_id: oi.quantity for oi in order_items}
        locked_vars = {
            v.id: v for v in
            ProductVariation.objects.select_for_update().filter(id__in=var_ids)
        }
        for oi in order_items:
            lv = locked_vars[oi.variation_id]
            if oi.quantity > lv.stock_quantity:
                return Response(
                    {'error': f'Insufficient stock for {lv.sku}. Payment received — please contact support.'},
                    status=status.HTTP_409_CONFLICT,
                )
        for var_id, qty in rz_qty_map.items():
            ProductVariation.objects.filter(pk=var_id).update(
                stock_quantity=F('stock_quantity') - qty
            )

        order.razorpay_payment_id = razorpay_payment_id
        order.razorpay_signature  = razorpay_signature
        order.payment_status      = Order.PaymentStatus.PAID
        order.status              = Order.Status.APPROVED
        order.save(update_fields=['razorpay_payment_id', 'razorpay_signature', 'payment_status', 'status'])

        try:
            Cart.objects.get(user=request.user).items.all().delete()
        except Cart.DoesNotExist:
            pass

        return Response({'message': 'Payment verified.', 'order_id': order.id})


# ── Standard checkout (disabled) ──────────────────────────────────────────────

class CheckoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(
            {'error': 'Use /api/orders/upi/checkout/ or /api/orders/razorpay/create/'},
            status=status.HTTP_400_BAD_REQUEST,
        )


# ── Order History ─────────────────────────────────────────────────────────────

class OrderHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        orders = Order.objects.filter(
            user=request.user
        ).prefetch_related('items__variation__product').order_by('-created_at')
        return Response(OrderSerializer(orders, many=True).data)


# ── Agent: Commissions & Ledger ───────────────────────────────────────────────

class AgentCommissionsListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class   = CommissionSerializer

    def get_queryset(self):
        return Commission.objects.filter(
            agent=self.request.user
        ).select_related('order', 'order__user', 'agent').order_by('-created_at')


class AgentLedgerSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        agent = request.user

        total_delivered_sales = (
            Order.objects.filter(
                user__assigned_agent=agent,
                status=Order.Status.DELIVERED,
            ).aggregate(t=Sum('total_amount'))['t'] or Decimal('0.00')
        )

        commission_qs    = Commission.objects.filter(agent=agent)
        total_commission = commission_qs.filter(
            order__isnull=False
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

        bonus_earned = commission_qs.filter(
            order__isnull=True
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

        total_earned = _r(Decimal(str(total_commission)) + Decimal(str(bonus_earned)))

        total_paid_out = (
            AgentPayment.objects.filter(agent=agent).aggregate(t=Sum('amount'))['t']
            or Decimal('0.00')
        )

        outstanding_balance = _r(total_earned - Decimal(str(total_paid_out)))

        BONUS_THRESHOLD = Decimal('500000.00')
        BONUS_AMOUNT    = Decimal('5000.00')
        progress_pct    = min(float(total_delivered_sales / BONUS_THRESHOLD * 100), 100)
        bonus_unlocked  = total_delivered_sales >= BONUS_THRESHOLD

        return Response({
            'total_delivered_sales': str(_r(Decimal(str(total_delivered_sales)))),
            'total_commission':      str(_r(Decimal(str(total_commission)))),
            'bonus_earned':          str(_r(Decimal(str(bonus_earned)))),
            'total_earned':          str(total_earned),
            'total_paid_out':        str(_r(Decimal(str(total_paid_out)))),
            'outstanding_balance':   str(outstanding_balance),
            'bonus_threshold':       str(BONUS_THRESHOLD),
            'bonus_amount':          str(BONUS_AMOUNT),
            'bonus_progress_pct':    round(progress_pct, 1),
            'bonus_unlocked':        bonus_unlocked,
        })


class AgentEligibleBuyersView(APIView):
    permission_classes = [IsAgent]

    def get(self, request):
        buyers = request.user.assigned_buyers.filter(
            is_verified_b2b=True,
            agent_can_order=True,
        ).values('id', 'email', 'company_name', 'phone_number')
        return Response(list(buyers))


class AgentSampleOrdersListView(generics.ListCreateAPIView):
    permission_classes = [IsAgent]
    serializer_class   = SampleOrderSerializer

    def get_queryset(self):
        return SampleOrder.objects.filter(
            agent=self.request.user
        ).select_related('buyer', 'agent').order_by('-date')

    def perform_create(self, serializer):
        buyer = serializer.validated_data.get('buyer')
        if not self.request.user.assigned_buyers.filter(pk=buyer.pk).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Buyer is not assigned to you.')
        serializer.save(agent=self.request.user)


class AgentOrdersListView(generics.ListAPIView):
    permission_classes = [IsAgent]
    serializer_class   = OrderSerializer

    def get_queryset(self):
        return Order.objects.filter(
            user__assigned_agent=self.request.user
        ).select_related('user', 'shipping_address', 'billing_address').prefetch_related(
            'items__variation__product'
        ).order_by('-created_at')


class AgentOrderTrackingUpdateView(generics.UpdateAPIView):
    permission_classes = [IsAgent]
    serializer_class   = OrderTrackingUpdateSerializer
    http_method_names  = ['patch']

    def get_queryset(self):
        return Order.objects.filter(user__assigned_agent=self.request.user)


class OrderTrackingTimelineView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            order = Order.objects.select_related('user', 'user__assigned_agent').get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_buyer = order.user == request.user
        is_agent = (
            order.user.assigned_agent is not None and
            order.user.assigned_agent == request.user
        )
        if not (is_buyer or is_agent):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        if not order.tracking_number:
            return Response({'timeline': [{
                'timestamp': None, 'status': 'Processing',
                'location': '', 'message': 'No tracking number assigned yet.',
            }]})

        timeline = get_bigship_tracking(order.tracking_number)
        return Response({'timeline': timeline})


class InvoiceDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            if request.user.is_agent:
                order = Order.objects.select_related(
                    'user', 'shipping_address', 'billing_address', 'coupon',
                ).get(pk=pk, user__assigned_agent=request.user)
            else:
                order = Order.objects.select_related(
                    'user', 'shipping_address', 'billing_address', 'coupon',
                ).get(pk=pk, user=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        pdf = generate_invoice_pdf(order)
        return FileResponse(
            pdf,
            as_attachment=True,
            filename=f'pronoun-invoice-{order.id:05d}.pdf',
            content_type='application/pdf',
        )