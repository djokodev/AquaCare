"""Tests des adapters HTTP accounts pour les validations issues des services."""

from __future__ import annotations

import pytest
from accounts.models import User
from accounts.services.farm_setup_service import FarmSetupService
from accounts.services.profile_mutation_service import AccountProfileMutationService
from django.core.exceptions import ValidationError as DjangoValidationError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient


@pytest.fixture
def authenticated_client():
    client = APIClient()
    user = User.objects.create_user(
        phone_number="+237691100101",
        first_name="Adapter",
        last_name="Validation",
        password="test123",
        age_group="26_35",
    )
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_profile_service_validation_returns_400(authenticated_client, monkeypatch):
    def raise_validation(*args, **kwargs):
        raise DjangoValidationError({"first_name": ["Prenom invalide."]})

    monkeypatch.setattr(
        AccountProfileMutationService,
        "update_user_profile",
        raise_validation,
    )

    response = authenticated_client.patch(
        reverse("accounts:profile"),
        {"first_name": "Adapter"},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "first_name" in response.data


@pytest.mark.django_db
def test_farm_profile_service_validation_returns_400(authenticated_client, monkeypatch):
    def raise_validation(*args, **kwargs):
        raise DjangoValidationError({"farm_name": ["Ferme invalide."]})

    monkeypatch.setattr(
        AccountProfileMutationService,
        "update_farm_profile",
        raise_validation,
    )

    response = authenticated_client.patch(
        reverse("accounts:farm_profile"),
        {"farm_name": "Ferme Adapter"},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "farm_name" in response.data


@pytest.mark.django_db
def test_legacy_farm_setup_service_validation_returns_400(authenticated_client, monkeypatch):
    def raise_validation(*args, **kwargs):
        raise DjangoValidationError(
            {"setup_unit_surface_m2": ["La surface courante est invalide."]}
        )

    monkeypatch.setattr(
        FarmSetupService,
        "complete_setup",
        raise_validation,
    )

    response = authenticated_client.post(
        reverse("accounts:farm_setup"),
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
