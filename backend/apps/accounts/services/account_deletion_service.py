"""Service applicatif pour l'anonymisation des comptes utilisateurs."""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from dataclasses import dataclass

from aquaculture.services.farm_production_plan_service import FarmProductionPlanService
from accounts.models import FarmProfile, User
from accounts.validators import normalize_login_value
from django.db import transaction

from .account_cleanup_adapters import AccountCleanupPort, get_default_account_cleanup_ports


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
            if not User.objects.exclude(id=user_id).filter(phone_number=candidate).exists():
                return candidate
        raise RuntimeError("Impossible de générer un numéro anonymisé unique.")

    @staticmethod
    def _resolve_deleted_farm_name(user_id: object, farm_profile: FarmProfile | None = None) -> str:
        if farm_profile is None:
            farm_profile = FarmProfile.objects.filter(user_id=user_id).only(
                "farm_name",
                "is_deleted",
            ).first()
        if (
            farm_profile
            and farm_profile.is_deleted
            and farm_profile.farm_name.startswith("Compte supprimé ")
        ):
            return farm_profile.farm_name
        return f"Compte supprimé {uuid.uuid4().hex[:8]}"

    @staticmethod
    def _cleanup_external_account_data(
        user_id: object,
        cleanup_ports: Iterable[AccountCleanupPort],
    ) -> None:
        """Execute les adapters externes sans exposer leur infrastructure au use case."""
        for cleanup_port in cleanup_ports:
            cleanup_port.cleanup_for_user(user_id)

    @staticmethod
    @transaction.atomic
    def anonymize_user_account(
        user: User,
        cleanup_ports: Iterable[AccountCleanupPort] | None = None,
    ) -> AccountDeletionResult:
        """Desactive un compte et anonymise ses donnees personnelles."""
        user = User.objects.select_for_update().get(pk=user.pk)
        farm_profile = (
            FarmProfile.objects.select_for_update()
            .filter(user_id=user.id)
            .only("farm_name", "is_deleted")
            .first()
        )
        cleanup_ports = cleanup_ports or get_default_account_cleanup_ports()

        if user.is_active:
            user.set_unusable_password()
            user.save(update_fields=["password"])
            anonymized_phone = AccountDeletionService._generate_anonymized_phone(user.id)
        else:
            anonymized_phone = user.phone_number

        deleted_farm_name = AccountDeletionService._resolve_deleted_farm_name(
            user.id,
            farm_profile,
        )

        User.objects.filter(id=user.id).update(
            phone_number=anonymized_phone,
            email="",
            first_name="Compte",
            first_name_normalized=normalize_login_value("Compte"),
            last_name="Supprimé",
            last_name_normalized=normalize_login_value("Supprimé"),
            account_type="individual",
            business_name="",
            business_name_normalized="",
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
            farm_name=deleted_farm_name,
            total_ponds=0,
            total_area_m2=None,
            water_source="",
            main_species="",
            annual_production_kg=None,
            latitude=None,
            longitude=None,
            location_address="",
            is_deleted=True,
        )
        if farm_profile is not None:
            farm_profile.refresh_from_db()
            FarmProductionPlanService.reset_for_account_deletion(farm_profile)

        AccountDeletionService._cleanup_external_account_data(user.id, cleanup_ports)

        return AccountDeletionResult(anonymized_phone=anonymized_phone)
