"""Tests des endpoints aquaculture de setup et simulation annuelle."""

from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError as DjangoValidationError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from aquaculture.services.farm_production_plan_service import FarmProductionPlanService


@pytest.mark.django_db
class TestProductionPlanSetupEndpoint:
    def setup_method(self):
        self.client = APIClient()
        self.url = reverse("aquaculture:production_plan_setup")
        self.user = User.objects.create_user(
            phone_number="+237691100001",
            first_name="Setup",
            last_name="Aquaculture",
            password="test123",
            age_group="26_35",
        )
        self.client.force_authenticate(user=self.user)

    def test_setup_etang_success(self):
        data = {
            "setup_species": "tilapia",
            "setup_infrastructure_type": "etang",
            "setup_unit_count": 3,
            "setup_unit_surface_m2": "200.00",
            "annual_production_target_kg": "600.00",
            "num_cycles_per_year": 2,
        }

        response = self.client.post(self.url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["farm_setup_completed"] is True
        self.user.farm_profile.refresh_from_db()
        self.user.farm_profile.production_plan.refresh_from_db()
        assert self.user.farm_profile.production_plan.setup_completed is True

    def test_setup_partial_without_required_fields_fails(self):
        response = self.client.patch(
            self.url,
            {"planned_selling_price_per_kg_fcfa": "1800.00"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_setup_requires_auth(self):
        unauthenticated = APIClient()

        response = unauthenticated.post(
            self.url,
            {"setup_species": "tilapia", "setup_infrastructure_type": "etang"},
            format="json",
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_setup_service_validation_returns_400(self, monkeypatch):
        def raise_validation(*args, **kwargs):
            raise DjangoValidationError(
                {"setup_unit_surface_m2": ["La surface courante est invalide."]}
            )

        monkeypatch.setattr(
            FarmProductionPlanService,
            "complete_setup",
            raise_validation,
        )

        response = self.client.post(
            self.url,
            {
                "setup_species": "tilapia",
                "setup_infrastructure_type": "etang",
                "setup_unit_count": 3,
                "setup_unit_surface_m2": "200.00",
                "annual_production_target_kg": "600.00",
                "num_cycles_per_year": 2,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "setup_unit_surface_m2" in response.data


@pytest.mark.django_db
class TestProductionPlanSimulationEndpoint:
    def setup_method(self):
        self.client = APIClient()
        self.url = reverse("aquaculture:production_plan_simulation")
        self.user = User.objects.create_user(
            phone_number="+237691100002",
            first_name="Simulation",
            last_name="Aquaculture",
            password="test123",
            age_group="26_35",
        )
        self.client.force_authenticate(user=self.user)

    def test_simulate_tilapia_2_cycles(self):
        response = self.client.post(
            self.url,
            {
                "species": "tilapia",
                "annual_production_target_kg": "1000",
                "num_cycles": 2,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["annual_production_target_kg"] == 1000
        assert response.data["aquacare_fee_fcfa"] == 20_000
        assert "cycles_breakdown" in response.data

    def test_simulate_missing_required_fields_fails(self):
        response = self.client.post(
            self.url,
            {
                "annual_production_target_kg": "1000",
                "num_cycles": 2,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_simulate_requires_auth(self):
        unauthenticated = APIClient()

        response = unauthenticated.post(
            self.url,
            {
                "species": "tilapia",
                "annual_production_target_kg": "1000",
                "num_cycles": 2,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_legacy_accounts_setup_endpoint_still_available():
    """L'ancien endpoint reste disponible pendant la migration mobile."""
    client = APIClient()
    user = User.objects.create_user(
        phone_number="+237691100003",
        first_name="Legacy",
        last_name="Setup",
        password="test123",
        age_group="26_35",
    )
    client.force_authenticate(user=user)

    response = client.post(
        reverse("accounts:farm_setup"),
        {
            "setup_species": "tilapia",
            "setup_infrastructure_type": "etang",
            "setup_unit_count": 1,
            "setup_unit_surface_m2": "100.00",
            "annual_production_target_kg": "250.00",
            "num_cycles_per_year": 2,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
def test_legacy_accounts_simulation_endpoint_still_available():
    """L'ancien endpoint simulation reste disponible pendant la migration mobile."""
    client = APIClient()
    user = User.objects.create_user(
        phone_number="+237691100004",
        first_name="Legacy",
        last_name="Simulation",
        password="test123",
        age_group="26_35",
    )
    client.force_authenticate(user=user)

    response = client.post(
        reverse("accounts:annual_simulation"),
        {
            "species": "tilapia",
            "annual_production_target_kg": "1000",
            "num_cycles": 2,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
