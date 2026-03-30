"""
Configuration des URLs pour l'application accounts.

Définit les endpoints API pour l'authentification et gestion des profils.
Ces URLs seront préfixées par '/api/accounts/' dans le projet principal.
"""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from . import views

app_name = 'accounts'

urlpatterns = [
    # Authentication endpoints
    path('register/', views.RegisterView.as_view(), name='register'),
    path('login/', views.LoginView.as_view(), name='login'),
    path('logout/', views.LogoutView.as_view(), name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('token/verify/', TokenVerifyView.as_view(), name='token_verify'),
    
    # Profile management
    path('profile/', views.ProfileView.as_view(), name='profile'),
    path('farm/', views.FarmProfileView.as_view(), name='farm_profile'),

    # Account deletion
    path('delete/', views.AccountDeletionView.as_view(), name='delete_account'),

    # Admin — carte des fermes géolocalisées (is_staff only)
    path('farms/map/', views.FarmMapView.as_view(), name='farms_map'),
]
