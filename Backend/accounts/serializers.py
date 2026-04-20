# Backend/accounts/serializers.py

from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class B2BTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Embed B2B-relevant claims directly into the JWT payload
        token['email'] = user.email
        token['company_name'] = getattr(user, 'company_name', None)
        token['is_verified_b2b'] = getattr(user, 'is_verified_b2b', False)

        return token