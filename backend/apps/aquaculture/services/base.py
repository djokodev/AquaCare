"""
Service de base abstrait pour tous les services métier aquaculture.

Ce module fournit la classe abstraite BaseService dont tous les services
métier doivent hériter. Il centralise les fonctionnalités communes et
garantit une architecture cohérente.

Architecture :
- Services stateless (méthodes statiques)
- Gestion transactionnelle automatique
- Logging centralisé
- Validation métier systématique
"""
from __future__ import annotations

import logging
from abc import ABC
from decimal import Decimal
from typing import Literal

from django.utils.translation import gettext_lazy as _

logger = logging.getLogger(__name__)

type LogLevel = Literal["debug", "info", "warning", "error"]
type NumericValue = int | float | Decimal


class BaseService(ABC):
    """
    Classe de base pour tous les services métier aquaculture.

    Responsabilités :
    - Fournir des utilitaires communs (logging, validation)
    - Garantir l'utilisation de transactions
    - Centraliser la gestion d'erreurs

    Conventions :
    - Méthodes publiques : opérations métier complexes
    - Méthodes privées (_method) : validations et helpers
    - Méthodes statiques uniquement (services stateless)

    Exemple d'utilisation :
        class ProductionCycleService(BaseService):
            @staticmethod
            @transaction.atomic
            def create_cycle(farm_profile, cycle_data):
                # Implémentation
                pass
    """

    @staticmethod
    def log_operation(operation: str, details: dict | None = None, level: str = 'info'):
        """
        Log standardisé des opérations métier.

        Args:
            operation: Nom de l'opération (ex: "create_cycle", "harvest_cycle")
            details: Détails additionnels à logger
            level: Niveau de log ('debug', 'info', 'warning', 'error')
        """
        log_message = f"[AquacultureService] {operation}"
        if details:
            log_message += f" - {details}"

        log_func = getattr(logger, level, logger.info)
        log_func(log_message)

    @staticmethod
    def validate_required_fields(data: dict, required_fields: list[str], context: str = ""):
        """
        Valide la présence de champs requis.

        Args:
            data: Dictionnaire de données à valider
            required_fields: Liste des champs requis
            context: Contexte pour message d'erreur

        Raises:
            ValueError: Si un champ requis est manquant
        """
        missing_fields = [field for field in required_fields if field not in data or data[field] is None]

        if missing_fields:
            context_msg = f" pour {context}" if context else ""
            raise ValueError(
                _(f"Champs requis manquants{context_msg}: {', '.join(missing_fields)}")
            )

    @staticmethod
    def safe_divide(
        numerator: NumericValue | None,
        denominator: NumericValue | None,
        default: float | None = None,
    ) -> float | None:
        """
        Division sécurisée avec gestion division par zéro.

        Args:
            numerator: Numérateur
            denominator: Dénominateur
            default: Valeur par défaut si division impossible

        Returns:
            Résultat de la division ou valeur par défaut
        """
        try:
            if denominator and float(denominator) != 0:
                return float(numerator / denominator)
            return default
        except (TypeError, ValueError, ZeroDivisionError):
            return default
