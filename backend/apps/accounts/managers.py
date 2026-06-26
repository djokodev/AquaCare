from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.contrib.auth.models import BaseUserManager
from django.core.exceptions import MultipleObjectsReturned
from django.db import models
from django.db.models import Q
from django.utils.translation import gettext_lazy as _

from .validators import normalize_login_value, normalize_phone_number

if TYPE_CHECKING:
    from .models import FarmProfile, User


class AmbiguousLoginNameError(Exception):
    """Plusieurs comptes correspondent au même nom de connexion."""


class UserQuerySet(models.QuerySet["User"]):
    """QuerySet utilitaire pour les utilisateurs avec relations frequentes."""

    def with_farm_profile(self) -> models.QuerySet[User]:
        return self.select_related('farm_profile', 'farm_profile__production_plan')


class FarmProfileQuerySet(models.QuerySet["FarmProfile"]):
    """QuerySet utilitaire pour les profils fermes et leur proprietaire."""

    def with_user(self) -> models.QuerySet[FarmProfile]:
        return self.select_related('user', 'production_plan')


class UserManager(BaseUserManager.from_queryset(UserQuerySet)):
    """
    Manager personnalisé pour les utilisateurs AquaCare.
    
    Métier : Gère la création d'utilisateurs avec phone_number comme
    identifiant principal au lieu de username. Adapté au contexte
    africain où le téléphone est l'identifiant numérique principal.
    """

    def with_farm_profile(self) -> UserQuerySet:
        """Expose le chargement eager du profil ferme depuis le manager."""
        return self.get_queryset().with_farm_profile()
    
    def _create_user_record(self, phone_number: str, password: str | None = None, **extra_fields: Any) -> User:
        """
        Crée et sauvegarde uniquement l'enregistrement User.
        
        Args:
            phone_number (str): Numéro de téléphone (identifiant unique)
            password (str): Mot de passe
            **extra_fields: Champs supplémentaires
            
        Returns:
            User: Instance utilisateur créée
            
        Raises:
            ValueError: Si phone_number n'est pas fourni
        """
        if not phone_number:
            raise ValueError(_("Le numéro de téléphone doit être fourni"))
        
        phone_number = normalize_phone_number(phone_number)
        user: User = self.model(phone_number=phone_number, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user_record(self, phone_number: str, password: str | None = None, **extra_fields: Any) -> User:
        """Expose la creation ORM brute pour les services applicatifs."""
        return self._create_user_record(phone_number, password, **extra_fields)

    def _create_user(self, phone_number: str, password: str | None = None, **extra_fields: Any) -> User:
        """Compatibilite interne: delegue le use case complet au service applicatif."""
        from .services.registration_service import AccountRegistrationService

        return AccountRegistrationService.register_user(
            phone_number=phone_number,
            password=password,
            **extra_fields,
        )

    def create_user(self, phone_number: str, password: str | None = None, **extra_fields: Any) -> User:
        """
        Crée un utilisateur standard (pisciculteur AquaCare).
        
        Args:
            phone_number (str): Numéro de téléphone
            password (str): Mot de passe
            **extra_fields: Champs supplémentaires
            
        Returns:
            User: Pisciculteur créé
        """
        # Valeurs par défaut pour un pisciculteur standard
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('account_type', 'individual')
        extra_fields.setdefault('language_preference', 'fr')
        
        from .services.registration_service import AccountRegistrationService

        return AccountRegistrationService.register_user(
            phone_number=phone_number,
            password=password,
            **extra_fields,
        )
    
    def create_superuser(self, phone_number: str, password: str | None = None, **extra_fields: Any) -> User:
        """
        Crée un administrateur AquaCare.
        
        Args:
            phone_number (str): Numéro de téléphone de l'admin
            password (str): Mot de passe
            **extra_fields: Champs supplémentaires
            
        Returns:
            User: Administrateur AquaCare créé
        """
        # Forcer les privilèges administrateur
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('is_verified', True)
        extra_fields.setdefault('account_type', 'individual')  # Admins = employés AquaCare
        extra_fields.setdefault('age_group', '26_35')
        
        if extra_fields.get('is_staff') is not True:
            raise ValueError(_("Les superutilisateurs doivent avoir is_staff=True."))
        if extra_fields.get('is_superuser') is not True:
            raise ValueError(_("Les superutilisateurs doivent avoir is_superuser=True."))
        
        return self._create_user_record(phone_number, password, **extra_fields)
    
    def get_by_natural_key(self, phone_number: str) -> User:
        """
        Récupère un utilisateur par son identifiant naturel (téléphone).
        
        Cette méthode est utilisée par Django pour l'authentification.
        
        Args:
            phone_number (str): Numéro de téléphone
            
        Returns:
            User: Utilisateur trouvé
        """
        phone_number = normalize_phone_number(phone_number)
        return self.with_farm_profile().get(**{self.model.USERNAME_FIELD: phone_number})
    
    def get_by_login_name(self, login_name: str) -> User:
        """
        Récupère un utilisateur par son nom de connexion selon les règles AquaCare.
        
        Logique :
        - Pour les entreprises : cherche par business_name
        - Pour les personnes : cherche par "first_name last_name"
        
        Args:
            login_name (str): Nom de connexion (nom entreprise ou nom complet)
            
        Returns:
            User: Utilisateur trouvé ou None
        """
        normalized_login_name = normalize_login_value(login_name)
        queryset = self.with_farm_profile()
        query = Q(
            account_type='company',
            business_name_normalized=normalized_login_name,
        )

        name_parts = normalized_login_name.split()
        if len(name_parts) >= 2:
            first_name = name_parts[0]
            last_name = ' '.join(name_parts[1:])  # Au cas où il y a plusieurs mots dans le nom
            query |= Q(
                account_type='individual',
                first_name_normalized=first_name,
                last_name_normalized=last_name,
            )

        try:
            return queryset.get(query)
        except MultipleObjectsReturned as err:
            raise AmbiguousLoginNameError(
                f"Plusieurs utilisateurs correspondent au nom '{normalized_login_name}'"
            ) from err
        except self.model.DoesNotExist as err:
            raise self.model.DoesNotExist(
                f"Utilisateur avec le nom '{normalized_login_name}' non trouvé"
            ) from err
