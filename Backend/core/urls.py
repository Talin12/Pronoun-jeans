from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView
from accounts.views import B2BTokenObtainPairView, LogoutView

# ── Custom admin branding ─────────────────────────────────────────────────────
admin.site.site_header  = 'Pronoun Jeans Admin'
admin.site.site_title   = 'Pronoun Jeans'
admin.site.index_title  = 'Dashboard'

urlpatterns = [
    path('admin/medialib/', include('medialib.urls')),
    path('admin/', admin.site.urls),
    path('api/products/', include('products.urls')),
    path('api/auth/token/', B2BTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/logout/', LogoutView.as_view(), name='logout'),
    path('api/accounts/', include('accounts.urls')),
    path('api/orders/', include('orders.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)