from rest_framework import serializers
from .models import Cart, CartItem, Order, OrderItem, Commission, SampleOrder, Coupon
from products.models import ProductVariation
from accounts.serializers import AddressSerializer


class ProductVariationBriefSerializer(serializers.ModelSerializer):
    product_name  = serializers.CharField(source='product.name', read_only=True)
    moq           = serializers.IntegerField(source='product.moq', read_only=True)
    color_name    = serializers.SerializerMethodField()
    color_hex     = serializers.SerializerMethodField()
    display_image = serializers.SerializerMethodField()
    size          = serializers.SerializerMethodField()
    set_breakdown = serializers.SerializerMethodField()

    class Meta:
        model  = ProductVariation
        fields = [
            'id', 'sku', 'size', 'set_breakdown',
            'color', 'color_name', 'color_hex',
            'b2b_price', 'stock_quantity', 'is_available',
            'product_name', 'moq',
            'display_image',
        ]

    def get_size(self, obj):
        return obj.size_set.name if obj.size_set_id and obj.size_set else ''

    def get_set_breakdown(self, obj):
        return obj.size_breakdown.breakdown_string if obj.size_breakdown_id and obj.size_breakdown else ''

    def get_color_name(self, obj):
        if obj.color_palette:
            return obj.color_palette.name
        return obj.color or ''

    def get_color_hex(self, obj):
        if obj.color_palette:
            return obj.color_palette.hex_code
        return '#CCCCCC'

    def get_display_image(self, obj):
        request = self.context.get('request')
        # Prefer variation's own image, fall back to product's main image
        img = obj.image or (obj.product.image if obj.product_id else None)
        if not img:
            return None
        url = img.url
        return request.build_absolute_uri(url) if request else url


class CartItemSerializer(serializers.ModelSerializer):
    variation    = ProductVariationBriefSerializer(read_only=True)
    variation_id = serializers.PrimaryKeyRelatedField(
        queryset=ProductVariation.objects.all(), source='variation', write_only=True
    )
    unavailable = serializers.SerializerMethodField()

    class Meta:
        model  = CartItem
        fields = ['id', 'variation', 'variation_id', 'quantity', 'unavailable']

    def get_unavailable(self, obj):
        return obj.variation_id is None

    def validate(self, data):
        variation = data.get('variation')
        quantity  = data.get('quantity')
        if variation and quantity and quantity > 0 and quantity < variation.product.moq:
            raise serializers.ValidationError(
                f"Quantity must be 0 or >= MOQ ({variation.product.moq}) for this product."
            )
        return data


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    user  = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = Cart
        fields = ['id', 'user', 'items', 'created_at', 'updated_at']


class OrderItemSerializer(serializers.ModelSerializer):
    variation = ProductVariationBriefSerializer(read_only=True)

    class Meta:
        model  = OrderItem
        fields = ['id', 'variation', 'quantity', 'price']


class CouponSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Coupon
        fields = ['id', 'code', 'discount_type', 'discount_value', 'min_order_value']


class OrderSerializer(serializers.ModelSerializer):
    items            = OrderItemSerializer(many=True, read_only=True)
    user             = serializers.StringRelatedField(read_only=True)
    shipping_address = AddressSerializer(read_only=True)
    billing_address  = AddressSerializer(read_only=True)
    coupon_code      = serializers.CharField(source='coupon.code', read_only=True, default=None)
    grand_total      = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model  = Order
        fields = [
            'id', 'user', 'status', 'payment_method', 'payment_status', 'payment_plan',
            'total_amount', 'coupon_code', 'discount_amount', 'upi_discount', 'grand_total',
            'amount_paid', 'balance_due',
            'shipping_address', 'billing_address',
            'courier_name', 'tracking_number', 'tracking_url',
            'items', 'created_at',
        ]


class OrderTrackingUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Order
        fields = ['courier_name', 'tracking_number', 'tracking_url']


class CommissionSerializer(serializers.ModelSerializer):
    order_id      = serializers.IntegerField(source='order.id', read_only=True)
    order_total   = serializers.DecimalField(source='order.total_amount', max_digits=10, decimal_places=2, read_only=True)
    order_status  = serializers.CharField(source='order.status', read_only=True)
    order_date    = serializers.DateTimeField(source='order.created_at', read_only=True)
    buyer_email   = serializers.EmailField(source='order.user.email', read_only=True)
    buyer_company = serializers.CharField(source='order.user.company_name', read_only=True)
    agent_email   = serializers.EmailField(source='agent.email', read_only=True)

    class Meta:
        model  = Commission
        fields = [
            'id', 'agent_email',
            'order_id', 'order_total', 'order_status', 'order_date',
            'buyer_email', 'buyer_company',
            'commission_percentage', 'amount',
            'status', 'created_at', 'paid_at',
        ]


class SampleOrderSerializer(serializers.ModelSerializer):
    buyer_email   = serializers.EmailField(source='buyer.email', read_only=True)
    buyer_company = serializers.CharField(source='buyer.company_name', read_only=True)
    buyer_name    = serializers.SerializerMethodField()
    agent_email   = serializers.EmailField(source='agent.email', read_only=True)

    class Meta:
        model  = SampleOrder
        fields = [
            'id', 'design_number', 'rate', 'date', 'status',
            'buyer', 'buyer_email', 'buyer_company', 'buyer_name',
            'agent', 'agent_email', 'created_at',
        ]
        extra_kwargs = {
            'buyer': {'write_only': True},
            'agent': {'write_only': True, 'required': False},
        }

    def get_buyer_name(self, obj):
        return f"{obj.buyer.first_name} {obj.buyer.last_name}".strip() or obj.buyer.email