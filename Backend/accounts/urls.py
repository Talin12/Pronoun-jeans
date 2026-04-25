from django.urls import path
from .views import (
    RegisterView, RequestAccessView, ProfileView,
    AddressListCreateView, AddressDetailView
)

urlpatterns = [
    path('register/',       RegisterView.as_view(),          name='register'),
    path('request-access/', RequestAccessView.as_view(),     name='request-access'),
    path('profile/',        ProfileView.as_view(),           name='profile'),
    path('addresses/',      AddressListCreateView.as_view(), name='address-list'),
    path('addresses/<int:pk>/', AddressDetailView.as_view(), name='address-detail'),
]