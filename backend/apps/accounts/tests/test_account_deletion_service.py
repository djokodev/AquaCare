from __future__ import annotations

import pytest
from accounts.services.account_deletion_service import AccountDeletionService
from aquaculture.services.farm_production_plan_service import FarmProductionPlanService
from notifications.models import PushToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken


@pytest.mark.django_db
class TestAccountDeletionService:
    def test_anonymize_user_account_disables_user_and_cleans_related_tokens(self, monkeypatch, user_factory) -> None:
        user = user_factory(
            phone_number="+237690777777",
            email="owner@example.com",
            first_name="Alice",
            last_name="Owner",
            password="motdepasse_test123",
        )
        user.farm_profile.farm_name = "Ferme du Littoral"
        user.farm_profile.latitude = "3.8680000"
        user.farm_profile.longitude = "11.5174000"
        user.farm_profile.location_address = "Adresse sensible"
        user.farm_profile.save()
        FarmProductionPlanService.complete_setup(
            user.farm_profile,
            {
                "annual_production_target_kg": "1200.00",
                "num_cycles_per_year": 2,
                "setup_infrastructure_type": "etang",
                "setup_unit_count": 3,
                "setup_unit_surface_m2": "150.00",
                "setup_species": "tilapia",
                "fingerlings_cost_per_unit_fcfa": "50.00",
                "planned_selling_price_per_kg_fcfa": "2800.00",
            },
        )

        PushToken.objects.create(
            user=user,
            expo_push_token="ExponentPushToken[test-token-accounts]",
            device_id="device-accounts-1",
            platform="android",
        )
        RefreshToken.for_user(user)

        monkeypatch.setattr(
            AccountDeletionService,
            "_generate_anonymized_phone",
            staticmethod(lambda _user_id: "+237612345678"),
        )

        result = AccountDeletionService.anonymize_user_account(user)

        user.refresh_from_db()
        user.farm_profile.refresh_from_db()

        assert result.anonymized_phone == "+237612345678"
        assert user.phone_number == "+237612345678"
        assert user.email == ""
        assert user.first_name == "Compte"
        assert user.last_name == "Supprimé"
        assert user.is_active is False
        assert user.is_verified is False
        assert user.has_usable_password() is False
        assert user.farm_profile.is_deleted is True
        assert user.farm_profile.farm_name.startswith("Compte supprimé ")
        assert user.farm_profile.latitude is None
        assert user.farm_profile.longitude is None
        assert user.farm_profile.location_address == ""
        user.farm_profile.production_plan.refresh_from_db()
        assert user.farm_profile.production_plan.annual_production_target_kg is None
        assert user.farm_profile.production_plan.setup_infrastructure_type == ""
        assert user.farm_profile.production_plan.setup_unit_count is None
        assert user.farm_profile.production_plan.setup_species == ""
        assert user.farm_profile.production_plan.fingerlings_cost_per_unit_fcfa is None
        assert user.farm_profile.production_plan.planned_selling_price_per_kg_fcfa is None
        assert user.farm_profile.production_plan.setup_completed is False
        assert PushToken.objects.filter(user=user).count() == 0
        outstanding_tokens = OutstandingToken.objects.filter(user=user)
        assert outstanding_tokens.count() == 1
        assert BlacklistedToken.objects.filter(token__in=outstanding_tokens).count() == 1

    def test_anonymize_user_account_keeps_operation_idempotent_on_personal_fields(
        self,
        monkeypatch,
        user_factory,
    ) -> None:
        user = user_factory(password="motdepasse_test123")

        monkeypatch.setattr(
            AccountDeletionService,
            "_generate_anonymized_phone",
            staticmethod(lambda _user_id: "+237623456789"),
        )

        AccountDeletionService.anonymize_user_account(user)
        user.refresh_from_db()

        assert user.account_type == "individual"
        assert user.business_name == ""
        assert user.promoter_name == ""
        assert user.age_group == "26_35"

    def test_anonymize_user_account_can_be_retried_without_changing_identity(
        self,
        user_factory,
    ) -> None:
        user = user_factory(password="motdepasse_test123")

        first_result = AccountDeletionService.anonymize_user_account(user)
        user.refresh_from_db()
        user.farm_profile.refresh_from_db()
        first_farm_name = user.farm_profile.farm_name

        second_result = AccountDeletionService.anonymize_user_account(user)
        user.refresh_from_db()
        user.farm_profile.refresh_from_db()

        assert second_result.anonymized_phone == first_result.anonymized_phone
        assert user.phone_number == first_result.anonymized_phone
        assert user.farm_profile.farm_name == first_farm_name
