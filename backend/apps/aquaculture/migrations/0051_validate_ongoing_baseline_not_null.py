"""Validate the corrected ongoing baseline constraint without blocking writes."""

from django.db import migrations


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('aquaculture', '0050_fix_ongoing_baseline_not_null'),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                'ALTER TABLE aquaculture_productioncycle '
                'VALIDATE CONSTRAINT aq_ongoing_cycle_baseline_ck;'
            ),
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
