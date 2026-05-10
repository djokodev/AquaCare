"""Invariants purs pour les comptes utilisateur AquaCare."""

from __future__ import annotations

from typing import Any

from django.utils.translation import gettext_lazy as _


def is_blank_value(value: Any) -> bool:
    """Retourne True si une valeur obligatoire est absente ou vide apres trim."""
    return value is None or (isinstance(value, str) and value.strip() == "")


def _merged_value(attrs: dict[str, Any], instance: object | None, field_name: str) -> Any:
    if field_name in attrs:
        return attrs[field_name]
    if instance is not None:
        return getattr(instance, field_name)
    return None


def build_user_account_invariant_errors(
    attrs: dict[str, Any],
    instance: object | None = None,
) -> dict[str, object]:
    """
    Construit les erreurs des invariants personne physique/entreprise.

    Cette fonction ne depend ni de DRF, ni du modele Django. Les adapters
    convertissent le dictionnaire retourne vers leur exception native.
    """
    account_type = _merged_value(attrs, instance, "account_type") or "individual"
    errors: dict[str, object] = {}

    if account_type == "company":
        if is_blank_value(_merged_value(attrs, instance, "business_name")):
            errors["business_name"] = _("Le nom de l'entreprise est requis pour les comptes entreprise.")
        if is_blank_value(_merged_value(attrs, instance, "legal_status")):
            errors["legal_status"] = _("Le statut juridique est requis pour les entreprises.")
        if is_blank_value(_merged_value(attrs, instance, "promoter_name")):
            errors["promoter_name"] = _("Le nom du promoteur est requis pour les entreprises.")
        if not is_blank_value(_merged_value(attrs, instance, "age_group")):
            errors["age_group"] = _("La classe d'âge ne s'applique qu'aux personnes physiques.")

    elif account_type == "individual":
        if is_blank_value(_merged_value(attrs, instance, "first_name")):
            errors["first_name"] = _("Le prénom est requis pour les comptes individuels.")
        if is_blank_value(_merged_value(attrs, instance, "last_name")):
            errors["last_name"] = _("Le nom est requis pour les comptes individuels.")
        if is_blank_value(_merged_value(attrs, instance, "age_group")):
            errors["age_group"] = _("La classe d'âge est requise pour les personnes physiques.")
        if not is_blank_value(_merged_value(attrs, instance, "business_name")):
            errors["business_name"] = _("Le nom d'entreprise ne s'applique qu'aux entreprises.")
        if not is_blank_value(_merged_value(attrs, instance, "legal_status")):
            errors["legal_status"] = _("Le statut juridique ne s'applique qu'aux entreprises.")
        if not is_blank_value(_merged_value(attrs, instance, "promoter_name")):
            errors["promoter_name"] = _("Le nom du promoteur ne s'applique qu'aux entreprises.")

    if (
        not is_blank_value(_merged_value(attrs, instance, "department"))
        and is_blank_value(_merged_value(attrs, instance, "region"))
    ):
        errors["region"] = _("La région est requise si le département est spécifié.")

    if not is_blank_value(_merged_value(attrs, instance, "district")):
        if is_blank_value(_merged_value(attrs, instance, "department")):
            errors["department"] = _("Le département est requis si l'arrondissement est spécifié.")
        if is_blank_value(_merged_value(attrs, instance, "region")):
            errors["region"] = _("La région est requise si l'arrondissement est spécifié.")

    return errors
