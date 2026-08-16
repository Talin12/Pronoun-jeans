"""
Superuser-only admin API powering the custom /admin panel on the frontend.

Everything here is JWT-authenticated (the same tokens the storefront uses) and
gated by IsSuperUser. Image management reuses medialib.services so picks made in
the custom panel behave identically to the Django-admin picker (dedup + the
Phase 7 legacy-column bridge), and therefore render on the storefront at once.
"""

from django.db.models import Count
from rest_framework import filters, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from medialib import presenters, services
from medialib.models import ATTACHABLE_TYPES, ROLE_CHOICES
from products.models import (
    Category, Color, Product, ProductVariation, SizeSet,
)

from .permissions import IsSuperUser
from .serializers import (
    CategorySerializer, ColorSerializer, ProductDetailSerializer,
    ProductListSerializer, ProductVariationSerializer, SizeSetSerializer,
)

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
    ordering_fields    = ['created_at', 'name', 'moq']
    ordering           = ['-created_at']

    def get_queryset(self):
        qs = (Product.objects
              .select_related('category')
              .annotate(variation_count=Count('variations', distinct=True)))
        if self.action == 'retrieve':
            qs = qs.prefetch_related(
                'subcategories',
                'variations__size_set', 'variations__size_breakdown',
                'variations__color_palette',
            )
        return qs

    def get_serializer_class(self):
        if self.action in ('list',):
            return ProductListSerializer
        return ProductDetailSerializer


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


class CategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsSuperUser]
    serializer_class   = CategorySerializer
    filter_backends    = [filters.SearchFilter]
    search_fields      = ['name', 'slug']

    def get_queryset(self):
        return Category.objects.select_related('parent').order_by('parent__name', 'name')


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
    queryset           = (SizeSet.objects.filter(is_active=True)
                          .prefetch_related('breakdowns').order_by('order', 'name'))


# ── Media (JWT) ────────────────────────────────────────────────────────────────
#
# Mirror of the medialib session endpoints, but JWT+superuser gated so the React
# picker works cross-domain (Vercel → Render). All mutation logic lives in
# medialib.services and is shared with the Django-admin picker.

class MediaAssetListView(APIView):
    permission_classes = [IsSuperUser]

    def get(self, request):
        from django.core.paginator import Paginator
        from django.db.models import Q

        qs = services.live_assets()
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


class MediaUploadView(APIView):
    permission_classes = [IsSuperUser]
    parser_classes     = [MultiPartParser, FormParser]

    def post(self, request):
        files = request.FILES.getlist('files') or request.FILES.getlist('file')
        if not files:
            return Response({'error': 'No files provided.'}, status=400)
        folder = (request.data.get('folder') or '').strip() or None
        results, errors = [], []
        for f in files:
            try:
                asset, deduped = services.ingest_upload(
                    f, uploaded_by=request.user, folder=folder, filename=f.name,
                )
            except services.MediaValidationError as e:
                errors.append({'filename': f.name, 'error': str(e)})
            except Exception:
                errors.append({'filename': f.name, 'error': 'Upload failed, please try again.'})
            else:
                results.append({
                    'asset':        presenters.serialize_asset(asset),
                    'deduplicated': deduped,
                })
        return Response({'results': results, 'errors': errors},
                        status=200 if results else 400)


def _valid_entity(attachable_type):
    return attachable_type in _VALID_TYPES


class EntityAttachmentsView(APIView):
    permission_classes = [IsSuperUser]

    def get(self, request, attachable_type, attachable_id):
        if not _valid_entity(attachable_type):
            return Response({'error': 'Unknown type'}, status=400)
        qs = services.list_attachments(attachable_type, attachable_id)
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
