"""Règles métier communes aux unités physiques de production et de calibrage."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Prefetch
from django.utils.translation import gettext_lazy as _

from ..domain.exceptions import BusinessRuleViolation
from ..models import CycleUnitAllocation, ProductionCycle, ProductionUnit
from .admin_activity_projection_service import record_production_unit_created


class ProductionUnitLifecycleService:
    """Centralise les invariants afin que toutes les portes d'entrée les partagent."""

    OCCUPIED_PROTECTED_FIELDS = {'purpose', 'unit_type', 'volume_m3', 'status'}

    @staticmethod
    def record_created(unit: ProductionUnit) -> bool:
        """Record one genuinely new physical unit through the owning service."""
        return record_production_unit_created(unit)

    @staticmethod
    def calibration_tanks_for_api():
        """Queryset canonique des bacs avec sessions annotées, sans N+1."""
        return ProductionUnit.objects.filter(
            purpose=ProductionUnit.PURPOSE_CALIBRATION,
            unit_type='tank',
        ).prefetch_related(
            Prefetch('cycle_allocations', queryset=CycleUnitAllocation.objects.order_by('-created_at')),
            Prefetch('cycle_allocations__cycle', queryset=ProductionCycle.objects.for_api()),
        )

    @staticmethod
    def is_occupied(unit: ProductionUnit) -> bool:
        return unit.cycle_allocations.filter(status=CycleUnitAllocation.STATUS_ACTIVE).exists()

    @staticmethod
    def has_history(unit: ProductionUnit) -> bool:
        return unit.cycle_allocations.exists()

    @classmethod
    def validate_update(cls, unit: ProductionUnit, changes: dict) -> None:
        """Refuse toute mutation pouvant invalider le stock ou l'historique du bac."""
        occupied = cls.is_occupied(unit)
        history = cls.has_history(unit)
        changed_fields = {
            field
            for field, value in changes.items()
            if hasattr(unit, field) and getattr(unit, field) != value
        }

        if occupied and changed_fields & cls.OCCUPIED_PROTECTED_FIELDS:
            raise BusinessRuleViolation(
                _("Une unité occupée ne peut pas changer de volume, type, usage ou statut.")
            )
        if history and changed_fields & {'purpose', 'unit_type'}:
            raise BusinessRuleViolation(
                _("Le type et l'usage d'une unité ayant un historique sont immuables.")
            )

        requested_purpose = changes.get('purpose', unit.purpose)
        requested_type = changes.get('unit_type', unit.unit_type)
        requested_volume = changes.get('volume_m3', unit.volume_m3)
        requested_surface = changes.get('surface_m2', unit.surface_m2)
        if requested_purpose == ProductionUnit.PURPOSE_CALIBRATION:
            if (
                requested_type != 'tank'
                or not requested_volume
                or requested_volume <= 0
                or requested_surface is not None
            ):
                raise BusinessRuleViolation(
                    _("Une unité de calibrage doit être un bac avec un volume positif et sans surface.")
                )
        if requested_purpose == ProductionUnit.PURPOSE_PRODUCTION and unit.cycle_allocations.filter(
            cycle__cycle_kind=ProductionCycle.CYCLE_KIND_CALIBRATION
        ).exists():
            raise BusinessRuleViolation(
                _("Une unité ayant une session de calibrage ne peut pas devenir une unité de production.")
            )

    @classmethod
    @transaction.atomic
    def delete(cls, unit: ProductionUnit) -> None:
        locked = ProductionUnit.objects.select_for_update().get(pk=unit.pk)
        if locked.purpose != ProductionUnit.PURPOSE_CALIBRATION:
            locked.status = 'archived'
            locked.save(update_fields=['status', 'updated_at'])
            return
        if cls.is_occupied(locked):
            raise BusinessRuleViolation(_("Un bac occupé ne peut pas être supprimé."))
        if cls.has_history(locked):
            raise BusinessRuleViolation(_("Un bac ayant un historique ne peut pas être supprimé."))
        locked.delete()

    @staticmethod
    def normalized_significant_payload(data: dict) -> dict:
        return {
            'name': str(data.get('name', '')).strip(),
            'volume_m3': Decimal(str(data.get('volume_m3'))).quantize(Decimal('0.01')),
            'status': data.get('status', 'active'),
            'purpose': data.get('purpose', ProductionUnit.PURPOSE_CALIBRATION),
            'unit_type': data.get('unit_type', 'tank'),
        }

    @classmethod
    def validate_idempotent_payload(cls, existing: ProductionUnit, data: dict, farm_profile) -> None:
        if existing.farm_profile_id != farm_profile.id:
            raise BusinessRuleViolation(_("Cet UUID client appartient à une autre ferme."))
        expected = cls.normalized_significant_payload(data)
        actual = cls.normalized_significant_payload(
            {
                'name': existing.name,
                'volume_m3': existing.volume_m3,
                'status': existing.status,
                'purpose': existing.purpose,
                'unit_type': existing.unit_type,
            }
        )
        if actual != expected:
            raise BusinessRuleViolation(_("Cet UUID client correspond à un autre bac de calibrage."))
