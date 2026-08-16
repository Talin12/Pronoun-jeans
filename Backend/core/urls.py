from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from rest_framework_simplejwt.views import TokenRefreshView
from accounts.views import B2BTokenObtainPairView, LogoutView

# ── Custom admin branding ─────────────────────────────────────────────────────
admin.site.site_header  = 'Pronoun Jeans Admin'
admin.site.site_title   = 'Pronoun Jeans'
admin.site.index_title  = 'Dashboard'


def health(request):
    """
    Liveness probe — deliberately does NOT touch the DB, cache or Cloudinary so
    it stays near-zero cost. Used by Render's healthCheckPath and by the external
    keep-alive pinger that stops the free instance idling out (a hit every ~10min
    is negligible load). Public + method-agnostic (GET/HEAD) so any monitor works.
    """
    return JsonResponse({'ok': True})


urlpatterns = [
    path('api/health/', health, name='health'),
    path('admin/medialib/', include('medialib.urls')),
    path('admin/', admin.site.urls),
    path('api/products/', include('products.urls')),
    path('api/admin/', include('adminapi.urls')),
    path('api/auth/token/', B2BTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/logout/', LogoutView.as_view(), name='logout'),
    path('api/accounts/', include('accounts.urls')),
    path('api/orders/', include('orders.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)