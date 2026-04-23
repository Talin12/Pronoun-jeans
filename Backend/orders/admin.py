from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline
from .models import Cart, CartItem, Order, OrderItem


class CartItemInline(TabularInline):
    model  = CartItem
    extra  = 0
    fields = ['variation', 'quantity']


class OrderItemInline(TabularInline):
    model           = OrderItem
    extra           = 0
    fields          = ['variation', 'quantity', 'price']
    readonly_fields = ['price']


@admin.register(Cart)
class CartAdmin(ModelAdmin):
    list_display = ['user', 'created_at', 'updated_at']
    inlines      = [CartItemInline]


@admin.register(Order)
class OrderAdmin(ModelAdmin):
    list_display    = ['id', 'user', 'status', 'total_amount', 'created_at']
    list_filter     = ['status']
    search_fields   = ['user__email']
    readonly_fields = ['total_amount', 'created_at', 'updated_at']
    inlines         = [OrderItemInline]