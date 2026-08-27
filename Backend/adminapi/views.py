"""
Superuser-only admin API powering the custom /admin panel on the frontend.

Everything here is JWT-authenticated (the same tokens the storefront uses) and
gated by IsSuperUser. Image management reuses medialib.services so picks made in
the custom panel behave identically to the Django-admin picker (dedup + the
Phase 7 legacy-column bridge), and therefore render on the storefront at once.
"""

import logging
from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from medialib import presenters, services
from medialib.models import ATTACHABLE_TYPES, ROLE_CHOICES
from products.models import (
    Attribute, Category, Color, Product, ProductVariation, SizeSet,
)

from .permissions import IsSuperUser
from .skus import build_sku
from .serializers import (
    AttributeSerializer, CategorySerializer, ColorSerializer,
    ProductDetailSerializer, ProductListSerializer, ProductVariationSerializer,
    SizeSetSerializer, UserDetailSerializer, UserListSerializer,
)

logger = logging.getLogger(__name__)

_VALID_TYPES = {t for t, _ in ATTACHABLE_TYPES}
_VALID_ROLES = {r for r, _ in ROLE_CHOICES}


class AdminPagination(PageNumberPagination):
    page_size             = 24
    page_size_query_param = 'page_size'
    max_page_size         = 100


# ── Products ───────────────────────────────────────────────────────────────────

class ProductViewSet(viewsets.ModelViewSet):
    """Full CRUD over products. Unlike the storefront API, this shows every
    product — inactive and image-less included — so nothing is hidden from the
    admin."""
    permission_classes = [IsSuperUser]
    pagination_class   = AdminPagination
    filter_backends    = [filters.SearchFilter, filters.OrderingFilter]
    search_fields      = ['name', 'slug', 'variations__sku']
    # variation_count is the annotation below, not a column — it is here so the
    # panel can surface the products that were started and never finished.
    ordering_fields    = ['created_at', 'name', 'moq', 'variation_count']
    ordering           = ['-created_at']

    def get_queryset(self):
        qs = (Product.objects
              .select_related('category')
              .annotate(variation_count=Count('variations', distinct=True)))

        # ?category=<id> — everything filed under that category. For a main
        # category that includes products sitting on its sub-categories, since
        # the panel lists a main and its subs as one tree.
        category = self.request.query_params.get('category')
        if category:
            try:
                cid = int(category)
            except (TypeError, ValueError):
                return qs.none()
            qs = qs.filter(
                Q(category_id=cid) | Q(subcategories__id=cid)
                | Q(category__parent_id=cid) | Q(subcategories__parent_id=cid)
            ).distinct()

        # ?is_active=true|false — the panel's Status filter. Anything else is
        # ignored rather than treated as false, so a typo shows everything
        # instead of silently hiding every live product.
        is_active = self.request.query_params.get('is_active')
        if is_active in ('true', 'false'):
            qs = qs.filter(is_active=(is_active == 'true'))

        if self.action == 'retrieve':
            qs = qs.prefetch_related(
                'subcategories',
                # grouped_attributes() walks option.attribute for every option,
                # so the attribute comes along or the editor pays a query each.
                'attribute_options__attribute',
                'variations__size_set', 'variations__size_breakdown',
                'variations__color_palette',
            )
        return qs

    def get_serializer_class(self):
        if self.action in ('list',):
            return ProductListSerializer
        return ProductDetailSerializer


class UserViewSet(viewsets.ModelViewSet):
    """
    People management: B2B verification, permissions, agent setup.

    No destroy() — removing a user would cascade into their orders, so the panel
    deactivates instead. Two guards protect the signed-in superuser from locking
    themselves (or the last superuser) out of the panel.
    """
    permission_classes = [IsSuperUser]
    pagination_class   = AdminPagination
    filter_backends    = [filters.SearchFilter, filters.OrderingFilter]
    search_fields      = ['email', 'username', 'company_name', 'gst_number',
                          'phone_number', 'first_name', 'last_name']
    ordering_fields    = ['date_joined', 'email', 'last_login']
    ordering           = ['-date_joined']
    http_method_names  = ['get', 'post', 'patch', 'put', 'head', 'options']

    _FLAGS = {
        'verified': 'is_verified_b2b',
        'agent':    'is_agent',
        'active':   'is_active',
        'staff':    'is_staff',
    }

    def get_queryset(self):
        User = get_user_model()
        qs = (User.objects
              .select_related('assigned_agent', 'agent_profile')
              .prefetch_related('addresses'))

        # ?role=buyer|agent|staff — the three groups the panel thinks in.
        role = self.request.query_params.get('role')
        if role == 'agent':
            qs = qs.filter(is_agent=True)
        elif role == 'staff':
            qs = qs.filter(Q(is_staff=True) | Q(is_superuser=True))
        elif role == 'buyer':
            qs = qs.filter(is_agent=False, is_staff=False, is_superuser=False)

        # ?verified=true&active=false … booleans on the flags above.
        for param, field in self._FLAGS.items():
            raw = self.request.query_params.get(param)
            if raw in ('true', 'false'):
                qs = qs.filter(**{field: raw == 'true'})
        return qs

    def get_serializer_class(self):
        return UserListSerializer if self.action == 'list' else UserDetailSerializer

    def perform_update(self, serializer):
        self._guard_self_lockout(serializer)
        self._guard_last_superuser(serializer)
        serializer.save()

    def _guard_self_lockout(self, serializer):
        """You cannot revoke your own access — that would end the session with
        no way back in except the Django admin or a shell."""
        target = serializer.instance
        if target is None or target.pk != self.request.user.pk:
            return
        for field in ('is_superuser', 'is_active', 'is_staff'):
            if serializer.validated_data.get(field) is False:
                raise DRFValidationError({
                    field: 'You cannot remove this from your own account. '
                           'Ask another superuser to do it.',
                })

    def _guard_last_superuser(self, serializer):
        """Never let the final superuser be demoted or deactivated."""
        target = serializer.instance
        if target is None or not target.is_superuser:
            return
        losing = (serializer.validated_data.get('is_superuser') is False
                  or serializer.validated_data.get('is_active') is False)
        if not losing:
            return
        User = get_user_model()
        others = (User.objects.filter(is_superuser=True, is_active=True)
                  .exclude(pk=target.pk).exists())
        if not others:
            raise DRFValidationError({
                'is_superuser': 'This is the last active superuser — promote '
                                'someone else before changing this account.',
            })


class ProductVariationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsSuperUser]
    serializer_class   = ProductVariationSerializer

    def get_queryset(self):
        qs = (ProductVariation.objects
              .select_related('product', 'size_set', 'size_breakdown', 'color_palette'))
        product_id = self.request.query_params.get('product')
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs

    @action(detail=False, methods=['post'], url_path='bulk')
    def bulk(self, request):
        """
        Create the whole colour × size grid in one call.

        The panel sends the colours and the size sets it wants; every
        combination becomes a variation sharing one price and stock figure.
        Combinations that already exist are skipped, not errored — re-running
        the builder to add one more colour is a normal thing to do, and
        (product, size_set, color) is unique anyway.
        """
        data       = request.data
        product_id = data.get('product')
        color_ids  = data.get('colors') or []
        combos     = data.get('size_sets') or []   # [{size_set, size_breakdown}]

        product = Product.objects.filter(pk=product_id).first()
        if product is None:
            return Response({'error': 'Unknown product.'}, status=400)

        per_piece = data.get('per_piece_price')
        if per_piece in (None, ''):
            return Response(
                {'per_piece_price': 'Enter a per-piece price — the set total is '
                                    'calculated from it.'}, status=400)
        try:
            per_piece = Decimal(str(per_piece))
            mrp_piece = (Decimal(str(data['mrp_per_piece']))
                         if data.get('mrp_per_piece') not in (None, '') else None)
            stock     = int(data.get('stock_quantity') or 0)
        except (InvalidOperation, TypeError, ValueError):
            return Response({'error': 'Price and stock must be numbers.'}, status=400)

        colors = list(Color.objects.filter(id__in=color_ids)) if color_ids else [None]
        if color_ids and len(colors) != len(set(color_ids)):
            return Response({'colors': 'One or more colours no longer exist.'}, status=400)

        pairs = []
        for c in combos:
            size_set = SizeSet.objects.filter(pk=c.get('size_set')).first()
            if size_set is None:
                return Response({'size_sets': 'One or more size sets no longer exist.'},
                                status=400)
            breakdown = None
            if c.get('size_breakdown'):
                breakdown = size_set.breakdowns.filter(pk=c['size_breakdown']).first()
                if breakdown is None:
                    return Response(
                        {'size_sets': f'That breakdown does not belong to {size_set.name}.'},
                        status=400)
            pairs.append((size_set, breakdown))
        if not pairs:
            pairs = [(None, None)]

        if len(colors) * len(pairs) == 0:
            return Response({'error': 'Nothing to create.'}, status=400)

        prefix = data.get('sku_prefix') or None

        taken = set(ProductVariation.objects.values_list('sku', flat=True))
        existing = set(
            ProductVariation.objects
            .filter(product=product)
            .values_list('size_set_id', 'color')
        )

        created, skipped = [], []
        with transaction.atomic():
            for color in colors:
                for size_set, breakdown in pairs:
                    key = (size_set.id if size_set else None, color.name if color else None)
                    if key in existing:
                        skipped.append({
                            'color':    color.name if color else None,
                            'size_set': size_set.name if size_set else None,
                        })
                        continue

                    sku = build_sku(product, color, size_set, breakdown,
                                    prefix=prefix, taken=taken)
                    variation = ProductVariation(
                        product=product, size_set=size_set, size_breakdown=breakdown,
                        color_palette=color, sku=sku,
                        per_piece_price=per_piece, mrp_per_piece=mrp_piece,
                        stock_quantity=stock,
                    )
                    variation.save()
                    taken.add(sku)
                    existing.add(key)
                    created.append(variation)

        return Response({
            'created': ProductVariationSerializer(created, many=True).data,
            'skipped': skipped,
        }, status=201 if created else 200)


class CategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsSuperUser]
    serializer_class   = CategorySerializer
    filter_backends    = [filters.SearchFilter]
    search_fields      = ['name', 'slug']

    def get_queryset(self):
        return Category.objects.select_related('parent').order_by('parent__name', 'name')

    def destroy(self, request, *args, **kwargs):
        """
        Only a completely empty category can be deleted — no sub-categories,
        no products.

        Nothing in the schema enforces either half. Product.category is
        SET_NULL and Product.subcategories is a plain M2M, so a delete would
        succeed and quietly unfile every product; and `parent` cascades, so
        deleting "Men" would silently take "Men → Boxers" with it and unfile
        everything under that too. Both are losses an admin never asked for and
        would not see happen.

        Requiring the branch to be dismantled from the bottom up makes every
        step visible: empty the sub-category, delete it, then the parent.
        """
        category = self.get_object()

        children = category.subcategories.all()
        child_count = children.count()
        products = category.linked_products()
        product_count = products.count()

        if child_count or product_count:
            return Response(
                {'error': self._blocked_message(category, child_count, product_count),
                 'child_count':   child_count,
                 'product_count': product_count,
                 # Named so the panel can show what is in the way rather than
                 # only how much. Capped: this is a prompt to go and fix them,
                 # not a listing screen.
                 'child_names':   list(children.values_list('name', flat=True)[:10]),
                 'product_names': list(products.values_list('name', flat=True)[:10]),
                 'category_id':   category.pk},
                status=409,
            )
        return super().destroy(request, *args, **kwargs)

    @staticmethod
    def _blocked_message(category, child_count, product_count):
        """
        One sentence naming what is in the way and what to do about it.

        Written per case rather than assembled from fragments: "1 products" and
        "0 sub-categories" are what generic pluralisation produces here, and an
        admin reading a refusal is the last person who should have to decode it.
        """
        label = 'sub-category' if category.parent_id else 'category'

        inside, todo = [], []
        if child_count:
            inside.append(f'{child_count} sub-categor'
                          f'{"y" if child_count == 1 else "ies"}')
            todo.append('delete the sub-categories')
        if product_count:
            inside.append(f'{product_count} product'
                          f'{"" if product_count == 1 else "s"}')
            todo.append('move the products out')

        # Only what is actually in the way: telling an admin to delete
        # sub-categories that do not exist sends them looking for something
        # they will not find.
        return (
            f'"{category}" still has {" and ".join(inside)} inside it. '
            f'A {label} can only be deleted once it is completely empty — '
            f'{" and ".join(todo)} first.'
        )


class AttributeViewSet(viewsets.ModelViewSet):
    """
    Fit, Fabric, Length and friends, with their options.

    Writable so a new fabric is a row the admin adds mid-upload rather than a
    deploy — the same reason SizeSetViewSet is writable.
    """
    permission_classes = [IsSuperUser]
    serializer_class   = AttributeSerializer

    def get_queryset(self):
        qs = Attribute.objects.prefetch_related('options').order_by('order', 'name')
        # Active-only by default — that is what the product editor wants. The
        # management page passes ?include_inactive=true so a retired attribute
        # stays visible and can be switched back on.
        if self.request.query_params.get('include_inactive') != 'true':
            qs = qs.filter(is_active=True)
        return qs

    def destroy(self, request, *args, **kwargs):
        """
        Deleting an attribute in use would strip that spec line off every
        product carrying it, with nothing on the product page saying it went.
        Deactivating hides it from the editor and leaves the products intact,
        so that is what the message points at.
        """
        attribute = self.get_object()
        used = Product.objects.filter(attribute_options__attribute=attribute).distinct().count()
        if used:
            return Response(
                {'error': f'"{attribute.name}" is used by {used} product(s). '
                          f'Deactivate it instead — that hides it from the product '
                          f'editor without changing those products.',
                 'product_count': used},
                status=409,
            )
        return super().destroy(request, *args, **kwargs)


class ColorViewSet(viewsets.ModelViewSet):
    permission_classes = [IsSuperUser]
    serializer_class   = ColorSerializer
    queryset           = Color.objects.all().order_by('name')


class SizeSetViewSet(viewsets.ModelViewSet):
    """Size sets + their breakdowns. Writable so the panel can create a size set
    on the fly (matching bijnis' 'Create Custom' size set) — no need to bounce to
    the Django admin mid-upload."""
    permission_classes = [IsSuperUser]
    serializer_class   = SizeSetSerializer

    def get_queryset(self):
        qs = (SizeSet.objects
              .prefetch_related('breakdowns')
              .annotate(variation_count_annotated=Count('variations', distinct=True))
              .order_by('order', 'name'))
        # Active-only by default — that is what the variant dropdowns want. The
        # Size Sets management page passes ?include_inactive=true so a
        # deactivated set stays visible and can be switched back on.
        if self.request.query_params.get('include_inactive') != 'true':
            qs = qs.filter(is_active=True)
        return qs

    def destroy(self, request, *args, **kwargs):
        """
        Deleting a set in use would SET_NULL every variation's size — the model
        says to deactivate instead, so refuse and say so. Unused sets delete
        normally (their breakdowns cascade).
        """
        size_set = self.get_object()
        used = size_set.variations.count()
        if used:
            return Response(
                {'error': f'"{size_set.name}" is used by {used} variation(s). '
                          f'Deactivate it instead — that hides it from the size '
                          f'dropdown without changing existing products.',
                 'variation_count': used},
                status=409,
            )
        return super().destroy(request, *args, **kwargs)


# ── Media (JWT) ────────────────────────────────────────────────────────────────
#
# Mirror of the medialib session endpoints, but JWT+superuser gated so the React
# picker works cross-domain (Vercel → Render). All mutation logic lives in
# medialib.services and is shared with the Django-admin picker.

class MediaAssetListView(APIView):
    permission_classes = [IsSuperUser]

    def get(self, request):
        from django.core.paginator import Paginator

        qs = services.live_assets().prefetch_related('categories')

        # ?category=<id> — one library section. Omit it for "All images".
        category = request.query_params.get('category', '').strip()
        if category:
            try:
                qs = services.in_category(qs, int(category))
            except (TypeError, ValueError):
                qs = qs.none()

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(original_filename__icontains=search)
                | Q(title__icontains=search)
                | Q(alt_text__icontains=search)
                | Q(tags__icontains=search)
            )
        folder = request.query_params.get('folder', '').strip()
        if folder:
            qs = qs.filter(folder=folder)

        try:
            per_page = min(int(request.query_params.get('per_page', 40)), 100)
        except (TypeError, ValueError):
            per_page = 40
        paginator = Paginator(qs, per_page)
        page = paginator.get_page(request.query_params.get('page', 1))
        return Response({
            'results':  [presenters.serialize_asset(a) for a in page.object_list],
            'page':     page.number,
            'pages':    paginator.num_pages,
            'count':    paginator.count,
            'has_next': page.has_next(),
        })


class MediaSectionsView(APIView):
    """
    The library's sections: "All images" plus one per category, each with a live
    image count, so the panel can render the section list in a single request.
    """
    permission_classes = [IsSuperUser]

    def get(self, request):
        live = services.live_assets()
        # One grouped query instead of a count per category. A main category's
        # own total also rolls up its sub-categories (see services.in_category).
        counts = dict(
            live.order_by()                       # drop Meta.ordering from GROUP BY
                .values_list('categories__id')
                .annotate(n=Count('id', distinct=True))
                .values_list('categories__id', 'n')
        )
        cats = list(Category.objects.select_related('parent')
                    .order_by('parent__name', 'name'))
        rollup = {c.id: counts.get(c.id, 0) for c in cats}
        for c in cats:
            if c.parent_id:
                rollup[c.parent_id] = rollup.get(c.parent_id, 0) + counts.get(c.id, 0)

        return Response({
            'total':    live.count(),
            'sections': [{
                'id':          c.id,
                'name':        c.name,
                'parent':      c.parent_id,
                'parent_name': c.parent.name if c.parent_id else None,
                'count':       rollup.get(c.id, 0),
            } for c in cats],
        })


class MediaUploadView(APIView):
    permission_classes = [IsSuperUser]
    parser_classes     = [MultiPartParser, FormParser]

    def post(self, request):
        files = request.FILES.getlist('files') or request.FILES.getlist('file')
        if not files:
            return Response({'error': 'No files provided.'}, status=400)
        folder = (request.data.get('folder') or '').strip() or None

        # Upload straight into a section: everything uploaded from the Boxers
        # tab is filed under Boxers as well as showing in All images.
        categories = []
        for raw in request.data.getlist('categories') or request.data.getlist('category'):
            try:
                categories.append(int(raw))
            except (TypeError, ValueError):
                return Response({'error': f'Invalid category "{raw}".'}, status=400)
        if categories:
            known = set(Category.objects.filter(id__in=categories)
                        .values_list('id', flat=True))
            unknown = [c for c in categories if c not in known]
            if unknown:
                return Response({'error': f'Unknown category: {unknown}'}, status=400)

        results, errors = [], []
        for f in files:
            try:
                asset, deduped = services.ingest_upload(
                    f, uploaded_by=request.user, folder=folder, filename=f.name,
                    categories=categories,
                )
            except services.MediaValidationError as e:
                errors.append({'filename': f.name, 'error': str(e)})
            except Exception as e:
                # Superuser-only endpoint, so surface the real reason (Cloudinary
                # rejection, decode error, timeout) rather than a blanket message
                # that hid what actually went wrong. Logged too, for the server side.
                logger.exception('Media upload failed for %s', f.name)
                detail = str(e).strip() or e.__class__.__name__
                errors.append({'filename': f.name, 'error': f'Upload failed: {detail}'})
            else:
                results.append({
                    'asset':        presenters.serialize_asset(asset),
                    'deduplicated': deduped,
                })
        return Response({'results': results, 'errors': errors},
                        status=200 if results else 400)


class MediaCategorizeView(APIView):
    """Move images already in the library into (or out of) a section."""
    permission_classes = [IsSuperUser]

    def post(self, request):
        media_ids = request.data.get('media_ids') or []
        add       = request.data.get('add') or []
        remove    = request.data.get('remove') or []
        if not media_ids:
            return Response({'error': 'media_ids required'}, status=400)
        if not add and not remove:
            return Response({'error': 'Nothing to add or remove'}, status=400)

        wanted = set(add) | set(remove)
        known  = set(Category.objects.filter(id__in=wanted).values_list('id', flat=True))
        if wanted - known:
            return Response({'error': f'Unknown category: {sorted(wanted - known)}'}, status=400)

        updated = services.categorize_assets(media_ids, add=add, remove=remove)
        return Response({'ok': True, 'updated': updated})


def _valid_entity(attachable_type):
    return attachable_type in _VALID_TYPES


class EntityAttachmentsView(APIView):
    permission_classes = [IsSuperUser]

    def get(self, request, attachable_type, attachable_id):
        if not _valid_entity(attachable_type):
            return Response({'error': 'Unknown type'}, status=400)
        # ?role=primary|gallery — one slot only, so a role-bound picker never
        # renders (and never offers to remove) another slot's attachments.
        role = request.query_params.get('role')
        if role and role not in _VALID_ROLES:
            return Response({'error': 'Unknown role'}, status=400)
        qs = services.list_attachments(attachable_type, attachable_id, role=role)
        return Response({'attachments': [presenters.serialize_attachment(a) for a in qs]})


class EntityAttachView(APIView):
    permission_classes = [IsSuperUser]

    def post(self, request, attachable_type, attachable_id):
        if not _valid_entity(attachable_type):
            return Response({'error': 'Unknown type'}, status=400)
        role = request.data.get('role', 'gallery')
        if role not in _VALID_ROLES:
            return Response({'error': 'Unknown role'}, status=400)
        media_ids = request.data.get('media_ids') or []
        try:
            created = services.attach_assets(attachable_type, attachable_id, media_ids, role)
        except ValueError as e:
            return Response({'error': str(e)}, status=400)
        return Response({'attachments': [presenters.serialize_attachment(a) for a in created]})


class EntityDetachView(APIView):
    permission_classes = [IsSuperUser]

    def post(self, request, attachable_type, attachable_id):
        if not _valid_entity(attachable_type):
            return Response({'error': 'Unknown type'}, status=400)
        try:
            deleted = services.detach_assets(
                attachable_type, attachable_id,
                attachment_id=request.data.get('attachment_id'),
                media_id=request.data.get('media_id'),
                role=request.data.get('role'),
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=400)
        return Response({'ok': True, 'detached': deleted})


class EntityReorderView(APIView):
    permission_classes = [IsSuperUser]

    def post(self, request, attachable_type, attachable_id):
        if not _valid_entity(attachable_type):
            return Response({'error': 'Unknown type'}, status=400)
        updated = services.reorder_assets(
            attachable_type, attachable_id, request.data.get('order') or [],
        )
        return Response({'ok': True, 'updated': updated})
