from decimal import Decimal, InvalidOperation

from django import template
from django.utils.translation import get_language

register = template.Library()


def _empty_value() -> str:
    return "Not provided" if (get_language() or "fr").startswith("en") else "Non renseigné"


def _number(value: object) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


@register.filter
def report_measure(value: object, unit: str = "") -> str:
    number = _number(value)
    if number is None:
        return _empty_value()
    try:
        decimals = int((unit or "").split("|")[-1]) if "|" in unit else 2
    except ValueError:
        decimals = 2
    formatted = f"{number:,.{decimals}f}"
    if (get_language() or "fr").startswith("fr"):
        formatted = formatted.replace(",", " ").replace(".", ",")
    clean_unit = (unit or "").split("|")[0]
    return f"{formatted} {clean_unit}".strip()


@register.filter
def report_integer(value: object) -> str:
    number = _number(value)
    if number is None:
        return _empty_value()
    formatted = f"{number:,.0f}"
    return formatted.replace(",", " ") if (get_language() or "fr").startswith("fr") else formatted
