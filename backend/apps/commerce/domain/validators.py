"""
Validateurs métier pour le module commerce MAVECAM AquaCare.

Architecture Clean : Validations de règles métier pures,
sans dépendances Django (utilisables hors contexte web).
"""
from __future__ import annotations

from decimal import Decimal
from typing import Final, Literal, TypedDict

from ..constants import PICKUP_LOCATION_CHOICES
from .exceptions import InvalidOrderError

DeliveryMethod = Literal["home", "pickup"]


class OrderItemPayload(TypedDict):
    product_id: str
    quantity: int


class OrderValidator:
    """
    Validateur pour les données de commande.
    """

    VALID_DELIVERY_METHODS: Final[tuple[DeliveryMethod, ...]] = ("home", "pickup")

    @staticmethod
    def validate_items(items: list[OrderItemPayload]) -> None:
        """
        Valide que les items de commande sont corrects.

        Args:
            items: Liste de dicts contenant product_id et quantity

        Raises:
            InvalidOrderError: Si validation échoue

        Examples:
            >>> OrderValidator.validate_items([])
            Traceback (most recent call last):
            ...
            InvalidOrderError: La commande doit contenir au moins un article

            >>> OrderValidator.validate_items([{'product_id': 'abc', 'quantity': 0}])
            Traceback (most recent call last):
            ...
            InvalidOrderError: La quantité doit être supérieure à 0
        """
        if not items:
            raise InvalidOrderError("La commande doit contenir au moins un article")

        for item in items:
            # Vérifier présence product_id
            if 'product_id' not in item:
                raise InvalidOrderError("Chaque article doit avoir un product_id")

            # Vérifier présence quantity
            if 'quantity' not in item:
                raise InvalidOrderError("Chaque article doit avoir une quantité")

            # Vérifier quantité positive
            quantity = item['quantity']
            if not isinstance(quantity, int) or quantity <= 0:
                raise InvalidOrderError(
                    f"La quantité doit être supérieure à 0 (reçu: {quantity})"
                )

    @staticmethod
    def validate_delivery_method(
        delivery_method: DeliveryMethod,
        pickup_location: str | None = None,
    ) -> None:
        """
        Valide la méthode de livraison et le point de retrait si applicable.

        Args:
            delivery_method: 'home' ou 'pickup'
            pickup_location: 'ndokoti' ou 'ndogpasi' (requis si pickup)

        Raises:
            InvalidOrderError: Si validation échoue
        """
        if delivery_method not in OrderValidator.VALID_DELIVERY_METHODS:
            raise InvalidOrderError(
                f"Méthode de livraison invalide: {delivery_method}. "
                f"Valeurs acceptées: {', '.join(OrderValidator.VALID_DELIVERY_METHODS)}"
            )

        # Si retrait en magasin, vérifier point de retrait
        if delivery_method == 'pickup':
            valid_locations = [loc[0] for loc in PICKUP_LOCATION_CHOICES]
            if not pickup_location:
                raise InvalidOrderError(
                    "Le point de retrait est requis pour la méthode 'pickup'"
                )
            if pickup_location not in valid_locations:
                raise InvalidOrderError(
                    f"Point de retrait invalide: {pickup_location}. "
                    f"Valeurs acceptées: {', '.join(valid_locations)}"
                )

    @staticmethod
    def validate_amounts(subtotal: Decimal, delivery_fee: Decimal, total: Decimal) -> None:
        """
        Valide la cohérence des montants (subtotal + delivery_fee = total).

        Args:
            subtotal: Sous-total des articles
            delivery_fee: Frais de livraison
            total: Total calculé

        Raises:
            InvalidOrderError: Si montants incohérents
        """
        expected_total = subtotal + delivery_fee
        if total != expected_total:
            raise InvalidOrderError(
                f"Montant total incohérent. "
                f"Attendu: {expected_total}, Reçu: {total}"
            )

        # Vérifier montants positifs
        if subtotal < 0 or delivery_fee < 0 or total < 0:
            raise InvalidOrderError("Les montants ne peuvent pas être négatifs")


class ProductValidator:
    """
    Validateur pour les données de produits.
    """

    @staticmethod
    def validate_price(price: Decimal) -> None:
        """
        Valide qu'un prix est positif.

        Args:
            price: Prix en FCFA

        Raises:
            ValueError: Si prix invalide
        """
        if price < 0:
            raise ValueError("Le prix ne peut pas être négatif")

        if price == 0:
            raise ValueError("Le prix ne peut pas être zéro")

    @staticmethod
    def validate_specifications(pellet_size_mm: Decimal, protein_pct: int, lipid_pct: int) -> None:
        """
        Valide les spécifications techniques d'un aliment.

        Args:
            pellet_size_mm: Taille granulé en mm
            protein_pct: Pourcentage de protéines (0-100)
            lipid_pct: Pourcentage de lipides (0-100)

        Raises:
            ValueError: Si spécifications invalides
        """
        if pellet_size_mm <= 0:
            raise ValueError("La taille des granulés doit être positive")

        if not (0 <= protein_pct <= 100):
            raise ValueError("Le taux de protéines doit être entre 0 et 100%")

        if not (0 <= lipid_pct <= 100):
            raise ValueError("Le taux de lipides doit être entre 0 et 100%")
