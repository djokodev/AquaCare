"""Service applicatif pour l'inscription des comptes accounts."""

from __future__ import annotations

from typing import Any

from accounts.models import FarmProfile, User
from django.db import transaction


class AccountRegistrationService:
    """Use case explicite de creation d'un compte pisciculteur AquaCare."""

    @staticmethod
    def _build_default_farm_name(user: User) -> str:
        """Construit le nom de ferme cree automatiquement a l'inscription."""
        if user.account_type == "company" and user.business_name:
            return f"Ferme {user.business_name}"
        return f"Ferme de {user.display_name}"

    @staticmethod
    def _create_default_farm_profile(user: User) -> FarmProfile:
        from aquaculture.models import FarmProductionPlan

        farm_profile = FarmProfile(
            user=user,
            farm_name=AccountRegistrationService._build_default_farm_name(user),
            certification_status="pending",
        )
        farm_profile.save(validate=False)
        FarmProductionPlan.objects.create(farm_profile=farm_profile)
        user.farm_profile = farm_profile
        return farm_profile

    @staticmethod
    @transaction.atomic
    def register_user(
        *,
        phone_number: str,
        password: str | None = None,
        **extra_fields: Any,
    ) -> User:
        """
        Cree le User puis son FarmProfile par defaut dans une meme transaction.

        Le manager conserve des helpers ORM, ce service porte le use case
        applicatif d'inscription.
        """
        user = User.objects.create_user_record(
            phone_number=phone_number,
            password=password,
            **extra_fields,
        )

        if not extra_fields.get("is_superuser", False):
            AccountRegistrationService._create_default_farm_profile(user)

        return user
