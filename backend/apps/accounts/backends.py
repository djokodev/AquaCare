from django.contrib.auth.backends import BaseBackend
from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()


class MavecamAuthBackend(BaseBackend):
    """
    Backend d'authentification MAVECAM selon les spécifications.
    
    Permet l'authentification avec :
    - login_name (nom de personne ou d'entreprise) + password
    - phone_number + password (pour compatibilité interne)
    """
    
    def authenticate(self, request, login_name=None, phone_number=None, password=None, **kwargs):
        """
        Authentifie un utilisateur selon les spécifications MAVECAM.
        
        Args:
            login_name (str): Nom de connexion (business_name ou "first_name last_name")
            phone_number (str): Numéro de téléphone (fallback)
            password (str): Mot de passe
            
        Returns:
            User: Utilisateur authentifié ou None
        """
        if not password:
            return None
        
        user = None
        
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
    
    def get_user(self, user_id):
        """Récupère un utilisateur par son ID."""
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None