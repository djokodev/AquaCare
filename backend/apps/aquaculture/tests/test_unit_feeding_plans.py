from datetime import date, timedelta
from decimal import Decimal

import pytest
from aquaculture.models import CycleLog, CycleUnitAllocation, FeedingPlan, NutritionalGuide, ProductionUnit
from aquaculture.services.feeding_service import FeedingPlanService
from django.contrib.contenttypes.models import ContentType
from notifications.models import Notification

from tests.fixtures.factories import ProductionCycleFactory


def create_allocation(cycle, name: str, current_fish_count: int, current_biomass_kg: Decimal):
    unit = ProductionUnit.objects.create(
        farm_profile=cycle.farm_profile,
        name=name,
        unit_type='tank',
        volume_m3=Decimal('3.00'),
    )
    return CycleUnitAllocation.objects.create(
        cycle=cycle,
        production_unit=unit,
        initial_fish_count=current_fish_count,
        current_fish_count=current_fish_count,
        initial_biomass_kg=current_biomass_kg,
        current_biomass_kg=current_biomass_kg,
    )


def create_guide(
    *,
    min_weight: Decimal = Decimal('10.00'),
    max_weight: Decimal = Decimal('50.00'),
    feeding_rate_percentage: Decimal = Decimal('5.30'),
    meals_per_day: int = 3,
    temperature_rates: dict[str, float] | None = None,
):
    return NutritionalGuide.objects.create(
        species='tilapia',
        growth_stage='alevin',
        min_weight=min_weight,
        max_weight=max_weight,
        feeding_rate_percentage=feeding_rate_percentage,
        protein_requirement=45,
        meals_per_day=meals_per_day,
        feed_size_mm=Decimal('2.0'),
        recommended_products=['DIBAQ Tilapia 2mm'],
        expected_fcr=Decimal('1.05'),
        source='DIBAQ',
        temperature_rates=temperature_rates or {'26': 5.3, '28': 5.5},
        reference_temperature_c=26,
    )


@pytest.mark.django_db
class TestUnitFeedingPlans:
    def test_generate_plans_are_scoped_to_each_allocation(self):
        create_guide()
        cycle = ProductionCycleFactory(
            species='tilapia',
            current_count=1000,
            current_average_weight=Decimal('25.00'),
            current_biomass=Decimal('25.00'),
        )
        allocation_a = create_allocation(cycle, 'Bac 1', current_fish_count=500, current_biomass_kg=Decimal('10.00'))
        allocation_b = create_allocation(cycle, 'Bac 2', current_fish_count=500, current_biomass_kg=Decimal('20.00'))

        CycleLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=allocation_a,
            log_date=date.today(),
            average_weight=Decimal('18.00'),
            water_temperature=Decimal('28.0'),
        )
        CycleLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=allocation_b,
            log_date=date.today(),
            average_weight=Decimal('35.00'),
            water_temperature=Decimal('23.0'),
        )

        plan_a = FeedingPlanService.generate_plan_for_allocation_week(allocation_a, week_number=1)
        plan_b = FeedingPlanService.generate_plan_for_allocation_week(allocation_b, week_number=1)

        assert plan_a.cycle_unit_allocation_id == allocation_a.id
        assert plan_b.cycle_unit_allocation_id == allocation_b.id
        assert plan_a.id != plan_b.id
        assert plan_a.average_weight == Decimal('18.00')
        assert plan_b.average_weight == Decimal('35.00')
        assert plan_a.temperature_used_c == Decimal('28.0')
        assert plan_b.temperature_used_c == Decimal('23.0')
        assert plan_a.used_default_temperature is False
        assert plan_b.used_default_temperature is False
        assert FeedingPlan.objects.filter(cycle=cycle, week_number=1).count() == 2

    def test_generate_plan_uses_default_temperature_when_unit_has_no_log(self):
        create_guide()
        cycle = ProductionCycleFactory(
            species='tilapia',
            current_count=1000,
            current_average_weight=Decimal('25.00'),
            current_biomass=Decimal('25.00'),
        )
        allocation = create_allocation(cycle, 'Bac 1', current_fish_count=500, current_biomass_kg=Decimal('10.00'))

        plan = FeedingPlanService.generate_plan_for_allocation_week(allocation, week_number=1)

        assert plan.temperature_used_c == Decimal('26.0')
        assert plan.used_default_temperature is True

    def test_generate_plan_recomputes_biomass_when_allocation_value_is_zero(self):
        create_guide(
            min_weight=Decimal('1.00'),
            max_weight=Decimal('10.00'),
            feeding_rate_percentage=Decimal('8.00'),
            meals_per_day=4,
            temperature_rates={'26': 8.0},
        )
        cycle = ProductionCycleFactory(
            species='tilapia',
            current_count=900,
            current_average_weight=Decimal('5.00'),
            current_biomass=Decimal('0.00'),
        )
        allocation = create_allocation(cycle, 'Bac 1', current_fish_count=900, current_biomass_kg=Decimal('0.00'))
        CycleLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=allocation,
            log_date=date.today(),
            average_weight=Decimal('5.00'),
            water_temperature=Decimal('26.0'),
        )

        other_unit = ProductionUnit.objects.create(
            farm_profile=cycle.farm_profile,
            name='Bac 2',
            unit_type='tank',
            volume_m3=Decimal('3.00'),
        )
        other_allocation = CycleUnitAllocation.objects.create(
            cycle=cycle,
            production_unit=other_unit,
            initial_fish_count=500,
            current_fish_count=500,
            initial_biomass_kg=Decimal('10.00'),
            current_biomass_kg=Decimal('10.00'),
        )
        CycleLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=other_allocation,
            log_date=date.today(),
            average_weight=Decimal('25.00'),
            water_temperature=Decimal('28.0'),
        )

        plan = FeedingPlanService.generate_plan_for_allocation_week(allocation, week_number=1)

        assert plan.average_weight == Decimal('5.00')
        assert plan.biomass == Decimal('4.50')
        assert plan.daily_feed_amount > 0
        assert plan.feed_per_meal > 0

    def test_generate_plan_is_idempotent_per_allocation_and_week(self):
        create_guide()
        cycle = ProductionCycleFactory(
            species='tilapia',
            current_count=1000,
            current_average_weight=Decimal('25.00'),
            current_biomass=Decimal('25.00'),
        )
        allocation = create_allocation(cycle, 'Bac 1', current_fish_count=500, current_biomass_kg=Decimal('10.00'))

        plan_1 = FeedingPlanService.generate_plan_for_allocation_week(allocation, week_number=1)
        plan_2 = FeedingPlanService.generate_plan_for_allocation_week(allocation, week_number=1)

        assert plan_1.id == plan_2.id
        assert FeedingPlan.objects.filter(cycle=cycle, cycle_unit_allocation=allocation, week_number=1).count() == 1

    def test_generate_current_week_deactivates_future_plans_for_allocation(self):
        create_guide()
        cycle = ProductionCycleFactory(
            species='tilapia',
            current_count=1000,
            current_average_weight=Decimal('25.00'),
            current_biomass=Decimal('25.00'),
        )
        allocation = create_allocation(cycle, 'Bac 1', current_fish_count=500, current_biomass_kg=Decimal('10.00'))

        current_plan = FeedingPlanService.generate_plan_for_allocation_week(allocation, week_number=1)
        future_plan = FeedingPlan.objects.create(
            cycle=cycle,
            cycle_unit_allocation=allocation,
            week_number=2,
            estimated_fish_count=900,
            average_weight=Decimal('20.00'),
            biomass=Decimal('18.00'),
            daily_feed_amount=Decimal('1.20'),
            feeding_rate=Decimal('4.50'),
            meals_per_day=2,
            feed_per_meal=Decimal('0.60'),
            recommended_feed_type='Future Feed',
            feed_size_mm=Decimal('2.0'),
            protein_percentage=40,
            start_date=current_plan.end_date + timedelta(days=1),
            end_date=current_plan.end_date + timedelta(days=7),
            temperature_used_c=Decimal('26.0'),
            used_default_temperature=True,
            data_source='fallback_interne',
            is_active=True,
        )

        plans = FeedingPlanService.generate_weekly_plans_for_allocation(allocation, weeks_ahead=1)

        future_plan.refresh_from_db()

        assert len(plans) == 1
        assert plans[0].week_number == 1
        assert future_plan.is_active is False

    def test_notifications_include_unit_metadata(self):
        create_guide()
        cycle = ProductionCycleFactory(
            species='tilapia',
            current_count=1000,
            current_average_weight=Decimal('25.00'),
            current_biomass=Decimal('25.00'),
        )
        allocation = create_allocation(cycle, 'Bac 1', current_fish_count=500, current_biomass_kg=Decimal('10.00'))

        plan = FeedingPlanService.generate_plan_for_allocation_week(allocation, week_number=1)

        content_type = ContentType.objects.get_for_model(allocation)
        notification = Notification.objects.filter(
            content_type=content_type,
            object_id=str(allocation.id),
            notification_type='feeding_reminder',
        ).first()

        assert notification is not None
        assert notification.metadata['cycle_id'] == str(cycle.id)
        assert notification.metadata['cycle_unit_allocation_id'] == str(allocation.id)
        assert notification.metadata['production_unit_name'] == 'Bac 1'
        assert notification.metadata['plan_id'] == str(plan.id)
        assert notification.metadata['minutes_before'] in {15, 30}
