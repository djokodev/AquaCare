"""
Deliverabilite des adresses email — regles pures sans dependance DRF.

Methode retenue (Decision prod 2026-09): l'email est obligatoire a
l'inscription et sert a la reinitialisation de mot de passe. On verifie la
syntaxe DRF et l'existence de records MX/A du domaine, sans jamais envoyer de
message de confirmation (pas d'OTP email pour le lancement).

Politique d'echec: un domaine sans MX/A est rejete; une erreur reseau de NOTRE
cote (DNS indisponible, timeout) laisse passer l'inscription pour ne pas
bloquer des utilisateurs a cause d'une indisponibilite de notre infra.
"""
from __future__ import annotations

from collections.abc import Callable

from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

ResolverFunction = Callable[[str, str], bool]

__all__ = [
    "domain_has_mail_records",
    "EmailDeliverabilityValidator",
    "resolve_default_domain_mail_records",
]


def _resolve_domain_mail_records(domain: str, record_type: str) -> bool:
    """Resolution DNS reelle via dnspython (import paresseux)."""
    import dns.resolver

    resolver = dns.resolver.Resolver()
    resolver.lifetime = 5.0
    try:
        return bool(resolver.resolve(domain, record_type))
    except dns.resolver.NXDOMAIN:
        # Le domaine n'existe pas du tout: MX et A seront absents.
        return False
    except dns.resolver.NoAnswer:
        # Pas d'enregistrement du type demande: on laisse l'appelant tester
        # le type suivant (MX absent mais A present = domaine mail valide).
        return False
    except Exception:
        # Indisponibilite DNS de notre cote: echec ouvert (voir docstring).
        return True


def resolve_default_domain_mail_records(domain: str, record_type: str) -> bool:
    """Point d'injection par defaut pour les tests (seam de resolution DNS)."""
    return _resolve_domain_mail_records(domain, record_type)


def domain_has_mail_records(
    domain: str,
    resolver: ResolverFunction | None = None,
) -> bool:
    """
    Verifie qu'un domaine sait recevoir du mail (MX, sinon A/AAAA fallback).

    Retourne True en cas de doute reseau (fail-open) et False uniquement
    quand le DNS repond clairement que le domaine n'existe pas ou n'annonce
    aucun record mail.
    """
    if not domain or "." not in domain:
        return False

    resolver = resolver or resolve_default_domain_mail_records

    try:
        if resolver(domain, "MX"):
            return True

        a_record = resolver(domain, "A")
        aaaa_record = resolver(domain, "AAAA")
    except Exception:
        # Resolver en echec (reseau ou injecte): fail-open (voir docstring).
        return True

    return bool(a_record or aaaa_record)


class EmailDeliverabilityValidator:
    """
    Validateur de domaine email: rejette les domaines sans record mail.

    Utilise a l'inscription et sur l'edition du profil pour eviter les
    comptes non-reinitialisables a cause d'une faute de frappe de domaine
    (ex: utilisateur@gmail.com vs utilisateur@gamil.com).
    """

    def __init__(self, resolver: ResolverFunction | None = None):
        self._resolver = resolver

    def _has_mail_records(self, domain: str) -> bool:
        resolver = self._resolver
        if resolver is not None:
            try:
                return domain_has_mail_records(domain, resolver)
            except Exception:
                return True
        return domain_has_mail_records(domain)

    def __call__(self, value: str) -> None:
        if not value:
            return

        if not getattr(settings, "ACCOUNT_EMAIL_MX_VALIDATION", True):
            return

        domain = value.rsplit("@", 1)[-1].strip().lower()
        if not domain:
            return

        if not self._has_mail_records(domain):
            raise ValidationError(
                _(
                    "Ce domaine email ne peut pas recevoir de messages. "
                    "Verifiez l'adresse (ex: @gmail.com, @yahoo.com)."
                )
            )
