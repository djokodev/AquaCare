"""
Operateurs mobiles camerounais — registre informatif de prefixes.

Objectif produit (Decision prod 2026-09): approximer "ce numero peut recevoir
un message WhatsApp" sans OTP ni dependance externe. En pratique, un numero
mobile camerounais valide (+237[67]XXXXXXXX, structure deja garantie par
PhoneNumberValidator) appartient a un operateur mobile avec data.

Decision d'ingenierie: on NE rejette PAS un numero camerounais dont le
prefixe serait inconnu du registre. L'ARTEL peut allouer de nouvelles plages;
un registre stale bloquerait de vrais utilisateurs. Le registre sert donc au
support/admin (identification de l'operateur, relance WhatsApp), pas a la
rejection.
"""
from __future__ import annotations

import re

from .account_invariants import is_blank_value

__all__ = [
    "guess_cameroon_mobile_operator",
    "is_cameroon_mobile_number",
]

# Plages mobiles camerounaises connues (prefixe national a 2 chiffres apres 6).
# Maintien manuel: re-verifier les allocations ARTEL si un rejet produit des
# faux negatifs chez les utilisateurs. Le guessing detaille vit dans
# guess_cameroon_mobile_operator.

_CAMEROON_MOBILE_PATTERN = re.compile(r"^\+237[67]\d{8}$")


def is_cameroon_mobile_number(phone_number: str | None) -> bool:
    """Un numero au format E.164 est-il un mobile camerounais (+237[67]…)?"""
    if is_blank_value(phone_number):
        return False
    return bool(_CAMEROON_MOBILE_PATTERN.match(str(phone_number).strip()))


def _national_part(phone_number: str) -> str | None:
    """Partie nationale a 9 chiffres d'un mobile camerounais, sinon None."""
    if not is_cameroon_mobile_number(phone_number):
        return None
    return str(phone_number).strip().removeprefix("+237")


def guess_cameroon_mobile_operator(phone_number: str | None) -> str | None:
    """
    Devine l'operateur d'un mobile camerounais, ou None si inconnu/etranger.

    Prefixes nationaux connus (allocation ARTEL):
    - MTN: 650-654, 670-679, 680-683
    - Orange: 655-659, 690-699, 684-685
    - Camtel: 620-625
    - Nexttel: 662-668 (couvert par la plage 66x)

    Le guessing est toleran: un prefixe non reference retourne None sans
    jamais invalider le numero.
    """
    national = _national_part(phone_number)
    if national is None:
        return None

    first_two = national[:2]
    third = national[2]

    if first_two == "62":
        return "Camtel" if third in "012345" else None
    if first_two == "66":
        return "Nexttel" if third in "2345678" else None
    if first_two == "65":
        if third in "01234":
            return "MTN"
        if third in "56789":
            return "Orange"
        return None
    if first_two == "67":
        return "MTN"
    if first_two == "68":
        if third in "0123":
            return "MTN"
        if third in "45":
            return "Orange"
        return None
    if first_two == "69":
        return "Orange"
    return None
