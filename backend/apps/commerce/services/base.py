"""
Service de base pour le module commerce MAVECAM AquaCare.

Hérite du BaseService existant dans aquaculture pour réutiliser
les fonctionnalités communes (logging, validation, etc.).
"""
import logging
from abc import ABC

logger = logging.getLogger(__name__)


class BaseCommerceService(ABC):
    """
    Service de base pour tous les services du module commerce.

    Fournit des méthodes utilitaires communes :
    - Logging standardisé
    - Validation de champs requis
    - Gestion d'erreurs

    Tous les services commerce doivent hériter de cette classe.
    """

    @staticmethod
    def log_operation(operation: str, details: dict = None, level: str = 'info'):
        """
        Log une opération service avec contexte.

        Args:
            operation: Nom de l'opération (ex: 'create_order')
            details: Détails contextuels (user_id, order_id, etc.)
            level: Niveau de log ('info', 'warning', 'error')

        Examples:
            >>> BaseCommerceService.log_operation('create_order', {'user_id': '123', 'total': 50000})
        """
        log_message = f"[Commerce] {operation}"
        if details:
            log_message += f" - {details}"

        if level == 'info':
            logger.info(log_message)
        elif level == 'warning':
            logger.warning(log_message)
        elif level == 'error':
            logger.error(log_message)

    @staticmethod
    def validate_required_fields(data: dict, required_fields: list) -> None:
        """
        Valide la présence de champs requis dans un dictionnaire.

        Args:
            data: Dictionnaire de données à valider
            required_fields: Liste des champs obligatoires

        Raises:
            ValueError: Si un champ requis est manquant

        Examples:
            >>> data = {'name': 'Test', 'price': 1000}
            >>> BaseCommerceService.validate_required_fields(data, ['name', 'price'])
            >>> BaseCommerceService.validate_required_fields(data, ['name', 'quantity'])
            Traceback (most recent call last):
            ...
            ValueError: Champ requis manquant: quantity
        """
        missing_fields = [field for field in required_fields if field not in data or data[field] is None]

        if missing_fields:
            raise ValueError(f"Champs requis manquants: {', '.join(missing_fields)}")
