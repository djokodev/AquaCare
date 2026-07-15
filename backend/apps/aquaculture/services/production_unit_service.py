"""Règles métier communes aux unités physiques de production et de calibrage."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils.translation import gettext_lazy as _

from ..domain.exceptions import BusinessRuleViolation
from ..models import CycleUnitAllocation, ProductionUnit


class ProductionUnitLifecycleService:
    """Centralise les invariants afin que toutes les portes d'entrée les partagent."""

    PROTECTED_CALIBRATION_FIELDS = {'purpose', 'unit_type'}
    OCCUPIED_PROTECTED_FIELDS = {'purpose', 'unit_type', 'volume_m3', 'status'}

    @staticmethod
    def is_occupied(unit: ProductionUnit) -> bool:
        return unit.cycle_allocations.filter(status=CycleUnitAllocation.STATUS_ACTIVE).exists()

    @staticmethod
    def has_history(unit: ProductionUnit) -> bool:
        return unit.cycle_allocations.exists()

    @classmethod
    def validate_update(cls, unit: ProductionUnit, changes: dict) -> None:
        """Refuse toute mutation pouvant invalider le stock ou l'historique du bac."""
        if unit.purpose != ProductionUnit.PURPOSE_CALIBRATION:
            return

        occupied = cls.is_occupied(unit)
        history = cls.has_history(unit)
        changed_fields = {
            field
            for field, value in changes.items()
            if hasattr(unit, field) and getattr(unit, field) != value
        }

        if occupied and changed_fields & cls.OCCUPIED_PROTECTED_FIELDS:
            raise BusinessRuleViolation(
                _("Un bac de calibrage occupé ne peut pas changer de volume, type, usage ou statut.")
            )
        if history and changed_fields & cls.PROTECTED_CALIBRATION_FIELDS:
            raise BusinessRuleViolation(
                _("Le type et l'usage d'un bac de calibrage ayant un historique sont immuables.")
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
