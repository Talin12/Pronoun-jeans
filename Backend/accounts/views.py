# Backend/accounts/views.py

from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import B2BTokenObtainPairSerializer


class B2BTokenObtainPairView(TokenObtainPairView):
    serializer_class = B2BTokenObtainPairSerializer