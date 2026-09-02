"""
Serializers for the superuser-only custom admin API.

These are deliberately separate from products/serializers.py (which is the
public, read-only storefront API): the admin needs to WRITE, needs to see
inactive/imageless products, and exposes management fields the storefront never
should. Image management is handled out-of-band via the media endpoints, so
these serializers treat images as read-only convenience data.
"""

import re
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.text import slugify
from rest_framework import serializers

from accounts.models import Address, AgentProfile
from orders.models import Cart, CartItem, Coupon, Order, OrderItem
from products.models import (
    Attribute, AttributeOption, Category, Color, HeroSlide, Product,
    ProductVariation, SizeSet, SizeSetBreakdown,
)

from .skus import build_sku

User = get_user_model()


def _image_url(field):
    try:
        return field.url if field else None
    except Exception:
        return None


def _thumb_url(field, width=400):
    """
    A CDN-resized delivery URL (w_/f_auto/q_auto) for panel thumbnails.

    The panel renders these at 56-200px, so linking the original meant a list of
    24 products pulled 24 full-size photos — tens of MB, and painful on a phone.
    Cloudinary generates the small AVIF/WebP copy on first request; nothing extra
    is stored.

    The transform is inserted into the URL the storage backend already produced,
    rather than rebuilt from the file's name: names are relative to the storage's
    `media/` prefix, and rebuilding without it yields a 404.
    """
    url = _image_url(field)
    if not url or '/upload/' not in url:
        return url
    return url.replace('/upload/', f'/upload/f_auto,q_auto,w_{width},c_limit/', 1)


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
    """
    Breakdown as written inside a SizeSet create/update (no size_set FK).

    `id` is writable on purpose: an update matches rows by it so an edit
    modifies breakdowns in place. Recreating them would hand out new ids, and
    ProductVariation.size_breakdown is SET_NULL — every variation using the set
    would quietly lose its breakdown.
    """
    id = serializers.IntegerField(required=False)

    class Meta:
        model  = SizeSetBreakdown
        fields = ['id', 'label', 'breakdown_string', 'pieces']


class SizeSetSerializer(serializers.ModelSerializer):
    breakdowns      = SizeSetBreakdownNestedSerializer(many=True, required=False)
    variation_count = serializers.SerializerMethodField()

    class Meta:
        model  = SizeSet
        fields = ['id', 'name', 'is_active', 'order', 'breakdowns', 'variation_count']

    def get_variation_count(self, obj):
        """How many variations use this set — the panel warns before removing."""
        count = getattr(obj, 'variation_count_annotated', None)
        return count if count is not None else obj.variations.count()

    def create(self, validated):
        breakdowns = validated.pop('breakdowns', [])
        size_set = SizeSet.objects.create(**validated)
        for b in breakdowns:
            b.pop('id', None)                      # ids are ours to assign
            SizeSetBreakdown.objects.create(size_set=size_set, **b)
        return size_set

    def update(self, instance, validated):
        breakdowns = validated.pop('breakdowns', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if breakdowns is not None:
            self._sync_breakdowns(instance, breakdowns)
        return instance

    def _sync_breakdowns(self, instance, rows):
        """
        Reconcile breakdowns by id: update the ones sent, create the new ones,
        remove the ones left out. A removal that variations still point at is
        refused rather than silently nulling them — deactivate the set, or move
        those variations first.
        """
        existing = {b.id: b for b in instance.breakdowns.all()}
        seen     = set()

        for row in rows:
            row = dict(row)
            bid = row.pop('id', None)
            current = existing.get(bid) if bid is not None else None
            if current is not None:
                for k, v in row.items():
                    setattr(current, k, v)
                current.save()
                seen.add(current.id)
            else:
                SizeSetBreakdown.objects.create(size_set=instance, **row)

        dropped  = [b for bid, b in existing.items() if bid not in seen]
        in_use   = [b for b in dropped if b.variations.exists()]
        if in_use:
            raise serializers.ValidationError({'breakdowns': [
                f'"{b.label}" is used by {b.variations.count()} variation(s) and '
                f'cannot be removed. Move those variations to another breakdown first.'
                for b in in_use
            ]})
        for b in dropped:
            b.delete()


class CategorySerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    image_url   = serializers.SerializerMethodField()

    class Meta:
        model  = Category
        fields = ['id', 'name', 'slug', 'parent', 'parent_name', 'image', 'image_url',
                  'description']
        extra_kwargs = {
            'image':       {'write_only': True, 'required': False},
            'slug':        {'required': False},
            'description': {'required': False},
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
            # Set totals are derived — per-piece price × pieces in the breakdown,
            # computed in ProductVariation.save(). Read-only so there is exactly
            # one way to price a variant and the two can never disagree.
            'b2b_price': {'read_only': True},
            'mrp':       {'read_only': True},
            'sku':       {'required': False, 'allow_blank': True},
            'image':     {'write_only': True, 'required': False},
        }

    def get_image_url(self, obj):
        return _image_url(obj.image)

    def _auto_sku(self, attrs):
        """
        CODE_COLOUR_SIZESET_<n>PCS, the same format the bulk builder produces.

        Generated whenever the SKU is left blank, so a variant added one at a
        time is named identically to one built in bulk.
        """
        product = attrs.get('product') or getattr(self.instance, 'product', None)
        if product is None:
            return None
        return build_sku(
            product,
            attrs.get('color_palette')  or getattr(self.instance, 'color_palette', None),
            attrs.get('size_set')       or getattr(self.instance, 'size_set', None),
            attrs.get('size_breakdown') or getattr(self.instance, 'size_breakdown', None),
            taken=set(ProductVariation.objects
                      .exclude(pk=getattr(self.instance, 'pk', None))
                      .values_list('sku', flat=True)),
        )

    def _resolved(self, attrs, field):
        """The value a field will have after this write.

        A PATCH omits everything it is not changing, so `attrs.get(field)` alone
        would read an unchanged colour as "no colour" and wave a real collision
        through.
        """
        if field in attrs:
            return attrs[field]
        return getattr(self.instance, field, None) if self.instance else None

    def _check_combo_is_free(self, attrs):
        """
        Refuse a second variant with the same product + size set + colour.

        The database enforces this (ProductVariation.Meta.unique_together), but
        it does so on `color` — the denormalised name that ProductVariation.save()
        copies off color_palette — and `color` is read-only here, which puts the
        constraint out of reach of DRF's automatic unique-together validator.
        Without this check the collision arrives as an IntegrityError, i.e. a
        500 with no field attached to it.

        The per-variant editor is what makes this reachable: it offers colour
        and size set as editable dropdowns, so recolouring a variant onto a
        colour the product already has in that size set is an ordinary slip,
        not an abuse of the API.
        """
        product     = self._resolved(attrs, 'product')
        size_set    = self._resolved(attrs, 'size_set')
        palette     = self._resolved(attrs, 'color_palette')
        # save() only writes `color` when a palette is set, so an untouched
        # colour on a palette-less row keeps whatever string it already had.
        color_name  = palette.name if palette else getattr(self.instance, 'color', None)

        # NULL never equals NULL in SQL, so a colourless variant does not
        # collide with another one — matching the constraint rather than being
        # stricter than it.
        if product is None or not color_name:
            return

        clash = (ProductVariation.objects
                 .filter(product=product, size_set=size_set, color=color_name)
                 .exclude(pk=getattr(self.instance, 'pk', None))
                 .exists())
        if clash:
            size_label = size_set.name if size_set else 'no size set'
            raise serializers.ValidationError({
                'color_palette': f'{product.name} already has a "{color_name}" '
                                 f'variant in {size_label}. Edit that one, or '
                                 f'pick a different colour or size set.',
            })

    def validate(self, attrs):
        # SKUs are generated, not typed — the panel sends a blank one and gets
        # the standard format back.
        if not (attrs.get('sku') or '').strip():
            generated = self._auto_sku(attrs)
            if generated:
                attrs['sku'] = generated
            elif self.instance is None:
                raise serializers.ValidationError({
                    'sku': 'Could not build a SKU — pick a product first.',
                })

        self._check_combo_is_free(attrs)

        # The set total is computed from the per-piece price, so that price is
        # the one required input. Variants predating this rule may carry a
        # b2b_price with no per-piece figure — those stay editable (a stock
        # edit must not demand a repricing), but a new one has to have it.
        per_piece = attrs.get('per_piece_price',
                              getattr(self.instance, 'per_piece_price', None))
        existing_total = getattr(self.instance, 'b2b_price', None)
        if per_piece in (None, '') and existing_total in (None, ''):
            raise serializers.ValidationError({
                'per_piece_price': 'Enter a per-piece price — the set total is '
                                   'calculated from it.',
            })
        return attrs


# ── Attributes (Fit, Fabric, Length, …) ───────────────────────────────────────

class AttributeOptionNestedSerializer(serializers.ModelSerializer):
    """
    An option as written inside an attribute create/update.

    `id` is writable on purpose: an update matches rows by it so renaming an
    option edits it in place. Recreating them would hand out new ids, and every
    product pointing at the old one would silently lose that spec line.
    """
    id = serializers.IntegerField(required=False)

    class Meta:
        model  = AttributeOption
        fields = ['id', 'value', 'order']


class AttributeSerializer(serializers.ModelSerializer):
    options       = AttributeOptionNestedSerializer(many=True, required=False)
    product_count = serializers.SerializerMethodField()

    class Meta:
        model  = Attribute
        fields = ['id', 'name', 'slug', 'multi_select', 'is_active', 'order',
                  'options', 'product_count']
        extra_kwargs = {'slug': {'required': False}}

    def get_product_count(self, obj):
        """How many products use any option of this attribute — the panel warns
        before removing one."""
        return Product.objects.filter(attribute_options__attribute=obj).distinct().count()

    def validate_name(self, value):
        name = (value or '').strip()
        if not name:
            raise serializers.ValidationError('Give the attribute a name.')
        return name

    def validate(self, attrs):
        if not attrs.get('slug'):
            base = slugify(attrs.get('name') or getattr(self.instance, 'name', ''))
            slug = base or 'attribute'
            n = 2
            qs = Attribute.objects.exclude(pk=getattr(self.instance, 'pk', None))
            while qs.filter(slug=slug).exists():
                slug = f'{base}-{n}'; n += 1
            attrs['slug'] = slug
        return attrs

    def create(self, validated):
        options = validated.pop('options', [])
        attribute = Attribute.objects.create(**validated)
        for index, option in enumerate(options):
            option.pop('id', None)                 # ids are ours to assign
            option.setdefault('order', index)
            AttributeOption.objects.create(attribute=attribute, **option)
        return attribute

    def update(self, instance, validated):
        options = validated.pop('options', None)
        for key, value in validated.items():
            setattr(instance, key, value)
        instance.save()
        if options is not None:
            self._sync_options(instance, options)
        return instance

    def _sync_options(self, instance, rows):
        """
        Reconcile options by id: update the ones sent, create the new ones,
        remove the ones left out. A removal that products still carry is
        refused rather than silently stripping the value off them — take it off
        those products first, or leave the option alone.
        """
        existing = {o.id: o for o in instance.options.all()}
        seen = set()

        for index, row in enumerate(rows):
            row = dict(row)
            oid = row.pop('id', None)
            row.setdefault('order', index)
            current = existing.get(oid) if oid is not None else None
            if current is not None:
                for key, value in row.items():
                    setattr(current, key, value)
                current.save()
                seen.add(current.id)
            else:
                AttributeOption.objects.get_or_create(
                    attribute=instance, value=row.get('value', ''),
                    defaults={'order': row.get('order', index)},
                )

        dropped = [o for oid, o in existing.items() if oid not in seen]
        in_use  = [o for o in dropped if o.products.exists()]
        if in_use:
            raise serializers.ValidationError({'options': [
                f'"{o.value}" is used by {o.products.count()} product(s) and '
                f'cannot be removed. Take it off those products first.'
                for o in in_use
            ]})
        for option in dropped:
            option.delete()


# ── Products ───────────────────────────────────────────────────────────────────

class ProductListSerializer(serializers.ModelSerializer):
    category_name   = serializers.CharField(source='category.name', read_only=True)
    thumb           = serializers.SerializerMethodField()
    variation_count = serializers.IntegerField(read_only=True)

    class Meta:
        model  = Product
        fields = ['id', 'name', 'code', 'slug', 'category', 'category_name',
                  'is_active', 'moq', 'thumb', 'variation_count', 'created_at']

    def get_thumb(self, obj):
        return _thumb_url(obj.image, width=400)


class ProductDetailSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    variations    = ProductVariationSerializer(many=True, read_only=True)
    image_url     = serializers.SerializerMethodField()
    og_image_url  = serializers.SerializerMethodField()
    # attribute_options is what the editor writes — a flat list of option ids.
    # `attributes` is the same data grouped for display, so the panel's review
    # step and the storefront read one shape and neither regroups it by hand.
    attributes    = serializers.SerializerMethodField()

    class Meta:
        model  = Product
        fields = [
            'id', 'name', 'code', 'slug', 'category', 'category_name', 'subcategories',
            'description', 'fabric_details', 'is_active', 'moq',
            'attribute_options', 'attributes',
            'image', 'image_url', 'variations', 'created_at', 'updated_at',
            'meta_title', 'meta_description', 'og_image', 'og_image_url',
        ]
        extra_kwargs = {
            'slug':     {'required': False},
            'code':     {'required': False},
            'image':    {'write_only': True, 'required': False},
            # Same shape as `image`: uploaded write-only, read back as a URL.
            'og_image': {'write_only': True, 'required': False, 'allow_null': True},
            'meta_title':       {'required': False, 'allow_blank': True},
            'meta_description': {'required': False, 'allow_blank': True},
        }

    def get_image_url(self, obj):
        return _image_url(obj.image)

    def get_og_image_url(self, obj):
        return _image_url(obj.og_image)

    def get_attributes(self, obj):
        return obj.grouped_attributes()

    def validate_attribute_options(self, options):
        """
        One value per attribute, unless that attribute says otherwise.

        Nothing in the schema can express this — it is an M2M, and the rule
        lives on the attribute rather than on the link. Without the check a
        product could carry "Slim Fit" and "Baggy Fit" at once, and the product
        page would print both, which is worse than printing neither.
        """
        picked = {}
        for option in options:
            picked.setdefault(option.attribute, []).append(option.value)

        clashes = [
            f'{attribute.name}: {", ".join(sorted(values))}'
            for attribute, values in picked.items()
            if not attribute.multi_select and len(values) > 1
        ]
        if clashes:
            raise serializers.ValidationError(
                'Only one value is allowed for these — ' + '; '.join(sorted(clashes))
                + '. Pick one, or allow multiple on the attribute itself.'
            )
        return options

    def validate_code(self, value):
        """
        Normalise to the form SKUs are built from: upper case, no spaces.

        Blank comes back as None, not '' — the column is unique, and '' on a
        second product would collide where NULL does not.
        """
        code = re.sub(r'[^A-Z0-9-]', '', (value or '').upper().replace(' ', '-'))
        if not code:
            return None
        if Product.objects.exclude(pk=getattr(self.instance, 'pk', None)).filter(code=code).exists():
            raise serializers.ValidationError(f'"{code}" is already used by another product.')
        return code

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
    # Resolved through the account's details when the address carries none —
    # the panel is where support looks up who to ring about a delivery.
    effective_phone = serializers.CharField(read_only=True)
    effective_email = serializers.CharField(read_only=True)

    class Meta:
        model  = Address
        fields = ['id', 'address_line_1', 'address_line_2', 'city', 'state',
                  'pincode', 'contact_phone', 'contact_email',
                  'effective_phone', 'effective_email',
                  'is_default_shipping', 'is_default_billing']


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


# ── Hero slides ────────────────────────────────────────────────────────────────
#
# The image is not written here. HeroSlide is registered with medialib as the
# ('banner', 'primary') single-image slot, so the panel attaches it through the
# media endpoints exactly as it does a category tile — one upload, reusable
# everywhere, and the legacy `image` column stays in sync for the storefront.
#
# `image` therefore has to be optional on write: a slide is created caption-first
# and only then has an id for the picker to attach to. Django stores an unset
# ImageField as '', so a slide with no picture yet is a valid row — and one the
# panel flags rather than publishes.

class HeroSlideSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    thumb_url = serializers.SerializerMethodField()

    class Meta:
        model  = HeroSlide
        fields = ['id', 'caption', 'order', 'is_active', 'image', 'image_url', 'thumb_url']
        extra_kwargs = {
            'image':   {'write_only': True, 'required': False},
            'caption': {'required': False},
        }

    def get_image_url(self, obj):
        return _image_url(obj.image)

    def get_thumb_url(self, obj):
        return _thumb_url(obj.image, 480)


# ── Coupons ────────────────────────────────────────────────────────────────────

class CouponSerializer(serializers.ModelSerializer):
    # Whether the code would be accepted at checkout right now. `is_active` alone
    # does not answer that — a coupon can be switched on and still sit outside
    # its window — and that gap is exactly what a "why is my code rejected?"
    # call is about.
    is_currently_valid = serializers.SerializerMethodField()
    # Annotated in the viewset. Redemptions are the one number that decides
    # whether a coupon is safe to retire.
    order_count        = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model  = Coupon
        fields = ['id', 'code', 'discount_type', 'discount_value', 'min_order_value',
                  'is_active', 'valid_from', 'valid_to', 'created_at',
                  'is_currently_valid', 'order_count']
        read_only_fields = ['created_at']

    def get_is_currently_valid(self, obj):
        return obj.is_valid()

    def validate_code(self, value):
        # Buyers type these by hand, in whatever case they like; checkout matches
        # exactly. Normalising on the way in is what keeps SUMMER10 and summer10
        # from becoming two coupons that shadow each other.
        return value.strip().upper()

    def validate(self, attrs):
        start = attrs.get('valid_from', getattr(self.instance, 'valid_from', None))
        end   = attrs.get('valid_to',   getattr(self.instance, 'valid_to',   None))
        if start and end and end <= start:
            raise serializers.ValidationError(
                {'valid_to': 'The end of the window must come after its start.'})

        d_type  = attrs.get('discount_type',
                            getattr(self.instance, 'discount_type', None))
        d_value = attrs.get('discount_value',
                            getattr(self.instance, 'discount_value', None))
        if d_value is not None and Decimal(str(d_value)) <= 0:
            raise serializers.ValidationError(
                {'discount_value': 'The discount must be greater than zero.'})
        if (d_type == Coupon.DiscountType.PERCENTAGE
                and d_value is not None and Decimal(str(d_value)) > 100):
            raise serializers.ValidationError(
                {'discount_value': 'A percentage discount cannot exceed 100%.'})
        return attrs


# ── Line items (orders and carts share one shape) ──────────────────────────────
#
# Both are read-only in the panel, and both describe the same thing: which
# variation, how many, what it comes to. A single presenter keeps an order line
# and a cart line looking alike wherever they are shown.
#
# Every field tolerates a missing variation. OrderItem.variation is SET_NULL, so
# a line whose product was later deleted still has to render — it is part of an
# order someone paid for.

class _LineItemSerializer(serializers.Serializer):
    id           = serializers.IntegerField(read_only=True)
    variation    = serializers.IntegerField(source='variation_id', read_only=True)
    sku          = serializers.SerializerMethodField()
    product_id   = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    size         = serializers.SerializerMethodField()
    color_name   = serializers.SerializerMethodField()
    quantity     = serializers.IntegerField(read_only=True)
    thumb_url    = serializers.SerializerMethodField()

    def get_sku(self, obj):
        return obj.variation.sku if obj.variation_id else '[deleted]'

    def get_product_id(self, obj):
        return obj.variation.product_id if obj.variation_id else None

    def get_product_name(self, obj):
        if not obj.variation_id or not obj.variation.product_id:
            return 'Removed product'
        return obj.variation.product.name

    def get_size(self, obj):
        v = obj.variation if obj.variation_id else None
        return v.size_set.name if v and v.size_set_id else ''

    def get_color_name(self, obj):
        v = obj.variation if obj.variation_id else None
        if not v:
            return ''
        return v.color_palette.name if v.color_palette_id else (v.color or '')

    def get_thumb_url(self, obj):
        v = obj.variation if obj.variation_id else None
        if not v:
            return None
        image = v.image or (v.product.image if v.product_id else None)
        return _thumb_url(image, 160)


class AdminOrderItemSerializer(_LineItemSerializer):
    """Order lines carry the price the buyer was charged, not today's price."""
    price      = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    line_total = serializers.SerializerMethodField()

    def get_line_total(self, obj):
        return str((obj.price or Decimal('0')) * obj.quantity)


class AdminCartItemSerializer(_LineItemSerializer):
    """
    Cart lines have no stored price — nothing has been charged yet — so they are
    quoted at the variation's current b2b_price, and flagged when the variation
    has since gone away or run short. Those two flags are the point of the page:
    an admin ringing a buyer about a full cart needs to know what is still
    orderable.
    """
    unit_price   = serializers.SerializerMethodField()
    line_total   = serializers.SerializerMethodField()
    unavailable  = serializers.SerializerMethodField()
    out_of_stock = serializers.SerializerMethodField()

    def get_unit_price(self, obj):
        return str(obj.variation.b2b_price) if obj.variation_id else None

    def get_line_total(self, obj):
        if not obj.variation_id:
            return None
        return str((obj.variation.b2b_price or Decimal('0')) * obj.quantity)

    def get_unavailable(self, obj):
        return not obj.variation_id

    def get_out_of_stock(self, obj):
        return bool(obj.variation_id and obj.variation.stock_quantity < obj.quantity)


# ── Orders ─────────────────────────────────────────────────────────────────────
#
# Orders are never created or deleted here. They come from checkout, and a paid
# order is a record — the panel's job is to move it along (verify the payment,
# set a status, add tracking), not to invent or erase one. The viewset allows
# only list/retrieve/partial_update, and every field outside that job is
# read-only below.

class OrderListSerializer(serializers.ModelSerializer):
    user_email     = serializers.CharField(source='user.email', read_only=True, default=None)
    company_name   = serializers.CharField(source='user.company_name', read_only=True, default=None)
    agent_email    = serializers.CharField(source='placed_by_agent.email', read_only=True, default=None)
    coupon_code    = serializers.CharField(source='coupon.code', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    grand_total    = serializers.SerializerMethodField()
    item_count     = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model  = Order
        fields = ['id', 'user', 'user_email', 'company_name', 'agent_email',
                  'status', 'status_display', 'payment_method', 'payment_status',
                  'payment_verified', 'payment_proof_type',
                  'total_amount', 'discount_amount', 'grand_total', 'amount_paid',
                  'balance_due', 'coupon_code', 'courier_name', 'tracking_number',
                  'item_count', 'created_at', 'updated_at']

    def get_grand_total(self, obj):
        return str(obj.grand_total)


class OrderDetailSerializer(serializers.ModelSerializer):
    items          = AdminOrderItemSerializer(many=True, read_only=True)
    user_email     = serializers.CharField(source='user.email', read_only=True, default=None)
    company_name   = serializers.CharField(source='user.company_name', read_only=True, default=None)
    user_phone     = serializers.CharField(source='user.phone_number', read_only=True, default=None)
    gst_number     = serializers.CharField(source='user.gst_number', read_only=True, default=None)
    agent_email    = serializers.CharField(source='placed_by_agent.email', read_only=True, default=None)
    coupon_code    = serializers.CharField(source='coupon.code', read_only=True, default=None)
    shipping       = AddressSerializer(source='shipping_address', read_only=True)
    billing        = AddressSerializer(source='billing_address', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    grand_total    = serializers.SerializerMethodField()
    payment_screenshot_url = serializers.SerializerMethodField()

    class Meta:
        model  = Order
        fields = [
            'id', 'user', 'user_email', 'company_name', 'user_phone', 'gst_number',
            'agent_email', 'items',
            # Editable — the four things the panel exists to do.
            'status', 'status_display', 'payment_status', 'payment_verified',
            'courier_name', 'tracking_number', 'tracking_url',
            # Money, all read-only: it was settled at checkout.
            'total_amount', 'discount_amount', 'upi_discount', 'amount_paid',
            'balance_due', 'grand_total', 'coupon_code',
            'payment_method', 'payment_plan', 'payment_proof_type', 'utr_number',
            'payment_screenshot_url', 'razorpay_order_id', 'razorpay_payment_id',
            'shipping', 'billing', 'created_at', 'updated_at',
        ]
        # Anything not in the short writable list above is a fact about a placed
        # order. Naming the read-only side explicitly — rather than trusting the
        # panel to send only four fields — is what stops a stray PATCH from
        # rewriting what a buyer was charged.
        read_only_fields = [
            'user', 'total_amount', 'discount_amount', 'upi_discount',
            'amount_paid', 'balance_due', 'payment_method', 'payment_plan',
            'payment_proof_type', 'utr_number', 'razorpay_order_id',
            'razorpay_payment_id', 'created_at', 'updated_at',
        ]

    def get_grand_total(self, obj):
        return str(obj.grand_total)

    def get_payment_screenshot_url(self, obj):
        return _image_url(obj.payment_screenshot)


# ── Carts ──────────────────────────────────────────────────────────────────────
#
# Read-only, and deliberately so: a cart belongs to the buyer who is filling it,
# and an admin editing one under them is how a customer ends up paying for
# something they never chose. What the panel offers is visibility — who is close
# to ordering, and whether what they picked can still be shipped.

class CartListSerializer(serializers.ModelSerializer):
    user_email      = serializers.CharField(source='user.email', read_only=True)
    company_name    = serializers.CharField(source='user.company_name', read_only=True, default=None)
    user_phone      = serializers.CharField(source='user.phone_number', read_only=True, default=None)
    is_verified_b2b = serializers.BooleanField(source='user.is_verified_b2b', read_only=True)
    item_count      = serializers.IntegerField(read_only=True, default=0)
    total_quantity  = serializers.SerializerMethodField()
    estimated_value = serializers.SerializerMethodField()

    class Meta:
        model  = Cart
        fields = ['id', 'user', 'user_email', 'company_name', 'user_phone',
                  'is_verified_b2b', 'item_count', 'total_quantity',
                  'estimated_value', 'created_at', 'updated_at']

    def get_total_quantity(self, obj):
        return sum(i.quantity for i in obj.items.all())

    def get_estimated_value(self, obj):
        # At today's prices, and skipping lines whose variation has gone — a
        # cart is a quote, not a bill.
        total = sum(((i.variation.b2b_price or Decimal('0')) * i.quantity)
                    for i in obj.items.all() if i.variation_id)
        return str(total)


class CartDetailSerializer(CartListSerializer):
    items = AdminCartItemSerializer(many=True, read_only=True)

    class Meta(CartListSerializer.Meta):
        fields = CartListSerializer.Meta.fields + ['items']
