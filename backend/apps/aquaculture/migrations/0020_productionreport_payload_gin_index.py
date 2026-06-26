from django.contrib.postgres.indexes import GinIndex
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("aquaculture", "0019_feedingplan_performance_indexes"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="productionreport",
            index=GinIndex(fields=["payload"], name="rpt_payload_gin_idx"),
        ),
    ]
