"""Regles pures du flux de configuration initiale de production."""

from __future__ import annotations

from typing import Any

from django.utils.translation import gettext_lazy as _


def is_blank_value(value: Any) -> bool:
    """Retourne True si une valeur obligatoire est absente ou vide apres trim."""
    return value is None or (isinstance(value, str) and value.strip() == "")


class FarmSetupRules:
    """Invariants du formulaire Créer mon élevage."""

    @staticmethod
    def _merged_value(attrs: dict[str, Any], instance: object | None, field_name: str) -> Any:
        if field_name in attrs:
            return attrs[field_name]
        if instance is not None:
            return getattr(instance, field_name)
        return None

    @classmethod
    def build_errors(
        cls,
        attrs: dict[str, Any],
        instance: object | None = None,
    ) -> dict[str, object]:
        """Retourne les erreurs de completion setup sans lever d'exception framework."""

        def merged_value(field_name: str) -> Any:
            return cls._merged_value(attrs, instance, field_name)

        infra = merged_value("setup_infrastructure_type") or ""
        unit_volume = merged_value("setup_unit_volume_m3")
        unit_surface = merged_value("setup_unit_surface_m2")

        required_fields = {
            "setup_species": _("L'espèce est requise."),
            "setup_infrastructure_type": _("Le type d'infrastructure est requis."),
            "setup_unit_count": _("Le nombre d'unités est requis."),
            "annual_production_target_kg": _("La production cible est requise."),
            "num_cycles_per_year": _("Le nombre de cycles par an est requis."),
        }
        errors = {
            field: message
            for field, message in required_fields.items()
            if is_blank_value(merged_value(field))
        }

        if infra == "etang" and is_blank_value(unit_surface):
            errors["setup_unit_surface_m2"] = _("La surface par unité est requise pour les étangs.")
        if infra in ("cage_flottante", "bac_hors_sol", "bac_en_sol") and is_blank_value(unit_volume):
            errors["setup_unit_volume_m3"] = _("Le volume par unité est requis pour ce type d'infrastructure.")

        return errors
