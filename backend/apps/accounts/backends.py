from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import BaseBackend
from django.http import HttpRequest

User = get_user_model()

if TYPE_CHECKING:
    from .models import User as UserModel


class AquaCareAuthBackend(BaseBackend):
    """
    Backend d'authentification AquaCare selon les règles métier.
    
    Permet l'authentification avec :
    - login_name (nom de personne ou d'entreprise) + password
    - phone_number + password (pour compatibilité interne)
    """
    
    def authenticate(
        self,
        request: HttpRequest | None,
        login_name: str | None = None,
        phone_number: str | None = None,
        password: str | None = None,
        **kwargs: Any,
    ) -> UserModel | None:
        """
        Authentifie un utilisateur selon les règles AquaCare.
        
        Args:
            login_name (str): Nom de connexion (business_name ou "first_name last_name")
            phone_number (str): Numéro de téléphone (fallback)
            password (str): Mot de passe
            
        Returns:
            User: Utilisateur authentifié ou None
        """
        if not password:
            return None
        
        user: UserModel | None = None
        
        # Méthode 1 : Authentification par login_name (spécification principale)
        if login_name:
            try:
                user = User.objects.get_by_login_name(login_name)
            except User.DoesNotExist:
                return None
        
        # Méthode 2 : Authentification par phone_number (fallback pour compatibilité)
        elif phone_number:
            try:
                user = User.objects.get_by_natural_key(phone_number)
            except User.DoesNotExist:
                return None
        
        # Vérifier le mot de passe et l'état du compte
        if user and user.check_password(password) and user.is_active:
            return user
        
        return None
    
    def get_user(self, user_id: object) -> UserModel | None:
        """Récupère un utilisateur par son ID."""
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
