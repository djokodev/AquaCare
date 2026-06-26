"""Value object leger pour les identifiants de connexion accounts."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LoginIdentifier:
    """Identifiant de connexion normalise, nom d'affichage ou telephone."""

    login_name: str | None = None
    phone_number: str | None = None

    @classmethod
    def from_credentials(
        cls,
        *,
        login_name: str | None = None,
        phone_number: str | None = None,
    ) -> LoginIdentifier:
        normalized_login_name = login_name.strip() if login_name else None
        normalized_phone = phone_number.strip() if phone_number else None
        return cls(
            login_name=normalized_login_name or None,
            phone_number=normalized_phone or None,
        )

    @property
    def has_value(self) -> bool:
        return self.login_name is not None or self.phone_number is not None
