# Backend/accounts/serializers.py

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import CustomUser


class B2BTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['email'] = user.email
        token['company_name'] = getattr(user, 'company_name', None)
        token['is_verified_b2b'] = getattr(user, 'is_verified_b2b', False)
        return token


class UserSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(read_only=True)
    is_verified_b2b = serializers.BooleanField(read_only=True)

    class Meta:
        model = CustomUser
        fields = ['id', 'email', 'company_name', 'gst_number', 'phone_number', 'is_verified_b2b']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = CustomUser
        fields = ['email', 'password', 'company_name', 'phone_number', 'gst_number']

    def create(self, validated_data):
        return CustomUser.objects.create_user(**validated_data)