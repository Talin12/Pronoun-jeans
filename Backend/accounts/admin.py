from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser, AgentProfile, AgentPayment, Address


@admin.register(AgentProfile)
class AgentProfileAdmin(admin.ModelAdmin):
    list_display        = ['user', 'agent_code', 'commission_percentage']
    list_select_related = ['user']
    autocomplete_fields = ['user']
    search_fields       = ['user__email', 'agent_code']
    ordering            = ['agent_code']


@admin.register(AgentPayment)
class AgentPaymentAdmin(admin.ModelAdmin):
    list_display        = ['agent', 'amount', 'paid_on', 'utr_reference', 'created_at']
    list_select_related = ['agent']
    autocomplete_fields = ['agent']
    list_filter         = ['agent', 'paid_on']
    search_fields       = ['agent__email', 'utr_reference']
    ordering            = ['-paid_on']
    fieldsets = (
        ('Payout Details', {
            'fields': ('agent', 'amount', 'paid_on', 'utr_reference', 'notes'),
        }),
    )


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display  = [
        'email', 'company_name', 'phone_number', 'gst_number',
        'is_verified_b2b', 'is_agent', 'agent_can_order', 'assigned_agent', 'is_staff', 'date_joined',
    ]
    readonly_fields = ['agent_can_order']
    list_select_related = ['assigned_agent']
    autocomplete_fields = ['assigned_agent']
    list_filter   = ['is_verified_b2b', 'is_agent', 'is_staff', 'is_active', 'agent_can_order']
    search_fields = ['email', 'company_name', 'gst_number', 'phone_number']
    ordering      = ['-date_joined']

    fieldsets = UserAdmin.fieldsets + (
        ('B2B Details', {
            'fields': ('company_name', 'gst_number', 'phone_number', 'is_verified_b2b'),
        }),
        ('Agent', {
            'fields': ('is_agent', 'assigned_agent', 'agent_can_order'),
            'description': (
                'Set is_agent=True for agent accounts. '
                'Use assigned_agent to map a buyer to their agent. '
                'agent_can_order is read-only here — set by the buyer from their dashboard.'
            ),
        }),
    )

    add_fieldsets = UserAdmin.add_fieldsets + (
        ('B2B Details', {
            'fields': ('email', 'company_name', 'gst_number', 'phone_number', 'is_verified_b2b'),
        }),
        ('Agent', {
            'fields': ('is_agent', 'assigned_agent'),
        }),
    )


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display        = ['user', 'address_line_1', 'city', 'state', 'pincode',
                           'contact_phone', 'is_default_shipping', 'is_default_billing']
    list_select_related = ['user']
    autocomplete_fields = ['user']
    list_filter         = ['state', 'is_default_shipping', 'is_default_billing']
    # Support looks an address up by the number that was on the parcel at least
    # as often as by the account it belongs to.
    search_fields       = ['user__email', 'city', 'pincode',
                           'contact_phone', 'contact_email']