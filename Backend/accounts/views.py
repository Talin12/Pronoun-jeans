from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import CustomUser, Address
from .serializers import (
    B2BTokenObtainPairSerializer, UserSerializer,
    RegisterSerializer, AddressSerializer
)


class B2BTokenObtainPairView(TokenObtainPairView):
    serializer_class = B2BTokenObtainPairSerializer


class RegisterView(generics.CreateAPIView):
    queryset           = CustomUser.objects.all()
    permission_classes = [AllowAny]
    serializer_class   = RegisterSerializer


class RequestAccessView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email        = request.data.get('email', '').strip().lower()
        company_name = request.data.get('company_name', '').strip()
        phone_number = request.data.get('phone_number', '').strip()
        gst_number   = request.data.get('gst_number', '').strip()

        if not email or not company_name or not phone_number:
            return Response(
                {'error': 'Email, company name, and phone number are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if CustomUser.objects.filter(email=email).exists():
            return Response(
                {'error': 'An account with this email already exists.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = CustomUser(
            email           = email,
            username        = email,
            company_name    = company_name,
            phone_number    = phone_number,
            gst_number      = gst_number or None,
            is_verified_b2b = False,
        )
        user.set_unusable_password()
        user.save()

        return Response(
            {'message': 'Access request submitted. Our team will contact you shortly.'},
            status=status.HTTP_201_CREATED
        )


class ProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class   = UserSerializer

    def get_object(self):
        return self.request.user


class AddressListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class   = AddressSerializer

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class AddressDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class   = AddressSerializer

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)