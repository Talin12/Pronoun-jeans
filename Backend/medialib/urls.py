"""
Media library admin API routes. Mounted under /admin/medialib/ in core.urls so
every endpoint sits behind the admin session (each view is also
@staff_member_required as defence in depth).
"""

from django.urls import path

from . import views

app_name = 'medialib'

urlpatterns = [
    # Assets
    path('api/assets/',                       views.asset_list,   name='asset_list'),
    path('api/assets/upload/',                views.asset_upload, name='asset_upload'),
    path('api/assets/<int:asset_id>/',        views.asset_detail, name='asset_detail'),
    path('api/assets/<int:asset_id>/update/', views.asset_update, name='asset_update'),
    path('api/assets/<int:asset_id>/usage/',  views.asset_usage,  name='asset_usage'),
    path('api/assets/<int:asset_id>/delete/', views.asset_delete, name='asset_delete'),

    # Attachments (polymorphic)
    path('api/<str:attachable_type>/<int:attachable_id>/attachments/',
         views.entity_attachments, name='entity_attachments'),
    path('api/<str:attachable_type>/<int:attachable_id>/attach/',
         views.entity_attach, name='entity_attach'),
    path('api/<str:attachable_type>/<int:attachable_id>/reorder/',
         views.entity_reorder, name='entity_reorder'),
    path('api/<str:attachable_type>/<int:attachable_id>/detach/',
         views.entity_detach, name='entity_detach'),
]
