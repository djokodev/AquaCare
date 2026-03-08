"""Tests des use cases applicatifs du module aquaculture."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

import pytest
from aquaculture.models import CycleLog, ProductionCycle
from aquaculture.services import (
    CycleLogApplicationService,
    DashboardApplicationService,
    FeedingCycleNotFoundError,
    FeedingPlanApplicationService,
    GenerateFeedingPlansCommand,
    InvalidDashboardCycleScopeError,
    SyncApplicationService,
)
from django.utils import timezone


@pytest.mark.django_db
class TestCycleLogApplicationService:
    def test_create_or_update_log_updates_existing_log(self, authenticated_user, production_cycle):
        existing_log = CycleLog.objects.create(
            cycle=production_cycle,
            log_date=date.today(),
            mortality_count=2,
        )

        result = CycleLogApplicationService.create_or_update_log(
            user=authenticated_user,
            validated_data={
                "cycle": production_cycle,
                "log_date": date.today(),
                "mortality_count": 5,
                "feed_quantity": Decimal("2.5"),
            },
        )

        existing_log.refresh_from_db()
        assert result.created is False
        assert result.log.id == existing_log.id
        assert existing_log.mortality_count == 5


@pytest.mark.django_db
class TestFeedingPlanApplicationService:
    def test_generate_feeding_plans_rejects_unknown_cycle(self, authenticated_user):
        with pytest.raises(FeedingCycleNotFoundError):
            FeedingPlanApplicationService.generate_feeding_plans(
                user=authenticated_user,
                command=GenerateFeedingPlansCommand(
                    cycle_id=str(uuid4()),
                    weeks_ahead=1,
                ),
            )


@pytest.mark.django_db
class TestDashboardApplicationService:
    def test_build_dashboard_payload_rejects_inactive_scope(self, farm_profile):
        harvested_cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name="Cycle Harvested",
            species="tilapia",
            pond_identifier="Bassin H",
            pond_surface_m2=Decimal("40.00"),
            pond_volume_m3=Decimal("50.00"),
            start_date=date.today() - timedelta(days=40),
            end_date=date.today() - timedelta(days=1),
            initial_count=800,
            initial_average_weight=Decimal("10.00"),
            initial_biomass=Decimal("8.00"),
            current_count=760,
            current_average_weight=Decimal("220.00"),
            current_biomass=Decimal("167.20"),
            status="harvested",
        )

        with pytest.raises(InvalidDashboardCycleScopeError):
            DashboardApplicationService.build_dashboard_payload(
                user=farm_profile.user,
                cycle_id=str(harvested_cycle.id),
            )


@pytest.mark.django_db
class TestSyncApplicationService:
    def test_execute_sync_normalizes_client_id_to_device_id(self, authenticated_user):
        with patch(
            "aquaculture.services.sync_application_service.SyncService.validate_sync_data",
            return_value=[],
        ), patch(
            "aquaculture.services.sync_application_service.SyncService.perform_full_sync",
            return_value={
                "status": "success",
                "timestamp": timezone.now(),
                "processed": {"cycles": 0, "cycle_logs": 0, "cycle_logs_updated": 0, "sanitary_logs": 0},
                "errors": [],
                "server_updates": {},
                "device_id": "device-123",
            },
        ) as mock_perform_sync:
            result = SyncApplicationService.execute_sync(
                user=authenticated_user,
                raw_payload={
                    "client_id": "device-123",
                    "last_sync": timezone.now().isoformat(),
                },
            )

        assert result.status_code == 200
        mock_perform_sync.assert_called_once()
        assert mock_perform_sync.call_args.kwargs["sync_data"]["device_id"] == "device-123"
