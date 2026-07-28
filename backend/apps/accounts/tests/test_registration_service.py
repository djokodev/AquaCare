from __future__ import annotations

import pytest
from accounts.services.registration_service import AccountRegistrationService
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
class TestAccountRegistrationService:
    def test_register_user_creates_user_and_default_farm_profile(self) -> None:
        user = AccountRegistrationService.register_user(
            phone_number="+237690555111",
            first_name="Service",
            last_name="Farmer",
            password="motdepasse123",
            account_type="individual",
            age_group="26_35",
        )

        assert user.pk is not None
        assert user.check_password("motdepasse123")
        assert user.farm_profile.farm_name == "Ferme de Service Farmer"
        assert user.farm_profile.certification_status == "pending"

    def test_register_user_rolls_back_if_default_farm_profile_fails(self, monkeypatch) -> None:
        def fail_farm_profile_creation(user):
            raise RuntimeError("farm profile failed")

        monkeypatch.setattr(
            AccountRegistrationService,
            "_create_default_farm_profile",
            fail_farm_profile_creation,
        )

        with pytest.raises(RuntimeError, match="farm profile failed"):
            AccountRegistrationService.register_user(
                phone_number="+237690555112",
                first_name="Rollback",
                last_name="Service",
                password="motdepasse123",
                account_type="individual",
                age_group="26_35",
            )

        assert not User.objects.filter(phone_number="+237690555112").exists()
