from django.db import migrations, models
from django.db.models import F, Q


class Migration(migrations.Migration):
    dependencies = [
        ('aquaculture', '0047_cycle_onboarding_and_opening_stock'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddConstraint(
                    model_name='productioncycle',
                    constraint=models.CheckConstraint(
                        condition=(
                            ~Q(onboarding_mode='ongoing')
                            | Q(
                                tracking_start_date__gte=F('start_date'),
                                tracking_start_count__gt=0,
                                tracking_start_count__lte=F('initial_count'),
                                tracking_start_average_weight__gt=0,
                                tracking_start_biomass__gt=0,
                            )
                        ),
                        name='aq_ongoing_cycle_baseline_ck',
                    ),
                ),
                migrations.AddConstraint(
                    model_name='cyclefeedstockentry',
                    constraint=models.CheckConstraint(
                        condition=(
                            Q(
                                cost_status='known',
                                total_cost_fcfa__isnull=False,
                                total_cost_fcfa__gte=0,
                            )
                            | Q(
                                cost_status='unknown',
                                total_cost_fcfa__isnull=True,
                            )
                        ),
                        name='aq_feed_stock_cost_status_ck',
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        SET LOCAL lock_timeout = '2s';
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
                        ALTER TABLE aquaculture_cycle_feed_stock_entry
                            ADD CONSTRAINT aq_feed_stock_cost_status_ck
                            CHECK (
                                (
                                    cost_status = 'known'
                                    AND total_cost_fcfa IS NOT NULL
                                    AND total_cost_fcfa >= 0
                                )
                                OR (
                                    cost_status = 'unknown'
                                    AND total_cost_fcfa IS NULL
                                )
                            ) NOT VALID;
                    """,
                    reverse_sql="""
                        SET LOCAL lock_timeout = '2s';
                        ALTER TABLE aquaculture_productioncycle
                            DROP CONSTRAINT aq_ongoing_cycle_baseline_ck;
                        ALTER TABLE aquaculture_cycle_feed_stock_entry
                            DROP CONSTRAINT aq_feed_stock_cost_status_ck;
                    """,
                ),
            ],
        ),
    ]
