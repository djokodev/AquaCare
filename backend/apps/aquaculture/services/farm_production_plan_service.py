"""Use cases applicatifs pour les parametres de production ferme."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from accounts.models import FarmProfile
from aquaculture.constants import DEFAULT_FEED_PRICE_PER_KG
from aquaculture.domain.farm_setup_rules import FarmSetupRules
from aquaculture.models import FarmProductionPlan
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils.translation import gettext_lazy as _


class FarmProductionPlanService:
    """Orchestre le setup initial et les parametres economiques d'une ferme."""

    SETUP_FIELDS = frozenset(
        {
            "setup_species",
            "setup_infrastructure_type",
            "setup_unit_count",
            "setup_unit_volume_m3",
            "setup_unit_surface_m2",
            "annual_production_target_kg",
            "num_cycles_per_year",
            "fingerlings_cost_per_unit_fcfa",
            "planned_selling_price_per_kg_fcfa",
        }
    )
    SETTINGS_FIELDS = frozenset({"default_feed_price_per_kg"})

    @staticmethod
    def _validate_farm_is_mutable(farm_profile: FarmProfile) -> None:
        if farm_profile.is_deleted or not farm_profile.user.is_active:
            raise FarmProfile.DoesNotExist

    @staticmethod
    def _default_plan_data() -> dict[str, Any]:
        return {
            "annual_production_target_kg": None,
            "num_cycles_per_year": None,
            "setup_infrastructure_type": "",
            "setup_unit_count": None,
            "setup_unit_volume_m3": None,
            "setup_unit_surface_m2": None,
            "setup_species": "",
            "fingerlings_cost_per_unit_fcfa": None,
            "planned_selling_price_per_kg_fcfa": None,
            "farm_setup_completed": False,
            "default_feed_price_per_kg": DEFAULT_FEED_PRICE_PER_KG,
        }

    @classmethod
    def get_plan_data(cls, farm_profile: FarmProfile) -> dict[str, Any]:
        """Retourne les valeurs de plan avec defaults si le plan n'existe pas encore."""
        data = cls._default_plan_data()
        try:
            plan = farm_profile.production_plan
        except FarmProductionPlan.DoesNotExist:
            return data

        data.update(
            {
                "annual_production_target_kg": plan.annual_production_target_kg,
                "num_cycles_per_year": plan.num_cycles_per_year,
                "setup_infrastructure_type": plan.setup_infrastructure_type,
                "setup_unit_count": plan.setup_unit_count,
                "setup_unit_volume_m3": plan.setup_unit_volume_m3,
                "setup_unit_surface_m2": plan.setup_unit_surface_m2,
                "setup_species": plan.setup_species,
                "fingerlings_cost_per_unit_fcfa": plan.fingerlings_cost_per_unit_fcfa,
                "planned_selling_price_per_kg_fcfa": plan.planned_selling_price_per_kg_fcfa,
                "farm_setup_completed": plan.setup_completed,
                "default_feed_price_per_kg": plan.default_feed_price_per_kg,
            }
        )
        return data

    @staticmethod
    def get_or_create_plan(farm_profile: FarmProfile) -> FarmProductionPlan:
        plan, _created = FarmProductionPlan.objects.get_or_create(farm_profile=farm_profile)
        return plan

    @staticmethod
    def get_or_create_locked_plan(farm_profile: FarmProfile) -> FarmProductionPlan:
        plan, _created = (
            FarmProductionPlan.objects.select_for_update()
            .get_or_create(farm_profile=farm_profile)
        )
        return plan

    @classmethod
    @transaction.atomic
    def complete_setup(
        cls,
        farm_profile: FarmProfile,
        setup_data: dict[str, Any],
    ) -> FarmProfile:
        """Persiste le setup de production sous verrou, en revalidant l'etat courant."""
        farm_profile = (
            FarmProfile.objects.select_for_update()
            .select_related("user")
            .get(pk=farm_profile.pk)
        )
        cls._validate_farm_is_mutable(farm_profile)
        plan = cls.get_or_create_locked_plan(farm_profile)

        safe_updates = {
            field: value
            for field, value in setup_data.items()
            if field in cls.SETUP_FIELDS
        }
        errors = FarmSetupRules.build_errors(safe_updates, plan)
        if errors:
            raise ValidationError(errors)

        for attr, value in safe_updates.items():
            setattr(plan, attr, value)

        plan.setup_completed = True
        plan.save(update_fields=[*safe_updates.keys(), "setup_completed", "updated_at"])
        return FarmProfile.objects.select_related("user", "production_plan").get(pk=farm_profile.pk)

    @classmethod
    @transaction.atomic
    def update_settings(cls, farm_profile: FarmProfile, updates: dict[str, Any]) -> FarmProductionPlan:
        """Met a jour les parametres economiques de production hors profil accounts."""
        farm_profile = (
            FarmProfile.objects.select_for_update()
            .select_related("user")
            .get(pk=farm_profile.pk)
        )
        cls._validate_farm_is_mutable(farm_profile)
        plan = cls.get_or_create_locked_plan(farm_profile)

        feed_price = updates.get("default_feed_price_per_kg")
        if feed_price is not None and Decimal(feed_price) <= 0:
            raise ValidationError(
                {"default_feed_price_per_kg": _("Le prix d'aliment par défaut doit être supérieur à 0.")}
            )

        for attr, value in updates.items():
            if attr in cls.SETTINGS_FIELDS:
                setattr(plan, attr, value)

        plan.save(update_fields=[*updates.keys(), "updated_at"])
        return plan

    @classmethod
    @transaction.atomic
    def reset_for_account_deletion(cls, farm_profile: FarmProfile) -> None:
        """Efface les hypotheses de production lorsqu'un compte est anonymise."""
        plan = cls.get_or_create_plan(farm_profile)
        plan.annual_production_target_kg = None
        plan.num_cycles_per_year = None
        plan.setup_infrastructure_type = ""
        plan.setup_unit_count = None
        plan.setup_unit_volume_m3 = None
        plan.setup_unit_surface_m2 = None
        plan.setup_species = ""
        plan.fingerlings_cost_per_unit_fcfa = None
        plan.planned_selling_price_per_kg_fcfa = None
        plan.setup_completed = False
        plan.default_feed_price_per_kg = DEFAULT_FEED_PRICE_PER_KG
        plan.save(
            update_fields=[
                "annual_production_target_kg",
                "num_cycles_per_year",
                "setup_infrastructure_type",
                "setup_unit_count",
                "setup_unit_volume_m3",
                "setup_unit_surface_m2",
                "setup_species",
                "fingerlings_cost_per_unit_fcfa",
                "planned_selling_price_per_kg_fcfa",
                "setup_completed",
                "default_feed_price_per_kg",
                "updated_at",
            ]
        )
