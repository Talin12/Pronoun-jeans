from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from unfold.admin import ModelAdmin, TabularInline
from .models import CustomUser, Address


@admin.register(CustomUser)
class CustomUserAdmin(ModelAdmin, UserAdmin):
    list_display  = ['email', 'company_name', 'phone_number', 'gst_number', 'is_verified_b2b', 'is_staff', 'date_joined']
    list_filter   = ['is_verified_b2b', 'is_staff', 'is_active']
    search_fields = ['email', 'company_name', 'gst_number', 'phone_number']
    ordering      = ['-date_joined']

    fieldsets = UserAdmin.fieldsets + (
        ('B2B Details', {
            'fields': ('company_name', 'gst_number', 'phone_number', 'is_verified_b2b')
        }),
    )

    add_fieldsets = UserAdmin.add_fieldsets + (
        ('B2B Details', {
            'fields': ('email', 'company_name', 'gst_number', 'phone_number', 'is_verified_b2b')
        }),
    )


@admin.register(Address)
class AddressAdmin(ModelAdmin):
    list_display  = ['user', 'address_line_1', 'city', 'state', 'pincode', 'is_default_shipping', 'is_default_billing']
    list_filter   = ['state', 'is_default_shipping', 'is_default_billing']
    search_fields = ['user__email', 'city', 'pincode']