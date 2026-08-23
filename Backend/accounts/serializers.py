from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import CustomUser, Address, AgentProfile


class B2BTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['email']           = user.email
        token['company_name']    = getattr(user, 'company_name', None)
        token['is_verified_b2b'] = getattr(user, 'is_verified_b2b', False)
        token['is_agent']        = getattr(user, 'is_agent', False)
        token['is_staff']        = user.is_staff
        token['is_superuser']    = user.is_superuser
        try:
            token['agent_code'] = user.agent_profile.agent_code
        except Exception:
            token['agent_code'] = None
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        if not (user.is_verified_b2b or user.is_agent or user.is_staff):
            raise serializers.ValidationError(
                'Your account is pending verification. Contact us at pronounjeans@gmail.com.'
            )
        return data


class UserSerializer(serializers.ModelSerializer):
    email           = serializers.EmailField(read_only=True)
    is_verified_b2b = serializers.BooleanField(read_only=True)

    class Meta:
        model  = CustomUser
        fields = ['id', 'email', 'company_name', 'gst_number', 'phone_number', 'is_verified_b2b']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model  = CustomUser
        fields = ['email', 'password', 'company_name', 'phone_number', 'gst_number']

    def create(self, validated_data):
        validated_data['username'] = validated_data['email']
        return CustomUser.objects.create_user(**validated_data)


class RequestAccessSerializer(serializers.Serializer):
    """
    Serializer for organic buyer self-registration via the Request Access modal.
    Supports optional agent_code for auto-mapping to an agent.
    """
    email        = serializers.EmailField()
    company_name = serializers.CharField(max_length=255)
    phone_number = serializers.CharField(max_length=15)
    gst_number   = serializers.CharField(max_length=15, required=False, allow_blank=True)
    agent_code   = serializers.CharField(max_length=20, required=False, allow_blank=True, write_only=True)
    password     = serializers.CharField(min_length=8, write_only=True)

    def validate_email(self, value):
        value = value.strip().lower()
        if CustomUser.objects.filter(email=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    def validate_agent_code(self, value):
        value = value.strip()
        if not value:
            return value
        try:
            AgentProfile.objects.get(agent_code=value)
        except AgentProfile.DoesNotExist:
            raise serializers.ValidationError('Invalid Agent Code. Please check with your agent.')
        return value

    def create(self, validated_data):
        agent_code   = validated_data.pop('agent_code', '').strip()
        gst_number   = validated_data.pop('gst_number', '').strip() or None
        password     = validated_data.pop('password', '').strip()
        email        = validated_data['email']
        company_name = validated_data['company_name']
        phone_number = validated_data['phone_number']

        assigned_agent = None
        if agent_code:
            try:
                agent_profile  = AgentProfile.objects.get(agent_code=agent_code)
                assigned_agent = agent_profile.user
            except AgentProfile.DoesNotExist:
                pass

        user = CustomUser(
            email           = email,
            username        = email,
            company_name    = company_name,
            phone_number    = phone_number,
            gst_number      = gst_number,
            is_verified_b2b = False,
            assigned_agent  = assigned_agent,
        )
        user.set_password(password)
        user.save()
        return user


class AgentBuyerSerializer(serializers.ModelSerializer):
    """Serializes basic buyer details visible to an agent."""
    full_name = serializers.SerializerMethodField()

    class Meta:
        model  = CustomUser
        fields = [
            'id', 'email', 'full_name', 'company_name',
            'phone_number', 'gst_number', 'is_verified_b2b', 'agent_can_order',
        ]

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip() or obj.email


class AddressSerializer(serializers.ModelSerializer):
    # What a courier or an invoice would actually use: the address's own
    # contact if one was entered, otherwise the account's. Read-only, so the
    # panel can show the real answer without having to re-implement the
    # fallback and drift from it.
    effective_phone = serializers.CharField(read_only=True)
    effective_email = serializers.CharField(read_only=True)

    class Meta:
        model  = Address
        fields = [
            'id', 'address_line_1', 'address_line_2', 'city', 'state',
            'pincode', 'contact_phone', 'contact_email',
            'effective_phone', 'effective_email',
            'is_default_shipping', 'is_default_billing',
        ]

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)