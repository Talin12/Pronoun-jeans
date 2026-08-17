"""
Serializers for the superuser-only custom admin API.

These are deliberately separate from products/serializers.py (which is the
public, read-only storefront API): the admin needs to WRITE, needs to see
inactive/imageless products, and exposes management fields the storefront never
should. Image management is handled out-of-band via the media endpoints, so
these serializers treat images as read-only convenience data.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.text import slugify
from rest_framework import serializers

from accounts.models import Address, AgentProfile
from products.models import (
    Category, Color, Product, ProductVariation, SizeSet, SizeSetBreakdown,
)

User = get_user_model()


def _image_url(field):
    try:
        return field.url if field else None
    except Exception:
        return None


# ── Reference data (dropdowns) ─────────────────────────────────────────────────

class ColorSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Color
        fields = ['id', 'name', 'hex_code']


class SizeSetBreakdownSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SizeSetBreakdown
        fields = ['id', 'size_set', 'label', 'breakdown_string', 'pieces']


class SizeSetBreakdownNestedSerializer(serializers.ModelSerializer):
    """Breakdown as written inside a SizeSet create/update (no size_set FK)."""
    class Meta:
        model  = SizeSetBreakdown
        fields = ['id', 'label', 'breakdown_string', 'pieces']


class SizeSetSerializer(serializers.ModelSerializer):
    breakdowns = SizeSetBreakdownNestedSerializer(many=True, required=False)

    class Meta:
        model  = SizeSet
        fields = ['id', 'name', 'is_active', 'order', 'breakdowns']

    def create(self, validated):
        breakdowns = validated.pop('breakdowns', [])
        size_set = SizeSet.objects.create(**validated)
        for b in breakdowns:
            SizeSetBreakdown.objects.create(size_set=size_set, **b)
        return size_set

    def update(self, instance, validated):
        breakdowns = validated.pop('breakdowns', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if breakdowns is not None:
            # Full replace — the panel always sends the complete breakdown list.
            instance.breakdowns.all().delete()
            for b in breakdowns:
                SizeSetBreakdown.objects.create(size_set=instance, **b)
        return instance


class CategorySerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    image_url   = serializers.SerializerMethodField()

    class Meta:
        model  = Category
        fields = ['id', 'name', 'slug', 'parent', 'parent_name', 'image', 'image_url']
        extra_kwargs = {
            'image': {'write_only': True, 'required': False},
            'slug':  {'required': False},
        }

    def get_image_url(self, obj):
        return _image_url(obj.image)

    def validate(self, attrs):
        # Auto-slug from name if not supplied.
        if not attrs.get('slug'):
            base = slugify(attrs.get('name') or getattr(self.instance, 'name', ''))
            slug = base or 'category'
            n = 2
            qs = Category.objects.exclude(pk=getattr(self.instance, 'pk', None))
            while qs.filter(slug=slug).exists():
                slug = f'{base}-{n}'; n += 1
            attrs['slug'] = slug
        return attrs


# ── Variations ─────────────────────────────────────────────────────────────────

class ProductVariationSerializer(serializers.ModelSerializer):
    color         = serializers.CharField(read_only=True)  # derived from color_palette
    size_name     = serializers.CharField(source='size_set.name', read_only=True)
    color_name    = serializers.CharField(source='color_palette.name', read_only=True)
    image_url     = serializers.SerializerMethodField()

    class Meta:
        model  = ProductVariation
        fields = [
            'id', 'product', 'size_set', 'size_name', 'size_breakdown',
            'color_palette', 'color', 'color_name', 'sku',
            'per_piece_price', 'mrp_per_piece', 'b2b_price', 'mrp',
            'stock_quantity', 'image', 'image_url',
        ]
        extra_kwargs = {
            'b2b_price': {'required': False},
            'mrp':       {'required': False},
            'image':     {'write_only': True, 'required': False},
        }

    def get_image_url(self, obj):
        return _image_url(obj.image)

    def validate(self, attrs):
        # b2b_price auto-fills from per_piece_price × pieces in the model, but one
        # of the two must exist because b2b_price is required at the DB level.
        per_piece = attrs.get('per_piece_price',
                              getattr(self.instance, 'per_piece_price', None))
        b2b       = attrs.get('b2b_price',
                              getattr(self.instance, 'b2b_price', None))
        if per_piece in (None, '') and b2b in (None, ''):
            raise serializers.ValidationError({
                'per_piece_price': 'Enter a per-piece price (the total is calculated '
                                   'automatically) or fill in the total price directly.'
            })
        return attrs


# ── Products ───────────────────────────────────────────────────────────────────

class ProductListSerializer(serializers.ModelSerializer):
    category_name   = serializers.CharField(source='category.name', read_only=True)
    thumb           = serializers.SerializerMethodField()
    variation_count = serializers.IntegerField(read_only=True)

    class Meta:
        model  = Product
        fields = ['id', 'name', 'slug', 'category', 'category_name',
                  'is_active', 'moq', 'thumb', 'variation_count', 'created_at']

    def get_thumb(self, obj):
        return _image_url(obj.image)


class ProductDetailSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    variations    = ProductVariationSerializer(many=True, read_only=True)
    image_url     = serializers.SerializerMethodField()

    class Meta:
        model  = Product
        fields = [
            'id', 'name', 'slug', 'category', 'category_name', 'subcategories',
            'description', 'fabric_details', 'is_active', 'moq',
            'image', 'image_url', 'variations', 'created_at',
        ]
        extra_kwargs = {
            'slug':  {'required': False},
            'image': {'write_only': True, 'required': False},
        }

    def get_image_url(self, obj):
        return _image_url(obj.image)

    def validate(self, attrs):
        # Only auto-slug on create or when the name itself changes. A partial
        # update (e.g. the Active toggle on the product list) must never quietly
        # re-slug a live product and break its storefront URL.
        if not attrs.get('slug') and (self.instance is None or 'name' in attrs):
            base = slugify(attrs.get('name') or getattr(self.instance, 'name', ''))
            slug = base or 'product'
            n = 2
            qs = Product.objects.exclude(pk=getattr(self.instance, 'pk', None))
            while qs.filter(slug=slug).exists():
                slug = f'{base}-{n}'; n += 1
            attrs['slug'] = slug
        return attrs


# ── Users, permissions & B2B verification ─────────────────────────────────────
#
# The panel manages people here: approve a B2B buyer, hand out staff/superuser
# access, promote someone to agent, or park an account. Deletion is deliberately
# not offered — deactivating keeps the account's orders intact.

class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Address
        fields = ['id', 'address_line_1', 'address_line_2', 'city', 'state',
                  'pincode', 'is_default_shipping', 'is_default_billing']


class AgentProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model  = AgentProfile
        fields = ['agent_code', 'commission_percentage']


class UserListSerializer(serializers.ModelSerializer):
    agent_code          = serializers.CharField(source='agent_profile.agent_code',
                                                read_only=True, default=None)
    assigned_agent_email = serializers.CharField(source='assigned_agent.email',
                                                 read_only=True, default=None)

    class Meta:
        model  = User
        fields = [
            'id', 'email', 'username', 'company_name', 'phone_number', 'gst_number',
            'is_verified_b2b', 'is_agent', 'is_active', 'is_staff', 'is_superuser',
            'agent_can_order', 'assigned_agent', 'assigned_agent_email', 'agent_code',
            'date_joined', 'last_login',
        ]


class UserDetailSerializer(serializers.ModelSerializer):
    """
    Everything the panel can change about a person, plus read-only context
    (addresses, joined/last-seen) to decide whether to verify them.
    """
    agent_profile = AgentProfileSerializer(required=False, allow_null=True)
    addresses     = AddressSerializer(many=True, read_only=True)
    assigned_agent_email = serializers.CharField(source='assigned_agent.email',
                                                 read_only=True, default=None)
    # Write-only: setting a password for an account the admin is creating or
    # resetting. Never echoed back.
    password      = serializers.CharField(write_only=True, required=False,
                                          allow_blank=True, trim_whitespace=False)

    class Meta:
        model  = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name',
            'company_name', 'gst_number', 'phone_number',
            'is_verified_b2b', 'is_agent', 'is_active', 'is_staff', 'is_superuser',
            'agent_can_order', 'assigned_agent', 'assigned_agent_email',
            'agent_profile', 'addresses', 'password',
            'date_joined', 'last_login',
        ]
        read_only_fields = ['date_joined', 'last_login', 'agent_can_order']
        extra_kwargs = {
            'username': {'required': False},
        }

    def validate_password(self, value):
        if not value:
            return value
        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value

    def validate_assigned_agent(self, value):
        if value is None:
            return value
        if self.instance is not None and value.pk == self.instance.pk:
            raise serializers.ValidationError('A user cannot be their own agent.')
        if not (value.is_agent or hasattr(value, 'agent_profile')):
            raise serializers.ValidationError('That user is not an agent.')
        return value

    def validate(self, attrs):
        # Only checked when this request actually promotes someone to agent, so
        # unrelated PATCHes (a verification toggle, say) never trip over a
        # legacy agent that predates its profile row.
        if attrs.get('is_agent') is True:
            code = (attrs.get('agent_profile') or {}).get('agent_code')
            existing = (self.instance is not None
                        and AgentProfile.objects.filter(user=self.instance).exists())
            if not code and not existing:
                raise serializers.ValidationError({
                    'agent_profile': 'An agent needs an agent code.',
                })
        return attrs

    def _save_agent_profile(self, user, data):
        """
        Only touched while the user is an agent: AgentProfile.save() forces
        is_agent back on, so writing it for a non-agent would silently undo the
        demotion. Demoting leaves the row in place so the code and commission
        survive if they are promoted again.
        """
        if data is None or not user.is_agent:
            return
        AgentProfile.objects.update_or_create(user=user, defaults=data)

    def create(self, validated):
        profile  = validated.pop('agent_profile', None)
        password = validated.pop('password', '')
        validated.setdefault('username', validated['email'])
        user = User(**validated)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        self._save_agent_profile(user, profile)
        return user

    def update(self, instance, validated):
        profile  = validated.pop('agent_profile', None)
        password = validated.pop('password', '')
        for k, v in validated.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        self._save_agent_profile(instance, profile)
        return instance
