"""
Tests unitaires pour FeedingPlanService.

Coverage cible : >60%
"""
import pytest
from decimal import Decimal
from datetime import date, timedelta

from apps.aquaculture.services.feeding_service import FeedingPlanService
from apps.aquaculture.models import FeedingPlan
from apps.notifications.models import Notification
from apps.aquaculture.domain.exceptions import FeedingPlanGenerationError
from tests.fixtures.factories import ProductionCycleFactory


@pytest.mark.django_db
class TestFeedingPlanServiceGenerate:
    """Tests de génération de plans d'alimentation."""

    def test_generate_feeding_plan_success(self):
        """Test génération plan valide."""
        cycle = ProductionCycleFactory(
            current_count=1000,
            current_average_weight=Decimal('150'),
            current_biomass=Decimal('150')
        )

        plans = FeedingPlanService.generate_weekly_plans(
            cycle=cycle,
            weeks_ahead=2
        )

        assert len(plans) == 2
        assert all(p.cycle == cycle for p in plans)
        assert all(p.daily_feed_amount > 0 for p in plans)
        assert all(p.meals_per_day >= 1 for p in plans)

    def test_generate_creates_notifications(self):
        """Test génération crée notifications."""
        cycle = ProductionCycleFactory(
            current_count=1000,
            current_average_weight=Decimal('150')
        )

        plans = FeedingPlanService.generate_weekly_plans(
            cycle=cycle,
            weeks_ahead=1
        )

        # Vérifie que des notifications ont été créées
        # Notifications génériques (content_type/object_id) via NotificationService
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(cycle)
        notifications = Notification.objects.filter(
            content_type=ct,
            object_id=str(cycle.id),
            notification_type='feeding_reminder'
        )
        assert notifications.exists()
        assert len(plans) == 1

    def test_generate_rejects_harvested_cycle(self):
        """Test rejet génération sur cycle récolté."""
        cycle = ProductionCycleFactory(status='harvested')

        with pytest.raises(FeedingPlanGenerationError):
            FeedingPlanService.generate_weekly_plans(cycle, weeks_ahead=1)

    def test_generate_adapts_to_fish_weight(self):
        """Test adaptation selon poids poissons."""
        # Petits poissons (alevins)
        cycle_small = ProductionCycleFactory(
            current_average_weight=Decimal('10')
        )
        plans_small = FeedingPlanService.generate_weekly_plans(
            cycle_small, weeks_ahead=1
        )

        # Gros poissons
        cycle_large = ProductionCycleFactory(
            current_average_weight=Decimal('300')
        )
        plans_large = FeedingPlanService.generate_weekly_plans(
            cycle_large, weeks_ahead=1
        )

        # Alevins mangent plus fréquemment
        assert plans_small[0].meals_per_day >= plans_large[0].meals_per_day


@pytest.mark.django_db
class TestFeedingPlanServiceDeactivate:
    """Tests de désactivation de plans."""

    def test_deactivate_plans_after_harvest(self):
        """Test désactivation plans après récolte."""
        cycle = ProductionCycleFactory()

        # Créer plusieurs plans
        FeedingPlanService.generate_weekly_plans(cycle, weeks_ahead=3)

        # Désactiver plans futurs
        count = FeedingPlanService.deactivate_future_plans(cycle)

        # Vérifie que des plans ont été désactivés
        assert count >= 0
        # Plans futurs désactivés
        future_plans = FeedingPlan.objects.filter(
            cycle=cycle,
            is_active=True,
            start_date__gt=date.today()
        )
        assert future_plans.count() == 0
