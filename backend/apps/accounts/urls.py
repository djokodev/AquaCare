"""
Configuration des URLs pour l'application accounts.

Définit les endpoints API pour l'authentification et gestion des profils.
Ces URLs seront préfixées par '/api/accounts/' dans le projet principal.
"""

from django.urls import path

from . import views

app_name = 'accounts'

urlpatterns = [
    # Authentication endpoints
    path('register/', views.RegisterView.as_view(), name='register'),
    path('login/', views.LoginView.as_view(), name='login'),
    path('logout/', views.LogoutView.as_view(), name='logout'),
    path('token/refresh/', views.AccountsTokenRefreshView.as_view(), name='token_refresh'),
    path('token/verify/', views.AccountsTokenVerifyView.as_view(), name='token_verify'),
    
    # Profile management
    path('profile/', views.ProfileView.as_view(), name='profile'),
    path('farm/', views.FarmProfileView.as_view(), name='farm_profile'),

    # Farm setup + simulation
    path('farm/setup/', views.FarmSetupView.as_view(), name='farm_setup'),
    path('farm/simulate/', views.AnnualSimulationView.as_view(), name='annual_simulation'),

    # Account deletion
    path('delete/', views.AccountDeletionView.as_view(), name='delete_account'),
]
