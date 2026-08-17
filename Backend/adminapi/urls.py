"""Superuser-only admin API routes, mounted at /api/admin/."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'products',   views.ProductViewSet,          basename='admin-product')
router.register(r'variations', views.ProductVariationViewSet, basename='admin-variation')
router.register(r'categories', views.CategoryViewSet,         basename='admin-category')
router.register(r'colors',     views.ColorViewSet,            basename='admin-color')
router.register(r'size-sets',  views.SizeSetViewSet,          basename='admin-sizeset')

urlpatterns = [
    path('', include(router.urls)),

    # Media library (JWT + superuser)
    path('media/assets/',            views.MediaAssetListView.as_view(), name='admin-media-assets'),
    path('media/assets/upload/',     views.MediaUploadView.as_view(),    name='admin-media-upload'),
    path('media/assets/categorize/', views.MediaCategorizeView.as_view(), name='admin-media-categorize'),
    path('media/sections/',          views.MediaSectionsView.as_view(),  name='admin-media-sections'),
    path('media/<str:attachable_type>/<int:attachable_id>/attachments/',
         views.EntityAttachmentsView.as_view(), name='admin-media-attachments'),
    path('media/<str:attachable_type>/<int:attachable_id>/attach/',
         views.EntityAttachView.as_view(),      name='admin-media-attach'),
    path('media/<str:attachable_type>/<int:attachable_id>/detach/',
         views.EntityDetachView.as_view(),      name='admin-media-detach'),
    path('media/<str:attachable_type>/<int:attachable_id>/reorder/',
         views.EntityReorderView.as_view(),     name='admin-media-reorder'),
]
