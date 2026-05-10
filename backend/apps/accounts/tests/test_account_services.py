from __future__ import annotations

import json
from decimal import Decimal
from unittest.mock import Mock

import pytest
from accounts.models import FarmProfile
from accounts.services.account_cleanup_adapters import (
    JwtTokenCleanupAdapter,
    PushTokenCleanupAdapter,
    get_default_account_cleanup_ports,
)
from accounts.services.account_deletion_service import AccountDeletionService
from accounts.services.auth_application_service import (
    AuthApplicationService,
    InvalidCredentialsError,
)
from accounts.services.farm_setup_service import FarmSetupService
from accounts.services.language_preference_service import LanguagePreferenceService
from accounts.services.login_rate_limit_service import LoginRateLimitService
from accounts.services.profile_mutation_service import AccountProfileMutationService
from accounts.services.profile_query_service import ProfileQueryService
from django.core.cache import cache
from django.core.exceptions import PermissionDenied, ValidationError
from django.test import RequestFactory


@pytest.mark.django_db
class TestAuthApplicationService:
    def test_authenticate_user_normalizes_identifier_before_django_auth(
        self,
        monkeypatch,
        user_factory,
    ) -> None:
        user = user_factory(password="motdepasse_test123")
        authenticate_mock = Mock(return_value=user)
        monkeypatch.setattr(
            "accounts.services.auth_application_service.authenticate",
            authenticate_mock,
        )

        result = AuthApplicationService.authenticate_user(
            login_name="  Jean Farmer  ",
            password="motdepasse_test123",
        )

        assert result == user
        authenticate_mock.assert_called_once_with(
            login_name="Jean Farmer",
            phone_number=None,
            password="motdepasse_test123",
        )

    def test_authenticate_user_rejects_missing_identifier(self) -> None:
        with pytest.raises(InvalidCredentialsError):
            AuthApplicationService.authenticate_user(password="motdepasse_test123")

    def test_auth_success_result_payload_contains_user_tokens_and_message(self, user_factory) -> None:
        user = user_factory(password="motdepasse_test123")

        result = AuthApplicationService.build_auth_success_result(user, "Connexion reussie")
        payload = result.to_payload()

        assert payload["user"] == user
        assert payload["message"] == "Connexion reussie"
        assert set(payload["tokens"].keys()) == {"refresh", "access"}
        assert len(payload["tokens"]["access"]) > 100


@pytest.mark.django_db
class TestFarmSetupService:
    def test_complete_setup_persists_fields_and_marks_setup_completed(self, user_factory) -> None:
        user = user_factory()
        farm = user.farm_profile

        updated = FarmSetupService.complete_setup(
            farm,
            {
                "setup_species": "tilapia",
                "setup_infrastructure_type": "etang",
                "setup_unit_count": 2,
                "setup_unit_surface_m2": Decimal("150.00"),
                "annual_production_target_kg": Decimal("500.00"),
                "num_cycles_per_year": 2,
                "planned_selling_price_per_kg_fcfa": Decimal("1800.00"),
            },
        )

        updated.refresh_from_db()
        updated.production_plan.refresh_from_db()
        assert updated.production_plan.setup_completed is True
        assert updated.production_plan.setup_species == "tilapia"
        assert updated.production_plan.setup_unit_surface_m2 == Decimal("150.00")
        assert updated.production_plan.planned_selling_price_per_kg_fcfa == Decimal("1800.00")

    def test_complete_setup_rechecks_domain_rules_before_save(self, user_factory) -> None:
        user = user_factory()

        with pytest.raises(ValidationError) as exc_info:
            FarmSetupService.complete_setup(
                user.farm_profile,
                {
                    "setup_species": "tilapia",
                    "setup_infrastructure_type": "etang",
                    "setup_unit_count": 2,
                    "annual_production_target_kg": Decimal("500.00"),
                    "num_cycles_per_year": 2,
                },
            )

        assert "setup_unit_surface_m2" in exc_info.value.message_dict


@pytest.mark.django_db
class TestAccountProfileMutationService:
    def test_update_user_profile_rejects_inactive_account(self, user_factory) -> None:
        user = user_factory()
        user.is_active = False
        user.save(update_fields=["is_active"])

        with pytest.raises(PermissionDenied):
            AccountProfileMutationService.update_user_profile(
                user_id=user.pk,
                updates={"first_name": "Retry"},
            )

        user.refresh_from_db()
        assert user.first_name == "Jean"

    def test_update_user_profile_saves_only_mutable_update_fields(self, user_factory) -> None:
        user = user_factory(first_name="Old", last_name="Name")

        updated = AccountProfileMutationService.update_user_profile(
            user_id=user.pk,
            updates={"first_name": "New"},
        )

        assert updated.first_name == "New"
        assert updated.last_name == "Name"
        assert updated.is_active is True

    def test_update_farm_profile_rejects_deleted_farm(self, user_factory) -> None:
        user = user_factory()
        user.farm_profile.is_deleted = True
        user.farm_profile.save(update_fields=["is_deleted"])

        with pytest.raises(FarmProfile.DoesNotExist):
            AccountProfileMutationService.update_farm_profile(
                user_id=user.pk,
                updates={"farm_name": "Ferme Retry"},
            )

    def test_update_farm_profile_does_not_overwrite_setup_fields(self, user_factory) -> None:
        user = user_factory()
        farm = FarmSetupService.complete_setup(
            user.farm_profile,
            {
                "setup_species": "tilapia",
                "setup_infrastructure_type": "etang",
                "setup_unit_count": 2,
                "setup_unit_surface_m2": Decimal("150.00"),
                "annual_production_target_kg": Decimal("500.00"),
                "num_cycles_per_year": 2,
            },
        )

        updated = AccountProfileMutationService.update_farm_profile(
            user_id=user.pk,
            updates={"farm_name": "Ferme Stable"},
        )

        assert updated.farm_name == "Ferme Stable"
        farm.production_plan.refresh_from_db()
        assert farm.production_plan.setup_completed is True
        assert farm.production_plan.setup_species == "tilapia"


@pytest.mark.django_db
class TestProfileQueryService:
    def test_get_user_profile_loads_farm_profile_in_one_query(
        self,
        django_assert_num_queries,
        user_factory,
    ) -> None:
        user = user_factory(first_name="Profile", last_name="Query")

        with django_assert_num_queries(1):
            result = ProfileQueryService.get_user_profile(user.pk)
            assert result.farm_profile.farm_name == "Ferme de Profile Query"

    def test_get_farm_profile_loads_user_in_one_query(
        self,
        django_assert_num_queries,
        user_factory,
    ) -> None:
        user = user_factory(first_name="Farm", last_name="Query")

        with django_assert_num_queries(1):
            result = ProfileQueryService.get_farm_profile(user.pk)
            assert result.user.display_name == "Farm Query"

    def test_get_farm_profile_raises_model_does_not_exist_for_missing_profile(self) -> None:
        with pytest.raises(FarmProfile.DoesNotExist):
            ProfileQueryService.get_farm_profile("00000000-0000-0000-0000-000000000000")


class TestLoginRateLimitService:
    def setup_method(self) -> None:
        cache.clear()
        self.factory = RequestFactory()
        self.service = LoginRateLimitService(
            ip_limit=2,
            user_limit=2,
            window_seconds=60,
        )
        self.endpoint_limits = {
            "/api/accounts/login/": {
                "ip_limit": 2,
                "window_seconds": 60,
            }
        }

    def test_should_rate_limit_false_for_unprotected_endpoint(self) -> None:
        request = self.factory.post("/api/accounts/profile/")

        assert self.service.should_rate_limit(request, self.endpoint_limits) is False

    def test_records_failed_attempts_by_ip_and_identifier(self) -> None:
        request = self.factory.post(
            "/api/accounts/login/",
            data=json.dumps({"login_name": "Rate Limit Unique", "password": "faux"}),
            content_type="application/json",
        )
        request.META["REMOTE_ADDR"] = "10.0.0.5"

        self.service.record_failed_attempt(request)

        ip_attempts = cache.get(self.service.tracker.cache_key_ip("10.0.0.5"))
        user_attempts = cache.get(self.service.tracker.cache_key_user("rate limit unique"))
        assert ip_attempts == 1
        assert user_attempts == 1

    def test_should_rate_limit_after_reaching_ip_limit(self) -> None:
        request = self.factory.post(
            "/api/accounts/login/",
            data=json.dumps({"login_name": "Jean Farmer", "password": "faux"}),
            content_type="application/json",
            REMOTE_ADDR="10.0.0.6",
        )
        self.service.record_failed_attempt(request)
        self.service.record_failed_attempt(request)

        assert self.service.should_rate_limit(request, self.endpoint_limits) is True


@pytest.mark.django_db
class TestLanguagePreferenceService:
    def test_get_jwt_user_language_returns_none_for_non_api_request(self) -> None:
        request = RequestFactory().get("/")

        assert LanguagePreferenceService.get_jwt_user_language(request) is None

    def test_get_jwt_user_language_returns_none_without_authorization(self) -> None:
        request = RequestFactory().get("/api/accounts/profile/")

        assert LanguagePreferenceService.get_jwt_user_language(request) is None

    def test_get_jwt_user_language_reads_authenticated_jwt_user_language(self, user_factory) -> None:
        user = user_factory(language_preference="en")
        token = AuthApplicationService.build_auth_tokens(user).access
        request = RequestFactory().get(
            "/api/accounts/profile/",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )

        assert LanguagePreferenceService.get_jwt_user_language(request) == "en"


@pytest.mark.django_db
class TestAccountCleanupPorts:
    class RecordingCleanupPort:
        def __init__(self) -> None:
            self.cleaned_user_ids: list[object] = []

        def cleanup_for_user(self, user_id: object) -> None:
            self.cleaned_user_ids.append(user_id)

    def test_anonymize_user_account_calls_injected_cleanup_ports(self, user_factory) -> None:
        user = user_factory(password="motdepasse_test123")
        cleanup_port = self.RecordingCleanupPort()

        AccountDeletionService.anonymize_user_account(
            user,
            cleanup_ports=(cleanup_port,),
        )

        assert cleanup_port.cleaned_user_ids == [user.id]

    def test_default_cleanup_ports_use_infrastructure_adapters(self) -> None:
        ports = get_default_account_cleanup_ports()

        assert len(ports) == 2
        assert isinstance(ports[0], JwtTokenCleanupAdapter)
        assert isinstance(ports[1], PushTokenCleanupAdapter)
