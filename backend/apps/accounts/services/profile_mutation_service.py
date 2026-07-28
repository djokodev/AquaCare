"""Services applicatifs transactionnels pour les mutations de profil accounts."""

from __future__ import annotations

from typing import Any

from accounts.domain.farm_profile_rules import build_farm_profile_invariant_errors
from accounts.models import FarmProfile, User
from accounts.validators import build_user_account_invariant_errors
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils.translation import gettext_lazy as _

from .farm_setup_service import FarmSetupService


class AccountProfileMutationService:
    """Use cases d'ecriture proteges contre les instances stale et les races."""

    USER_MUTABLE_FIELDS = frozenset(
        {
            "email",
            "first_name",
            "last_name",
            "business_name",
            "language_preference",
            "activity_type",
            "region",
            "department",
            "district",
            "city",
            "neighborhood",
            "legal_status",
            "promoter_name",
            "age_group",
            "intervention_zone",
        }
    )

    FARM_MUTABLE_FIELDS = frozenset(
        {
            "farm_name",
            "total_ponds",
            "total_area_m2",
            "water_source",
            "main_species",
            "annual_production_kg",
            "latitude",
            "longitude",
            "location_address",
        }
    )

    @staticmethod
    def _validate_user_is_active(user: User) -> None:
        if not user.is_active:
            raise PermissionDenied(_("Ce compte est desactive."))

    @staticmethod
    def _validate_farm_is_mutable(farm_profile: FarmProfile) -> None:
        if farm_profile.is_deleted or not farm_profile.user.is_active:
            raise FarmProfile.DoesNotExist

    @staticmethod
    def _validate_user_invariants(user: User, updates: dict[str, Any]) -> None:
        errors = build_user_account_invariant_errors(updates, user)
        if errors:
            raise ValidationError(errors)

    @staticmethod
    def _validate_farm_invariants(farm_profile: FarmProfile, updates: dict[str, Any]) -> None:
        errors = build_farm_profile_invariant_errors(updates, farm_profile)
        if errors:
            raise ValidationError(errors)

    @classmethod
    @transaction.atomic
    def update_user_profile(cls, *, user_id: object, updates: dict[str, Any]) -> User:
        """Met a jour le profil utilisateur avec verrou ligne et update cible."""
        user = User.objects.select_for_update().get(pk=user_id)
        cls._validate_user_is_active(user)

        safe_updates = {
            field: value
            for field, value in updates.items()
            if field in cls.USER_MUTABLE_FIELDS
        }
        if not safe_updates:
            return user

        cls._validate_user_invariants(user, safe_updates)
        for field, value in safe_updates.items():
            setattr(user, field, value)

        user.save(update_fields=list(safe_updates.keys()))
        return User.objects.with_farm_profile().get(pk=user.pk)

    @classmethod
    @transaction.atomic
    def update_farm_profile(cls, *, user_id: object, updates: dict[str, Any]) -> FarmProfile:
        """Met a jour le profil ferme avec verrou ligne et update cible."""
        farm_profile = (
            FarmProfile.objects.select_for_update()
            .select_related("user")
            .get(user_id=user_id)
        )
        cls._validate_farm_is_mutable(farm_profile)

        safe_updates = {
            field: value
            for field, value in updates.items()
            if field in cls.FARM_MUTABLE_FIELDS
        }
        plan_updates = {
            field: value
            for field, value in updates.items()
            if field in FarmSetupService.SETTINGS_FIELDS
        }
        if not safe_updates and not plan_updates:
            return farm_profile

        if safe_updates:
            cls._validate_farm_invariants(farm_profile, safe_updates)
            for field, value in safe_updates.items():
                setattr(farm_profile, field, value)

            farm_profile.save(update_fields=[*safe_updates.keys(), "updated_at"])
        if plan_updates:
            FarmSetupService.update_settings(farm_profile, plan_updates)
        return FarmProfile.objects.with_user().get(pk=farm_profile.pk)
