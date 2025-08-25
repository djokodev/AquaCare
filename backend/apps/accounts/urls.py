"""
Configuration des URLs pour l'application accounts.

Définit les endpoints API pour l'authentification et gestion des profils.
Ces URLs seront préfixées par '/api/accounts/' dans le projet principal.
"""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

app_name = 'accounts'

urlpatterns = [
    # Authentication endpoints
    path('register/', views.RegisterView.as_view(), name='register'),
    path('login/', views.LoginView.as_view(), name='login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # Profile management
    path('profile/', views.ProfileView.as_view(), name='profile'),
    path('farm/', views.FarmProfileView.as_view(), name='farm_profile'),
]