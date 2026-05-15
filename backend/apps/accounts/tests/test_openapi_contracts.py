"""Tests de contrat OpenAPI pour le module accounts."""

from __future__ import annotations

import pytest
from drf_spectacular.generators import SchemaGenerator

pytestmark = pytest.mark.django_db


@pytest.fixture
def openapi_schema():
    """Genere le schema OpenAPI Django une seule fois pour les assertions accounts."""
    return SchemaGenerator().get_schema(request=None, public=True)


def _json_response_schema(operation: dict[str, object], status_code: int) -> dict[str, object]:
    responses = operation["responses"]
    response = responses[str(status_code)]
    content = response.get("content", {})
    return content.get("application/json", {}).get("schema", {})


def _schema_ref(operation: dict[str, object], status_code: int) -> str:
    return _json_response_schema(operation, status_code).get("$ref", "")


class TestAccountsOpenAPIContracts:
    def test_register_documents_auth_success_response(self, openapi_schema):
        operation = openapi_schema["paths"]["/api/accounts/register/"]["post"]

        assert _schema_ref(operation, 201).endswith("/AuthSuccessResponse")
        assert "400" in operation["responses"]
        assert "429" in operation["responses"]

    def test_farm_setup_documents_full_farm_profile_response(self, openapi_schema):
        path = openapi_schema["paths"]["/api/accounts/farm/setup/"]

        assert _schema_ref(path["post"], 200).endswith("/FarmProfile")
        assert _schema_ref(path["patch"], 200).endswith("/FarmProfile")
        assert "400" in path["post"]["responses"]
        assert "401" in path["post"]["responses"]
        assert "429" in path["post"]["responses"]

    def test_annual_simulation_documents_exact_response_shape(self, openapi_schema):
        operation = openapi_schema["paths"]["/api/accounts/farm/simulate/"]["post"]

        assert _schema_ref(operation, 200).endswith("/AnnualSimulationResponse")
        properties = openapi_schema["components"]["schemas"]["AnnualSimulationResponse"]["properties"]
        assert "annual_revenue_fcfa" in properties
        assert "aquacare_fee_fcfa" in properties
        assert "cycles_breakdown" in properties
        assert "400" in operation["responses"]
        assert "401" in operation["responses"]
        assert "429" in operation["responses"]

    def test_token_endpoints_document_invalid_token_responses(self, openapi_schema):
        refresh = openapi_schema["paths"]["/api/accounts/token/refresh/"]["post"]
        verify = openapi_schema["paths"]["/api/accounts/token/verify/"]["post"]

        assert "401" in refresh["responses"]
        assert "401" in verify["responses"]
        assert "429" in refresh["responses"]
        assert "429" in verify["responses"]


class TestAquacultureOpenAPIContracts:
    def test_production_plan_setup_documents_full_farm_profile_response(self, openapi_schema):
        path = openapi_schema["paths"]["/api/aquaculture/production-plan/setup/"]

        assert _schema_ref(path["post"], 200).endswith("/FarmProfile")
        assert _schema_ref(path["patch"], 200).endswith("/FarmProfile")
        assert "400" in path["post"]["responses"]
        assert "401" in path["post"]["responses"]
        assert "429" in path["post"]["responses"]

    def test_production_plan_simulation_documents_exact_response_shape(self, openapi_schema):
        operation = openapi_schema["paths"][
            "/api/aquaculture/production-plan/simulate/"
        ]["post"]

        assert _schema_ref(operation, 200).endswith("/AnnualSimulationResponse")
        properties = openapi_schema["components"]["schemas"]["AnnualSimulationResponse"]["properties"]
        assert "annual_revenue_fcfa" in properties
        assert "aquacare_fee_fcfa" in properties
        assert "cycles_breakdown" in properties
        assert "400" in operation["responses"]
        assert "401" in operation["responses"]
        assert "429" in operation["responses"]
