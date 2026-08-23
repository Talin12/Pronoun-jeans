from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django.views.decorators.vary import vary_on_headers
from rest_framework import viewsets, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response

from django.db.models import Prefetch

from .models import Category, Product, ProductVariation, HeroSlide
from .serializers import CategorySerializer, ProductSerializer


class IsVerifiedB2B(BasePermission):
    """Allows access only to verified B2B buyers, agents, and staff."""
    message = 'B2B verification required to view wholesale prices.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and
            user.is_authenticated and
            (user.is_verified_b2b or user.is_agent or user.is_staff)
        )


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [AllowAny]
    serializer_class   = CategorySerializer
    lookup_field       = 'slug'

    def get_queryset(self):
        # Only main (top-level) categories are listed/looked-up here — their
        # sub-categories come along nested via CategorySerializer.
        return Category.objects.filter(parent__isnull=True).prefetch_related('subcategories')


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [AllowAny]
    serializer_class   = ProductSerializer
    lookup_field     = 'slug'
    filter_backends  = [filters.SearchFilter]
    search_fields    = ['name', 'slug', 'variations__sku']

    def get_serializer(self, *args, **kwargs):
        """
        Batch-load shared media-library attachments for every product being
        serialised (list page or single detail) in ONE query, so the
        `library_media` field never triggers N+1. The map is threaded through
        serializer context. MediaAttachment is polymorphic (no FK back to
        Product), so this can't be a plain prefetch_related.
        """
        if args:
            instance = args[0]
            # many=True (the list page) hands us a QuerySet or a pagination
            # Page, not a list — materialise it once so the batch maps below
            # actually get built (and so the prefetch cache is populated before
            # serialization iterates it). A single retrieve() hands us one
            # instance. Getting this wrong silently skips batching and N+1s.
            if kwargs.get('many'):
                objs = list(instance)
            else:
                objs = [instance]
            ids = [o.id for o in objs if getattr(o, 'id', None) is not None]
            if ids:
                from collections import defaultdict
                from medialib.models import MediaAttachment
                mapping = defaultdict(list)
                atts = (MediaAttachment.objects
                        .filter(attachable_type='product', attachable_id__in=ids,
                                media__deleted_at__isnull=True)
                        .select_related('media')
                        # serialize_asset reads media.categories (m2m) — prefetch
                        # it or every asset costs an extra query.
                        .prefetch_related('media__categories')
                        .order_by('sort_order', 'id'))
                for a in atts:
                    mapping[a.attachable_id].append(a)
                ctx = kwargs.setdefault('context', self.get_serializer_context())
                ctx['media_by_product'] = mapping

                # Per-variation video clips, batched the same way. Variations
                # are already prefetched (get_queryset), so reading .variations
                # here is free. One extra query total, not one per variation.
                var_ids = [v.id for o in objs for v in o.variations.all()]
                videos_by_variation = defaultdict(list)
                if var_ids:
                    vatts = (MediaAttachment.objects
                             .filter(attachable_type='variation', attachable_id__in=var_ids,
                                     media__media_type='video',
                                     media__deleted_at__isnull=True)
                             .select_related('media')
                             .prefetch_related('media__categories')
                             .order_by('sort_order', 'id'))
                    for a in vatts:
                        videos_by_variation[a.attachable_id].append(a)
                ctx['videos_by_variation'] = videos_by_variation
        return super().get_serializer(*args, **kwargs)

    def get_queryset(self):
        queryset = (
            Product.objects
            .filter(is_active=True)
            .exclude(image__isnull=True)
            .exclude(image__exact='')
            .select_related('category')
            .prefetch_related(
                'subcategories',
                'gallery_images',
                # Shared per product+color gallery, used by
                # ProductVariationSerializer.get_gallery_images. Prefetching
                # here lets that method filter in Python instead of firing one
                # ProductColorImage query per variation (N+1 → worker timeout).
                'color_images',
                # size_set / size_breakdown / color_palette are FKs read for
                # every variation during serialization. Without select_related
                # each one is a separate query per variation.
                Prefetch(
                    'variations',
                    queryset=ProductVariation.objects
                    .select_related('size_set', 'size_breakdown', 'color_palette')
                    .prefetch_related('gallery_images'),
                ),
            )
        )
        category_slug = self.request.query_params.get('category')
        if category_slug:
            queryset = queryset.filter(category__slug=category_slug)
        subcategory_slug = self.request.query_params.get('subcategory')
        if subcategory_slug:
            queryset = queryset.filter(subcategories__slug=subcategory_slug)
        return queryset

    @method_decorator(cache_page(60 * 15))
    @method_decorator(vary_on_headers('Authorization'))
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @method_decorator(cache_page(60 * 15))
    @method_decorator(vary_on_headers('Authorization'))
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)


@api_view(['GET'])
@permission_classes([AllowAny])
def hero_slides(request):
    """
    GET /api/products/hero-slides/
    Returns active hero slides ordered by 'order' field.
    Public endpoint — no auth required so the homepage loads for all visitors.
    """
    slides = HeroSlide.objects.filter(is_active=True).order_by('order', 'id')
    data   = [
        {
            'id':      s.pk,
            'image':   request.build_absolute_uri(s.image.url) if s.image else None,
            'caption': s.caption,
        }
        for s in slides
        if s.image
    ]
    return Response(data)