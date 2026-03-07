"""Service applicatif pour l'anonymisation des comptes utilisateurs."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from accounts.models import FarmProfile, User
from django.db import transaction


@dataclass(frozen=True)
class AccountDeletionResult:
    """Resultat de l'anonymisation d'un compte utilisateur."""

    anonymized_phone: str


class AccountDeletionService:
    """
    Service applicatif pour désactiver et anonymiser un compte utilisateur.

    Notes:
    - On évite la suppression physique de User/FarmProfile pour préserver
      l'intégrité référentielle des modules liés (orders, reports, etc.).
    - Le compte est désactivé + PII anonymisées.
    """

    @staticmethod
    def _generate_anonymized_phone(user_id: object) -> str:
        """Genere un numero anonymise unique compatible avec le format camerounais."""
        # Format valide attendu: +2376XXXXXXXX (9 chiffres après +237)
        # user_id peut être un UUID ou un int — on extrait 8 chiffres décimaux via hash
        base = abs(hash(str(user_id))) % 100000000
        for offset in range(0, 10000):
            suffix = str((base + offset) % 100000000).zfill(8)
            candidate = f"+2376{suffix}"
            if not User.objects.filter(phone_number=candidate).exists():
                return candidate
        raise RuntimeError("Impossible de générer un numéro anonymisé unique.")

    @staticmethod
    def _cleanup_blacklisted_tokens(user_id: object) -> None:
        """Supprime les refresh tokens encore enregistrés pour l'utilisateur."""
        try:
            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
        except ImportError:
            return

        OutstandingToken.objects.filter(user_id=user_id).delete()

    @staticmethod
    def _cleanup_push_tokens(user_id: object) -> None:
        """Supprime les tokens push stockés pour l'utilisateur anonymisé."""
        try:
            from notifications.models import PushToken
        except ImportError:
            return

        PushToken.objects.filter(user_id=user_id).delete()

    @staticmethod
    @transaction.atomic
    def anonymize_user_account(user: User) -> AccountDeletionResult:
        """Desactive un compte et anonymise ses donnees personnelles."""
        user.refresh_from_db()

        # Empêche toute reconnexion avec l'ancien mot de passe
        user.set_unusable_password()
        user.save(update_fields=["password"])

        anonymized_phone = AccountDeletionService._generate_anonymized_phone(user.id)
        deleted_marker = uuid.uuid4().hex[:8]

        User.objects.filter(id=user.id).update(
            phone_number=anonymized_phone,
            email="",
            first_name="Deleted",
            last_name=f"User {user.id}",
            account_type="individual",
            business_name="",
            legal_status=None,
            promoter_name="",
            age_group="26_35",
            intervention_zone="",
            activity_type=None,
            region=None,
            department="",
            district="",
            city="",
            neighborhood="",
            is_active=False,
            is_verified=False,
        )

        FarmProfile.objects.filter(user_id=user.id).update(
            farm_name=f"Compte supprime {deleted_marker}",
            total_ponds=0,
            total_area_m2=None,
            water_source="",
            main_species="",
            annual_production_kg=None,
            is_deleted=True,
        )

        # Nettoyage tokens JWT (blacklist models)
        AccountDeletionService._cleanup_blacklisted_tokens(user.id)

        # Nettoyage des tokens push stockés (si module notifications installé)
        AccountDeletionService._cleanup_push_tokens(user.id)

        return AccountDeletionResult(anonymized_phone=anonymized_phone)
