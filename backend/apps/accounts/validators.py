from __future__ import annotations

import re
from re import Pattern

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

from .domain.account_invariants import (
    build_user_account_invariant_errors,
    is_blank_value,
)

__all__ = [
    "PhoneNumberValidator",
    "build_user_account_invariant_errors",
    "is_blank_value",
    "normalize_login_value",
    "normalize_phone_number",
    "validate_cameroon_phone",
]


class PhoneNumberValidator:
    """
    Validateur pour les numéros de téléphone camerounais et internationaux.

    Métier : Les pisciculteurs AquaCare utilisent principalement des numéros
    camerounais (+237) mais peuvent aussi avoir des numéros internationaux.

    Formats acceptés :
    - Cameroun : +237XXXXXXXXX, 237XXXXXXXXX, 6XXXXXXXX, 7XXXXXXXX
    - International : +XXX format standard
    """

    # Patterns compilés une fois au niveau classe (immuables)
    _PATTERNS: tuple[Pattern[str], ...] = (
        re.compile(r'^\+237[67]\d{8}$'),   # +2376XXXXXXXX ou +2377XXXXXXXX
        re.compile(r'^237[67]\d{8}$'),     # 2376XXXXXXXX ou 2377XXXXXXXX
        re.compile(r'^[67]\d{8}$'),        # 6XXXXXXXX ou 7XXXXXXXX
        re.compile(r'^\+[1-9]\d{1,14}$'),  # Format international standard
    )

    def __call__(self, value: str | None) -> None:
        """
        Valide le numéro de téléphone selon les formats acceptés.
        
        Args:
            value (str): Numéro de téléphone à valider
            
        Raises:
            ValidationError: Si le format n'est pas valide
        """
        if not value:
            raise ValidationError(_("Le numéro de téléphone est requis."))
        
        # Nettoyer la valeur (espaces, tirets)
        cleaned_value = re.sub(r'[\s\-\(\)]', '', str(value))

        # Tester les différents formats
        for pattern in self._PATTERNS:
            if pattern.match(cleaned_value):
                return  # Format valide trouvé
        
        # Aucun format valide
        raise ValidationError(
            _("Format de numéro invalide. Formats acceptés : "
              "+237XXXXXXXXX (Cameroun) ou +XXX format international.")
        )


def normalize_phone_number(phone_number: str | None) -> str | None:
    """
    Normalise un numéro de téléphone au format international.
    
    Métier : Stockage uniforme des téléphones pour éviter les doublons
    et faciliter les recherches.
    
    Args:
        phone_number (str): Numéro à normaliser
        
    Returns:
        str: Numéro normalisé au format +XXXXXXXXXXXX
        
    Examples:
        normalize_phone_number("677123456") -> "+237677123456"
        normalize_phone_number("237677123456") -> "+237677123456"
        normalize_phone_number("+237677123456") -> "+237677123456"
    """
    if not phone_number:
        return phone_number
    
    # Nettoyer la valeur
    cleaned = re.sub(r'[\s\-\(\)]', '', str(phone_number))
    
    # Si commence par 6 ou 7 (numéro camerounais local)
    if re.match(r'^[67]\d{8}$', cleaned):
        return f"+237{cleaned}"
    
    # Si commence par 237 (code camerounais sans +)
    if re.match(r'^237[67]\d{8}$', cleaned):
        return f"+{cleaned}"
    
    # Si commence par + (déjà au format international)
    if cleaned.startswith('+'):
        return cleaned
    
    # Autres cas : retourner tel quel
    return cleaned


def normalize_login_value(value: str | None) -> str:
    """Normalise une valeur de login textuel pour les recherches indexees."""
    if not value:
        return ""

    return " ".join(str(value).strip().split()).casefold()


def validate_cameroon_phone(value: str | None) -> None:
    """
    Validateur Django simple pour numéros camerounais.
    
    Usage dans les modèles Django :
    phone = models.CharField(validators=[validate_cameroon_phone])
    """
    validator = PhoneNumberValidator()
    validator(value)
