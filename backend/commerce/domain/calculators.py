"""
Calculateurs métier pour le module commerce MAVECAM AquaCare.

Architecture Clean : Logique de calcul pure, sans dépendances Django.
Tous les calculs sont testables unitairement sans base de données.
"""
from decimal import Decimal
from typing import Optional
from ..constants import REGION_DOUALA, DELIVERY_FEE_STANDARD, DELIVERY_FEE_FREE_THRESHOLD_BAGS


class DeliveryFeeCalculator:
    """
    Calculateur des frais de livraison selon les règles MAVECAM.

    Règles métier :
    1. Retrait en magasin (pickup) = 0 FCFA
    2. Douala (région Littoral) + >= 20 sacs = 0 FCFA (livraison gratuite)
    3. Tous les autres cas = 3,000 FCFA
    """

    @staticmethod
    def calculate(
        delivery_method: str,
        region: Optional[str],
        total_bags: int
    ) -> Decimal:
        """
        Calcule les frais de livraison selon les critères.

        Args:
            delivery_method: 'home' ou 'pickup'
            region: Région de l'utilisateur (ex: 'Littoral', 'Centre', etc.)
            total_bags: Nombre total de sacs commandés

        Returns:
            Decimal: Montant des frais en FCFA

        Examples:
            >>> DeliveryFeeCalculator.calculate('pickup', 'Littoral', 10)
            Decimal('0')
            >>> DeliveryFeeCalculator.calculate('home', 'Littoral', 25)
            Decimal('0')
            >>> DeliveryFeeCalculator.calculate('home', 'Littoral', 15)
            Decimal('3000')
            >>> DeliveryFeeCalculator.calculate('home', 'Centre', 50)
            Decimal('3000')
        """
        # Règle 1 : Retrait en magasin toujours gratuit
        if delivery_method == 'pickup':
            return Decimal('0')

        # Règle 2 : Douala + 20 sacs ou plus = gratuit
        if region == REGION_DOUALA and total_bags >= DELIVERY_FEE_FREE_THRESHOLD_BAGS:
            return Decimal('0')

        # Règle 3 : Tous les autres cas = frais standard
        return Decimal(str(DELIVERY_FEE_STANDARD))


class OrderTotalCalculator:
    """
    Calculateur du montant total d'une commande.
    """

    @staticmethod
    def calculate_subtotal(items: list[dict]) -> Decimal:
        """
        Calcule le sous-total (somme des lignes de commande).

        Args:
            items: Liste de dicts {'unit_price': Decimal, 'quantity': int}

        Returns:
            Decimal: Sous-total en FCFA

        Examples:
            >>> items = [
            ...     {'unit_price': Decimal('20000'), 'quantity': 2},
            ...     {'unit_price': Decimal('15000'), 'quantity': 3}
            ... ]
            >>> OrderTotalCalculator.calculate_subtotal(items)
            Decimal('85000')
        """
        return sum(
            Decimal(str(item['unit_price'])) * item['quantity']
            for item in items
        )

    @staticmethod
    def calculate_total(subtotal: Decimal, delivery_fee: Decimal) -> Decimal:
        """
        Calcule le montant total (sous-total + frais de livraison).

        Args:
            subtotal: Sous-total des articles
            delivery_fee: Frais de livraison

        Returns:
            Decimal: Total en FCFA
        """
        return subtotal + delivery_fee


class ProductRecommendationCalculator:
    """
    Calculateur pour recommander le bon produit selon le poids du poisson.

    Règles métier (granulométrie selon poids) :
    - Catfish :
        * 0.1-1g : 0.1-0.4mm (INFA)
        * 1-5g : 0.5-2mm (FUTURA)
        * 5-20g : 2mm (CLARIAS FLOAT 2)
        * 20-100g : 3mm (CLARIAS FLOAT 3)
        * 100-250g : 4.5mm (CLARIAS FLOAT 4.5)
        * 250-500g : 6mm (CLARIAS FLOAT 6)
        * >500g : 8mm (CLARIAS FLOAT 8)

    - Tilapia :
        * 0.1-1g : 0.1-0.4mm (INFA)
        * 1-5g : 0.5-2mm (FUTURA)
        * 5-20g : 2mm (TIL-PRO SANA 2)
        * 20-100g : 3mm (TIL-PRO SANA 3)
        * >100g : 3-6mm (TIL-PRO OREA)
    """

    @staticmethod
    def get_recommended_pellet_size(species: str, weight_g: float) -> float:
        """
        Retourne la taille de granulé recommandée selon espèce et poids.

        Args:
            species: 'tilapia' ou 'catfish'
            weight_g: Poids moyen du poisson en grammes

        Returns:
            float: Taille granulé en mm

        Examples:
            >>> ProductRecommendationCalculator.get_recommended_pellet_size('catfish', 150)
            4.5
            >>> ProductRecommendationCalculator.get_recommended_pellet_size('tilapia', 50)
            3.0
        """
        if species.lower() == 'catfish':
            if weight_g < 1:
                return 0.4  # INFA
            elif weight_g < 5:
                return 1.5  # FUTURA
            elif weight_g < 20:
                return 2.0
            elif weight_g < 100:
                return 3.0
            elif weight_g < 250:
                return 4.5
            elif weight_g < 500:
                return 6.0
            else:
                return 8.0

        elif species.lower() == 'tilapia':
            if weight_g < 1:
                return 0.4  # INFA
            elif weight_g < 5:
                return 1.5  # FUTURA
            elif weight_g < 20:
                return 2.0
            elif weight_g < 100:
                return 3.0
            else:
                return 4.5  # TIL-PRO OREA moyenne

        # Par défaut
        return 3.0
