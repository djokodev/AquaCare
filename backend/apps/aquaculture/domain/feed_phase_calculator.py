"""
Calculateur de phases d'alimentation par espèce.

Basé sur les guides AquaCare :
- Pré-grossissement : 10g → ~100g (alevins achetés par nos utilisateurs)
- Grossissement     : ~100g → récolte (300-500g)
- Alevinage         : hors scope (0→10g)

Source : Guides nutritionnels AquaCare Tilapia et Clarias.
"""
from __future__ import annotations

from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Données de référence par espèce et phase
# ---------------------------------------------------------------------------

FEED_PHASES: dict = {
    "clarias": {
        "pre_grossissement": {
            "label": "Pré-grossissement",
            "weight_range_g": (10, 100),
            "products": ["FUTURA EX GR 0.9-1.6mm", "FUTURA EX GR 1.3-2mm"],
            "recommended_product": "FUTURA EX GR 1.3-2mm",
            "protein_pct": 58,
            "bag_weight_kg": 20,
            "price_per_bag_fcfa": 37000,
        },
        "grossissement": {
            "label": "Grossissement",
            "weight_range_g": (100, 600),
            "products": [
                "CLARIAS FLOAT 2mm",
                "CLARIAS FLOAT 3mm",
                "CLARIAS FLOAT 4.5mm",
                "CLARIAS FLOAT 6mm",
                "CLARIAS FLOAT 8mm",
            ],
            "recommended_product": "CLARIAS FLOAT 2mm",  # default start of phase
            "protein_pct": 45,
            "bag_weight_kg": 15,
            "price_per_bag_fcfa": 21500,  # CLARIAS FLOAT 2mm
            # Price progression by size (FCFA / sac 15kg)
            "price_by_size_mm": {
                2: 21500,
                3: 20500,
                4.5: 19500,
                6: 18500,
                8: 17500,
            },
        },
    },
    "tilapia": {
        "pre_grossissement": {
            "label": "Pré-grossissement",
            "weight_range_g": (10, 80),
            "products": ["Fish Starter 1.0", "Fish Starter 1.8", "Superior 2mm"],
            "recommended_product": "Fish Starter 1.0",
            "protein_pct": 45,
            "bag_weight_kg": 20,
            "price_per_bag_fcfa": None,  # variable, saisir sur le terrain
        },
        "grossissement": {
            "label": "Grossissement",
            "weight_range_g": (80, 400),
            "products": ["DIBAQ 2mm", "DIBAQ 3.5mm", "DIBAQ 4mm"],
            "recommended_product": "DIBAQ 2mm",
            "protein_pct": 38,
            "bag_weight_kg": 15,
            "price_per_bag_fcfa": 18000,  # DIBAQ 2mm
            "price_by_size_mm": {
                2: 18000,
                3.5: 17000,
                4: 16500,
            },
        },
    },
}


# ---------------------------------------------------------------------------
# Value objects
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FeedPhaseResult:
    """Résultat de la détermination de phase d'alimentation."""

    species: str
    phase_key: str                  # 'pre_grossissement' | 'grossissement'
    phase_label: str
    weight_range_g: tuple[int, int]
    recommended_product: str
    products: list[str]
    protein_pct: int | None
    bag_weight_kg: int | None
    price_per_bag_fcfa: float | None
    current_avg_weight_g: float


# ---------------------------------------------------------------------------
# Pure calculator (no Django dependencies)
# ---------------------------------------------------------------------------


def get_feed_phase(species: str, current_avg_weight_g: float) -> FeedPhaseResult | None:
    """
    Retourne la phase d'alimentation recommandée pour une espèce et un poids moyen.

    Args:
        species: 'tilapia' | 'clarias'
        current_avg_weight_g: poids moyen actuel des poissons en grammes

    Returns:
        FeedPhaseResult si une phase correspond, None si hors scope (ex: < 10g).
    """
    species_phases = FEED_PHASES.get(species)
    if not species_phases:
        return None

    for phase_key, phase_data in species_phases.items():
        min_g, max_g = phase_data["weight_range_g"]
        if min_g <= current_avg_weight_g < max_g:
            return FeedPhaseResult(
                species=species,
                phase_key=phase_key,
                phase_label=phase_data["label"],
                weight_range_g=(min_g, max_g),
                recommended_product=phase_data["recommended_product"],
                products=list(phase_data["products"]),
                protein_pct=phase_data.get("protein_pct"),
                bag_weight_kg=phase_data.get("bag_weight_kg"),
                price_per_bag_fcfa=phase_data.get("price_per_bag_fcfa"),
                current_avg_weight_g=current_avg_weight_g,
            )

    # Weight above last phase range — still return last phase (harvest-ready)
    last_phase_key = list(species_phases.keys())[-1]
    last_phase = species_phases[last_phase_key]
    min_g, max_g = last_phase["weight_range_g"]
    if current_avg_weight_g >= max_g:
        return FeedPhaseResult(
            species=species,
            phase_key=last_phase_key,
            phase_label=last_phase["label"],
            weight_range_g=(min_g, max_g),
            recommended_product=last_phase["recommended_product"],
            products=list(last_phase["products"]),
            protein_pct=last_phase.get("protein_pct"),
            bag_weight_kg=last_phase.get("bag_weight_kg"),
            price_per_bag_fcfa=last_phase.get("price_per_bag_fcfa"),
            current_avg_weight_g=current_avg_weight_g,
        )

    return None
