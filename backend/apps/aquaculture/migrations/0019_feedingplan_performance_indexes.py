from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('aquaculture', '0018_productioncycle_sync_metadata'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='feedingplan',
            index=models.Index(
                fields=['cycle', 'is_active', 'start_date', 'end_date'],
                name='aq_feed_cycle_active_dates_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='feedingplan',
            index=models.Index(
                fields=['cycle', 'created_at'],
                name='aq_feed_cycle_created_idx',
            ),
        ),
    ]
