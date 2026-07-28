from __future__ import annotations

from accounts.domain.account_invariants import build_user_account_invariant_errors
from accounts.domain.farm_setup_rules import FarmSetupRules
from accounts.domain.login_identifier import LoginIdentifier


class TestAccountDomainRules:
    def test_company_requires_company_fields_and_rejects_age_group(self) -> None:
        errors = build_user_account_invariant_errors({
            "account_type": "company",
            "business_name": "   ",
            "legal_status": "",
            "promoter_name": None,
            "age_group": "26_35",
        })

        assert "business_name" in errors
        assert "legal_status" in errors
        assert "promoter_name" in errors
        assert "age_group" in errors

    def test_individual_requires_person_fields_and_rejects_company_fields(self) -> None:
        errors = build_user_account_invariant_errors({
            "account_type": "individual",
            "first_name": " ",
            "last_name": "",
            "age_group": None,
            "business_name": "Aqua SARL",
        })

        assert "first_name" in errors
        assert "last_name" in errors
        assert "age_group" in errors
        assert "business_name" in errors

    def test_farm_setup_etang_requires_surface(self) -> None:
        errors = FarmSetupRules.build_errors({
            "setup_species": "tilapia",
            "setup_infrastructure_type": "etang",
            "setup_unit_count": 2,
            "annual_production_target_kg": 500,
            "num_cycles_per_year": 2,
        })

        assert "setup_unit_surface_m2" in errors
        assert "setup_unit_volume_m3" not in errors

    def test_farm_setup_bac_requires_volume(self) -> None:
        errors = FarmSetupRules.build_errors({
            "setup_species": "clarias",
            "setup_infrastructure_type": "bac_en_sol",
            "setup_unit_count": 2,
            "annual_production_target_kg": 500,
            "num_cycles_per_year": 2,
        })

        assert "setup_unit_volume_m3" in errors
        assert "setup_unit_surface_m2" not in errors

    def test_login_identifier_trims_empty_values(self) -> None:
        identifier = LoginIdentifier.from_credentials(
            login_name="  Jean Farmer  ",
            phone_number="   ",
        )

        assert identifier.login_name == "Jean Farmer"
        assert identifier.phone_number is None
        assert identifier.has_value is True
