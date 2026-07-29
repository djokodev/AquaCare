"""Replace the ongoing baseline check with explicit NULL guards."""

from decimal import Decimal

from django.db import migrations, models
from django.db.models import F, Q


class Migration(migrations.Migration):
    dependencies = [
        ('aquaculture', '0049_validate_onboarding_checks'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveConstraint(
                    model_name='productioncycle',
                    name='aq_ongoing_cycle_baseline_ck',
                ),
                migrations.AddConstraint(
                    model_name='productioncycle',
                    constraint=models.CheckConstraint(
                        condition=(
                            ~Q(onboarding_mode='ongoing')
                            | Q(
                                tracking_start_date__isnull=False,
                                tracking_start_date__gte=F('start_date'),
                                tracking_start_count__isnull=False,
                                tracking_start_count__gt=0,
                                tracking_start_count__lte=F('initial_count'),
                                tracking_start_average_weight__isnull=False,
                                tracking_start_average_weight__gt=Decimal('0'),
                                tracking_start_biomass__isnull=False,
                                tracking_start_biomass__gt=Decimal('0'),
                                tracking_start_biomass_source__isnull=False,
                            )
                        ),
                        name='aq_ongoing_cycle_baseline_ck',
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        SET LOCAL lock_timeout = '2s';
                        ALTER TABLE aquaculture_productioncycle
                            DROP CONSTRAINT IF EXISTS aq_ongoing_cycle_baseline_ck;
                        ALTER TABLE aquaculture_productioncycle
                            ADD CONSTRAINT aq_ongoing_cycle_baseline_ck
                            CHECK (
                                onboarding_mode <> 'ongoing'
                                OR (
                                    tracking_start_date IS NOT NULL
                                    AND tracking_start_date >= start_date
                                    AND tracking_start_count IS NOT NULL
                                    AND tracking_start_count > 0
                                    AND tracking_start_count <= initial_count
                                    AND tracking_start_average_weight IS NOT NULL
                                    AND tracking_start_average_weight > 0
                                    AND tracking_start_biomass IS NOT NULL
                                    AND tracking_start_biomass > 0
                                    AND tracking_start_biomass_source IS NOT NULL
                                )
                            ) NOT VALID;
                    """,
                    reverse_sql="""
                        SET LOCAL lock_timeout = '2s';
                        ALTER TABLE aquaculture_productioncycle
                            DROP CONSTRAINT IF EXISTS aq_ongoing_cycle_baseline_ck;
                        ALTER TABLE aquaculture_productioncycle
                            ADD CONSTRAINT aq_ongoing_cycle_baseline_ck
                            CHECK (
                                onboarding_mode <> 'ongoing'
                                OR (
                                    tracking_start_date >= start_date
                                    AND tracking_start_count > 0
                                    AND tracking_start_count <= initial_count
                                    AND tracking_start_average_weight > 0
                                    AND tracking_start_biomass > 0
                                )
                            ) NOT VALID;
                    """,
                ),
            ],
        ),
    ]
