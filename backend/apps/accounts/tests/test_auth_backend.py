from __future__ import annotations

import pytest
from accounts.backends import MavecamAuthBackend


@pytest.mark.django_db
class TestMavecamAuthBackend:
    @pytest.fixture
    def backend(self) -> MavecamAuthBackend:
        return MavecamAuthBackend()

    def test_authenticate_by_login_name(self, backend: MavecamAuthBackend, user_factory) -> None:
        user = user_factory(
            first_name="Jeanne",
            last_name="Piscicultrice",
            password="motdepasse_test123",
        )

        authenticated_user = backend.authenticate(
            request=None,
            login_name="Jeanne Piscicultrice",
            password="motdepasse_test123",
        )

        assert authenticated_user == user

    def test_authenticate_company_by_login_name(self, backend: MavecamAuthBackend, user_factory) -> None:
        user = user_factory(
            account_type="company",
            business_name="Aqua Business SARL",
            promoter_name="Jean Promoteur",
            legal_status="sarl",
            age_group=None,
            password="motdepasse_test123",
        )

        authenticated_user = backend.authenticate(
            request=None,
            login_name="Aqua Business SARL",
            password="motdepasse_test123",
        )

        assert authenticated_user == user

    def test_authenticate_by_phone_number(self, backend: MavecamAuthBackend, user_factory) -> None:
        user = user_factory(password="motdepasse_test123")

        authenticated_user = backend.authenticate(
            request=None,
            phone_number=user.phone_number,
            password="motdepasse_test123",
        )

        assert authenticated_user == user

    @pytest.mark.parametrize(
        ("login_kwargs", "password"),
        [
            ({"login_name": "Utilisateur Inexistant"}, "motdepasse_test123"),
            ({"login_name": "Jean Farmer"}, "mauvais-mot-de-passe"),
            ({"phone_number": "+237690000000"}, "motdepasse_test123"),
        ],
    )
    def test_authenticate_returns_none_for_unknown_or_invalid_credentials(
        self,
        backend: MavecamAuthBackend,
        user_factory,
        login_kwargs: dict[str, str],
        password: str,
    ) -> None:
        user_factory(first_name="Jean", last_name="Farmer", password="motdepasse_test123")

        authenticated_user = backend.authenticate(
            request=None,
            password=password,
            **login_kwargs,
        )

        assert authenticated_user is None

    def test_authenticate_returns_none_for_inactive_user(
        self,
        backend: MavecamAuthBackend,
        user_factory,
    ) -> None:
        user = user_factory(is_active=False, password="motdepasse_test123")

        authenticated_user = backend.authenticate(
            request=None,
            phone_number=user.phone_number,
            password="motdepasse_test123",
        )

        assert authenticated_user is None

    def test_authenticate_returns_none_without_password(
        self,
        backend: MavecamAuthBackend,
        user_factory,
    ) -> None:
        user = user_factory()

        authenticated_user = backend.authenticate(
            request=None,
            phone_number=user.phone_number,
            password=None,
        )

        assert authenticated_user is None

    def test_get_user_returns_none_for_unknown_identifier(self, backend: MavecamAuthBackend) -> None:
        assert backend.get_user(999999999) is None
