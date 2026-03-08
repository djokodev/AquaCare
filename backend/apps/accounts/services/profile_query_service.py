"""Services applicatifs de lecture pour les profils accounts."""

from __future__ import annotations

from accounts.models import FarmProfile, User


class ProfileQueryService:
    """Use cases de lecture pour les profils utilisateur et ferme."""

    @staticmethod
    def get_user_profile(user_id: object) -> User:
        """Retourne le profil utilisateur avec son profil ferme hydrate."""
        return User.objects.with_farm_profile().get(pk=user_id)

    @staticmethod
    def get_farm_profile(user_id: object) -> FarmProfile:
        """Retourne le profil ferme rattache a un utilisateur."""
        return FarmProfile.objects.with_user().get(user_id=user_id)
