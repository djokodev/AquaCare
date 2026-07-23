"""
Exceptions métier pour le module commerce AquaCare.

Architecture Clean : Les exceptions du domain représentent des violations
de règles métier et sont indépendantes de l'infrastructure Django.
"""


class CommerceException(Exception):
    """Exception de base pour le module commerce."""
    pass


class ProductNotFoundError(CommerceException):
    """Produit introuvable dans le catalogue."""
    pass


class ProductNotAvailableError(CommerceException):
    """Produit temporairement indisponible."""
    pass


class InvalidOrderError(CommerceException):
    """Données de commande invalides (panier vide, quantité négative, etc.)."""
    pass


class DeliveryAddressIncompleteError(InvalidOrderError):
    """Adresse de livraison à domicile incomplète pour créer une commande."""

    code = 'delivery_address_incomplete'

    def __init__(self, missing_fields: list[str]):
        self.missing_fields = tuple(missing_fields)
        super().__init__('Informations de livraison à domicile incomplètes')


class OrderNotFoundError(CommerceException):
    """Commande introuvable pour cet utilisateur."""
    pass


class InsufficientStockError(CommerceException):
    """Stock insuffisant pour traiter la commande (futur usage)."""
    pass


class DeliveryFeeCalculationError(CommerceException):
    """Erreur lors du calcul des frais de livraison."""
    pass


class FeedingSuggestionError(CommerceException):
    """Erreur lors du calcul des suggestions d'alimentation."""
    pass
