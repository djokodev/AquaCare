"""Use cases applicatifs exposes par l'API catalogue commerce."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from ..models import Product
from .cycle_simulation_service import CycleSimulationService
from .feeding_suggestion_service import FeedingSuggestionService
from .product_service import ProductService
from .production_cycle_gateway import ProductionCycleGateway

if TYPE_CHECKING:
    from accounts.models import User


@dataclass(frozen=True)
class RecommendedProductQuery:
    """Parametres applicatifs de recommandation produit."""

    species: str
    weight_g: float


@dataclass(frozen=True)
class FeedingSuggestionsQuery:
    """Parametres applicatifs de suggestion d'aliments."""

    farm_profile_id: str | None = None
    cycle_id: str | None = None


@dataclass(frozen=True)
class CycleSimulationCommand:
    """Commande applicative de simulation de cycle."""

    species: str
    initial_fish_count: int
    initial_weight_g: float | None = None
    target_weight_g: float | None = None
    cycle_duration_days: int | None = None
    survival_rate: float | None = None
    selling_price_per_kg_fcfa: float | None = None
    fingerlings_cost_fcfa: float | None = None
    other_costs_fcfa: float | None = None


class CatalogApplicationService:
    """Use cases applicatifs de lecture et simulation commerce."""

    @staticmethod
    def get_catalog() -> Any:
        """Retourne le catalogue public disponible."""
        return ProductService.get_all_products(include_unavailable=False)

    @staticmethod
    def get_featured_products(limit: int = 5) -> list[Product]:
        """Retourne un sous-ensemble de produits vedettes."""
        return list(CatalogApplicationService.get_catalog()[:limit])

    @staticmethod
    def get_products_for_user_cycle(user: User, cycle_id: str | None) -> Any:
        """Retourne les produits compatibles avec le cycle de l'utilisateur."""
        cycle = ProductionCycleGateway.get_user_cycle(user_id=user.id, cycle_id=cycle_id)
        return ProductService.get_products_for_cycle(cycle)

    @staticmethod
    def get_recommended_product(query: RecommendedProductQuery) -> Product | None:
        """Retourne le produit recommande pour un poids/espece."""
        return ProductService.get_recommended_product(
            query.species,
            query.weight_g,
        )

    @staticmethod
    def get_feeding_suggestions(
        user: User,
        query: FeedingSuggestionsQuery,
    ) -> dict[str, Any]:
        """Retourne les suggestions d'aliments contextualisees au user."""
        return FeedingSuggestionService.get_feeding_suggestions(
            user_id=user.id,
            farm_profile_id=query.farm_profile_id,
            cycle_id=query.cycle_id,
        )

    @staticmethod
    def simulate_cycle(command: CycleSimulationCommand) -> dict[str, Any]:
        """Execute le use case de simulation predictive."""
        return CycleSimulationService.simulate_cycle(
            species=command.species,
            initial_fish_count=command.initial_fish_count,
            initial_weight_g=command.initial_weight_g,
            target_weight_g=command.target_weight_g,
            cycle_duration_days=command.cycle_duration_days,
            survival_rate=command.survival_rate,
            selling_price_per_kg_fcfa=command.selling_price_per_kg_fcfa,
            fingerlings_cost_fcfa=command.fingerlings_cost_fcfa,
            other_costs_fcfa=command.other_costs_fcfa,
        )
