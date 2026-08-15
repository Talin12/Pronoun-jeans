from django.contrib import admin
from django.utils import timezone
from .models import Cart, CartItem, Order, OrderItem, Commission, SampleOrder, Coupon


class CartItemInline(admin.TabularInline):
    model               = CartItem
    extra               = 0
    fields              = ['variation', 'quantity']
    # type-to-search instead of a <select> of every variation per row
    autocomplete_fields = ['variation']


class OrderItemInline(admin.TabularInline):
    model               = OrderItem
    extra               = 0
    fields              = ['variation', 'quantity', 'price']
    readonly_fields     = ['price']
    autocomplete_fields = ['variation']

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('variation__product')


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display  = ['code', 'discount_type', 'discount_value', 'min_order_value', 'is_active', 'valid_from', 'valid_to']
    list_filter   = ['is_active', 'discount_type']
    search_fields = ['code']
    ordering      = ['-valid_to']
    list_editable = ['is_active']
    fieldsets = (
        ('Coupon Details', {
            'fields': ('code', 'discount_type', 'discount_value', 'min_order_value', 'is_active'),
        }),
        ('Validity', {
            'fields': ('valid_from', 'valid_to'),
        }),
    )


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display        = ['user', 'created_at', 'updated_at']
    list_select_related = ['user']
    inlines             = [CartItemInline]


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display        = ['id', 'user', 'placed_by_agent', 'status', 'total_amount', 'discount_amount', 'coupon', 'courier_name', 'tracking_number', 'created_at']
    list_select_related = ['user', 'placed_by_agent', 'coupon']
    autocomplete_fields = ['user', 'placed_by_agent', 'coupon', 'shipping_address', 'billing_address']
    list_filter         = ['status', 'payment_method', 'payment_status']
    search_fields       = ['user__email', 'tracking_number', 'courier_name']
    readonly_fields     = ['total_amount', 'discount_amount', 'created_at', 'updated_at']
    inlines             = [OrderItemInline]

    fieldsets = (
        ('Order Info', {
            'fields': ('user', 'placed_by_agent', 'status', 'payment_method', 'payment_status', 'total_amount'),
        }),
        ('Discount', {
            'fields': ('coupon', 'discount_amount'),
        }),
        ('Addresses', {
            'fields': ('shipping_address', 'billing_address'),
        }),
        ('Tracking Information', {
            'fields': ('courier_name', 'tracking_number', 'tracking_url'),
            'description': 'Fill these in once the order has been dispatched.',
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )


@admin.action(description='Mark selected commissions as Paid')
def mark_as_paid(modeladmin, request, queryset):
    queryset.update(status=Commission.Status.PAID, paid_at=timezone.now())


@admin.register(Commission)
class CommissionAdmin(admin.ModelAdmin):
    list_display        = ['id', 'agent', 'order', 'is_bonus', 'buyer', 'amount', 'commission_percentage', 'status', 'created_at', 'paid_at']
    # order__user powers the buyer() column without a per-row lookup
    list_select_related = ['agent', 'order', 'order__user']
    autocomplete_fields = ['agent', 'order']
    list_filter         = ['status', 'agent']
    search_fields       = ['agent__email', 'order__id', 'order__user__email']
    readonly_fields     = ['created_at', 'amount', 'commission_percentage']
    actions             = [mark_as_paid]
    ordering            = ['-created_at']

    def buyer(self, obj):
        return obj.order.user.email if obj.order else '—'
    buyer.short_description = 'Buyer'
    buyer.admin_order_field = 'order__user__email'

    def is_bonus(self, obj):
        return obj.order is None
    is_bonus.boolean = True
    is_bonus.short_description = 'Bonus?'


@admin.register(SampleOrder)
class SampleOrderAdmin(admin.ModelAdmin):
    list_display        = ['design_number', 'buyer', 'agent', 'rate', 'date', 'status', 'created_at']
    list_select_related = ['buyer', 'agent']
    autocomplete_fields = ['buyer', 'agent']
    list_filter         = ['status', 'agent', 'date']
    list_editable       = ['status']
    search_fields       = ['design_number', 'buyer__email', 'agent__email']
    ordering            = ['-date']