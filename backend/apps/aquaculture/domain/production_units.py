from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

from ..constants import (
    MAX_STOCKING_DENSITY_POND_PER_M2,
    MAX_STOCKING_DENSITY_TANK_PER_M3,
)

PRODUCTION_UNIT_TYPE_CHOICES = ('tank', 'pond', 'cage')
PRODUCTION_UNIT_TYPE_ALIASES = {
    'etang': 'pond',
    'cage_flottante': 'cage',
    'bac_hors_sol': 'tank',
    'bac_en_sol': 'tank',
}


def normalize_production_unit_type(unit_type: object | None) -> str | None:
    """Normalise les alias legacy des unités de production vers les valeurs canoniques."""
    if unit_type is None or not isinstance(unit_type, str):
        return None

    normalized = unit_type.strip().lower()
    if not normalized:
        return None
    return PRODUCTION_UNIT_TYPE_ALIASES.get(normalized, normalized)


def get_production_unit_density_unit(unit_type: str | None) -> str | None:
    """Retourne l'unité de densité utilisée pour une unité de production."""
    normalized = normalize_production_unit_type(unit_type)
    if normalized == 'pond':
        return _('poissons/m²')
    if normalized in {'tank', 'cage'}:
        return _('poissons/m³')
    return None


def get_production_unit_dimension_label(unit_type: str | None) -> str | None:
    """Retourne le label de dimension principal de l'unité."""
    normalized = normalize_production_unit_type(unit_type)
    if normalized == 'pond':
        return 'surface_m2'
    if normalized in {'tank', 'cage'}:
        return 'volume_m3'
    return None


def get_production_unit_dimension_display(
    unit_type: str | None,
    *,
    volume_m3: Decimal | None = None,
    surface_m2: Decimal | None = None,
) -> str | None:
    """Retourne une représentation lisible de la dimension principale."""
    normalized = normalize_production_unit_type(unit_type)
    if normalized == 'pond' and surface_m2 is not None:
        return f"{surface_m2} m²"
    if normalized in {'tank', 'cage'} and volume_m3 is not None:
        return f"{volume_m3} m³"
    return None


def get_production_unit_capacity(
    unit_type: str | None,
    *,
    volume_m3: Decimal | None = None,
    surface_m2: Decimal | None = None,
) -> Decimal | None:
    """Calcule la capacité recommandée d'une unité de production."""
    normalized = normalize_production_unit_type(unit_type)
    if normalized == 'pond':
        if surface_m2 is None or surface_m2 <= 0:
            return None
        return (surface_m2 * Decimal(str(MAX_STOCKING_DENSITY_POND_PER_M2))).quantize(
            Decimal('0.01'),
            rounding=ROUND_HALF_UP,
        )

    if normalized in {'tank', 'cage'}:
        if volume_m3 is None or volume_m3 <= 0:
            return None
        return (volume_m3 * Decimal(str(MAX_STOCKING_DENSITY_TANK_PER_M3))).quantize(
            Decimal('0.01'),
            rounding=ROUND_HALF_UP,
        )

    return None


def validate_production_unit_dimensions(
    unit_type: str | None,
    *,
    volume_m3: Decimal | None = None,
    surface_m2: Decimal | None = None,
) -> None:
    """Valide la cohérence minimale d'une unité de production."""
    errors: dict[str, str] = {}
    normalized = normalize_production_unit_type(unit_type)

    if not normalized:
        errors['unit_type'] = _("Le type d'unité de production est obligatoire")
    elif normalized not in PRODUCTION_UNIT_TYPE_CHOICES:
        errors['unit_type'] = _("Type d'unité de production invalide")

    if volume_m3 is not None and volume_m3 <= 0:
        errors['volume_m3'] = _("Le volume doit être strictement positif")

    if surface_m2 is not None and surface_m2 <= 0:
        errors['surface_m2'] = _("La surface doit être strictement positive")

    if normalized in {'tank', 'cage'} and (volume_m3 is None or volume_m3 <= 0):
        errors['volume_m3'] = _("Un bac ou une cage doit avoir un volume positif")

    if normalized == 'pond' and (surface_m2 is None or surface_m2 <= 0):
        errors['surface_m2'] = _("Un étang doit avoir une surface positive")

    if errors:
        raise ValidationError(errors)


def validate_cycle_unit_allocation_counts(
    *,
    initial_fish_count: int,
    current_fish_count: int,
    initial_biomass_kg: Decimal | None = None,
    current_biomass_kg: Decimal | None = None,
    expected_survival_rate_pct: Decimal | None = None,
) -> None:
    """Valide les quantités de poissons et biomasses d'une allocation de cycle."""
    errors: dict[str, str] = {}

    if initial_fish_count < 0:
        errors['initial_fish_count'] = _("L'effectif initial doit être supérieur ou égal à 0")

    if current_fish_count < 0:
        errors['current_fish_count'] = _("L'effectif actuel doit être supérieur ou égal à 0")

    if initial_biomass_kg is not None and initial_biomass_kg < 0:
        errors['initial_biomass_kg'] = _("La biomasse initiale doit être supérieure ou égale à 0")

    if current_biomass_kg is not None and current_biomass_kg < 0:
        errors['current_biomass_kg'] = _("La biomasse actuelle doit être supérieure ou égale à 0")

    if expected_survival_rate_pct is not None and (
        expected_survival_rate_pct < 0 or expected_survival_rate_pct > 100
    ):
        errors['expected_survival_rate_pct'] = _(
            "Le taux de survie prévisionnel doit être compris entre 0 et 100"
        )

    if errors:
        raise ValidationError(errors)
