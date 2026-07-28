"""Invariants purs pour les profils de ferme accounts."""

from __future__ import annotations

from typing import Any

from django.utils.translation import gettext_lazy as _

from .account_invariants import is_blank_value


def _merged_value(attrs: dict[str, Any], instance: object | None, field_name: str) -> Any:
    if field_name in attrs:
        return attrs[field_name]
    if instance is not None:
        return getattr(instance, field_name)
    return None


def build_farm_profile_invariant_errors(
    attrs: dict[str, Any],
    instance: object | None = None,
) -> dict[str, object]:
    """Construit les erreurs des invariants de profil ferme."""
    latitude = _merged_value(attrs, instance, "latitude")
    longitude = _merged_value(attrs, instance, "longitude")
    total_ponds = _merged_value(attrs, instance, "total_ponds") or 0
    annual_production_kg = _merged_value(attrs, instance, "annual_production_kg")
    farm_name = _merged_value(attrs, instance, "farm_name")
    errors: dict[str, object] = {}

    if is_blank_value(farm_name):
        errors["farm_name"] = _("Le nom de la ferme ne peut pas être vide.")
    if latitude is not None and longitude is None:
        errors["longitude"] = _("La longitude est requise si la latitude est renseignée.")
    if longitude is not None and latitude is None:
        errors["latitude"] = _("La latitude est requise si la longitude est renseignée.")
    if total_ponds == 0 and annual_production_kg and annual_production_kg > 0:
        errors["total_ponds"] = _(
            "Le nombre de bassins doit être supérieur à 0 si il y a une production."
        )

    return errors
