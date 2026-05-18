"""
Service de gestion des produits du catalogue AquaCare.

Architecture Clean : Service stateless avec méthodes statiques.
Gère recherche, filtrage et recommandations de produits alimentaires.
"""
from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING, TypedDict

from django.db.models import Q, QuerySet

from ..domain.calculators import ProductRecommendationCalculator
from ..domain.exceptions import ProductNotAvailableError, ProductNotFoundError
from ..models import Product
from .base import BaseCommerceService

if TYPE_CHECKING:
    from .contracts import ProductionCycleReadModel


class ProductPriceRange(TypedDict):
    min: Decimal
    max: Decimal
    avg: Decimal


class ProductService(BaseCommerceService):
    """
    Service de gestion du catalogue produits AquaCare.

    Responsabilités :
    - Recherche et filtrage produits (espèce, phase, marque)
    - Recommandation produit selon poids poisson
    - Validation disponibilité
    """

    @staticmethod
    def get_all_products(include_unavailable: bool = False) -> QuerySet[Product]:
        """
        Retourne tous les produits du catalogue.

        Args:
            include_unavailable: Si True, inclut produits indisponibles

        Returns:
            QuerySet: Produits triés par espèce, phase, taille

        Examples:
            >>> products = ProductService.get_all_products()
            >>> products.count()
            22
        """
        ProductService.log_operation('get_all_products', {'include_unavailable': include_unavailable})

        queryset = Product.objects.all()
        if not include_unavailable:
            queryset = queryset.available()

        return queryset.catalog_ordered()

    @staticmethod
    def get_products_by_ids(
        product_ids: list[str],
        check_availability: bool = True,
    ) -> dict[str, Product]:
        """Charge un lot de produits en une seule requete."""
        if not product_ids:
            return {}

        queryset = Product.objects.filter(id__in=product_ids)
        if check_availability:
            queryset = queryset.available()

        products = {str(product.id): product for product in queryset}
        missing_ids = [product_id for product_id in product_ids if product_id not in products]
        if missing_ids:
            missing_ids_str = ', '.join(missing_ids)
            if check_availability:
                raise ProductNotAvailableError(
                    f"Produit(s) introuvable(s) ou indisponible(s): {missing_ids_str}"
                )
            raise ProductNotFoundError(
                f"Produit(s) introuvable(s): {missing_ids_str}"
            )

        return products

    @staticmethod
    def get_product_by_id(product_id: str, check_availability: bool = True) -> Product:
        """
        Récupère un produit par son UUID.

        Args:
            product_id: UUID du produit
            check_availability: Si True, vérifie que produit est disponible

        Returns:
            Product: Instance produit

        Raises:
            ProductNotFoundError: Si produit introuvable
            ProductNotAvailableError: Si produit indisponible

        Examples:
            >>> product = ProductService.get_product_by_id('uuid-here')
            >>> product.name
            'CLARIAS FLOAT 3MM'
        """
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist as err:
            raise ProductNotFoundError(f"Produit introuvable: {product_id}") from err

        if check_availability and not product.is_available:
            raise ProductNotAvailableError(
                f"Produit temporairement indisponible: {product.name}"
            )

        return product

    @staticmethod
    def filter_by_species(species: str) -> QuerySet[Product]:
        """
        Filtre produits par espèce.

        Args:
            species: 'tilapia' ou 'catfish'

        Returns:
            QuerySet: Produits de l'espèce spécifiée

        Examples:
            >>> catfish_products = ProductService.filter_by_species('catfish')
            >>> catfish_products.count()
            15
        """
        return Product.objects.available().filter(species=species).order_by('phase', 'pellet_size_mm')

    @staticmethod
    def filter_by_phase(phase: str, species: str | None = None) -> QuerySet[Product]:
        """
        Filtre produits par phase d'élevage.

        Args:
            phase: 'alevinage', 'pre_grossissement', 'grossissement'
            species: Optionnel, filtre aussi par espèce

        Returns:
            QuerySet: Produits de la phase spécifiée

        Examples:
            >>> grossissement = ProductService.filter_by_phase('grossissement', 'catfish')
            >>> grossissement.first().name
            'CLARIAS FLOAT 3MM'
        """
        queryset = Product.objects.available().filter(phase=phase)

        if species:
            queryset = queryset.filter(species=species)

        return queryset.order_by('pellet_size_mm')

    @staticmethod
    def filter_by_brand(brand: str) -> QuerySet[Product]:
        """
        Filtre produits par marque.

        Args:
            brand: 'aller_aqua' ou 'dibaq'

        Returns:
            QuerySet: Produits de la marque spécifiée

        Examples:
            >>> aller_aqua = ProductService.filter_by_brand('aller_aqua')
            >>> aller_aqua.count()
            13
        """
        return Product.objects.available().filter(brand=brand).catalog_ordered()

    @staticmethod
    def search_products(query: str) -> QuerySet[Product]:
        """
        Recherche textuelle dans le catalogue (nom produit).

        Args:
            query: Texte de recherche

        Returns:
            QuerySet: Produits correspondants

        Examples:
            >>> results = ProductService.search_products('CLARIAS')
            >>> results.count()
            5
            >>> results = ProductService.search_products('3mm')
            >>> results.count()
            4
        """
        if not query or len(query) < 2:
            return Product.objects.none()

        return Product.objects.available().filter(
            Q(name__icontains=query) | Q(brand__icontains=query),
        ).catalog_ordered()

    @staticmethod
    def get_recommended_product(species: str, weight_g: float) -> Product | None:
        """
        Recommande le produit adapté selon espèce et poids poisson.

        Utilise ProductRecommendationCalculator pour déterminer
        la taille de granulé optimale, puis trouve le produit correspondant.

        Args:
            species: 'tilapia' ou 'catfish'
            weight_g: Poids moyen du poisson en grammes

        Returns:
            Product ou None: Produit recommandé (priorité Aller Aqua)

        Examples:
            >>> product = ProductService.get_recommended_product('catfish', 150)
            >>> product.pellet_size_mm
            Decimal('4.5')
            >>> product.name
            'CLARIAS FLOAT 4.5MM'
        """
        ProductService.log_operation('get_recommended_product', {
            'species': species,
            'weight_g': weight_g
        })

        # Calculer taille granulé recommandée
        recommended_size = ProductRecommendationCalculator.get_recommended_pellet_size(
            species, weight_g
        )

        # Chercher produit correspondant (priorité Aller Aqua)
        product = Product.objects.available().filter(
            species=species,
            pellet_size_mm=Decimal(str(recommended_size)),
        ).order_by(
            # Priorité Aller Aqua : 'aller_aqua' < 'dibaq' en ordre croissant
            'brand'
        ).first()

        if not product:
            # Fallback : chercher taille proche (±0.5mm)
            product = Product.objects.available().filter(
                species=species,
                pellet_size_mm__gte=Decimal(str(recommended_size - 0.5)),
                pellet_size_mm__lte=Decimal(str(recommended_size + 0.5)),
            ).order_by('brand', 'pellet_size_mm').first()

        return product

    @staticmethod
    def get_products_for_cycle(cycle: ProductionCycleReadModel) -> QuerySet[Product]:
        """
        Retourne produits adaptés pour un cycle de production donné.

        Args:
            cycle: Instance ProductionCycle

        Returns:
            QuerySet: Produits recommandés

        Examples:
            >>> from aquaculture.models import ProductionCycle
            >>> cycle = ProductionCycle.objects.first()
            >>> products = ProductService.get_products_for_cycle(cycle)
            >>> products.count()
            5
        """
        return ProductService.filter_by_species(cycle.species)

    @staticmethod
    def get_price_range(
        species: str | None = None,
        phase: str | None = None,
    ) -> ProductPriceRange:
        """
        Calcule la fourchette de prix (min/max) selon filtres.

        Args:
            species: Optionnel, filtre par espèce
            phase: Optionnel, filtre par phase

        Returns:
            dict: {'min': Decimal, 'max': Decimal, 'avg': Decimal}

        Examples:
            >>> range_catfish = ProductService.get_price_range(species='catfish')
            >>> range_catfish
            {'min': Decimal('17500'), 'max': Decimal('100000'), 'avg': Decimal('30000')}
        """
        from django.db.models import Avg, Max, Min

        queryset = Product.objects.available()

        if species:
            queryset = queryset.filter(species=species)
        if phase:
            queryset = queryset.filter(phase=phase)

        aggregates = queryset.aggregate(
            min_price=Min('price_per_package'),
            max_price=Max('price_per_package'),
            avg_price=Avg('price_per_package')
        )

        return {
            'min': aggregates['min_price'] or Decimal('0'),
            'max': aggregates['max_price'] or Decimal('0'),
            'avg': aggregates['avg_price'] or Decimal('0')
        }
