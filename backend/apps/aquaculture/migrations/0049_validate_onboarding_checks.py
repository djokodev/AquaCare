from django.db import migrations


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('aquaculture', '0048_add_onboarding_checks_not_valid'),
    ]

    operations = [
        migrations.RunSQL(
            sql="SET lock_timeout = '2s';",
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql=(
                'ALTER TABLE aquaculture_productioncycle '
                'VALIDATE CONSTRAINT aq_ongoing_cycle_baseline_ck;'
            ),
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql=(
                'ALTER TABLE aquaculture_cycle_feed_stock_entry '
                'VALIDATE CONSTRAINT aq_feed_stock_cost_status_ck;'
            ),
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql='RESET lock_timeout;',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
