from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django.views.decorators.vary import vary_on_headers
from rest_framework import viewsets, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response

from .models import Category, Product, HeroSlide
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

    def get_queryset(self):
        queryset = (
            Product.objects
            .filter(is_active=True)
            .exclude(image__isnull=True)
            .exclude(image__exact='')
            .prefetch_related('variations__gallery_images', 'gallery_images')
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