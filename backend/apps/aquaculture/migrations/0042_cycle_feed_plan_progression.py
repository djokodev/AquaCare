from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('aquaculture', '0041_repair_legacy_feed_classifications'),
    ]

    operations = [
        migrations.AddField(
            model_name='cyclefeedplan',
            name='highest_reached_phase_sequence',
            field=models.PositiveSmallIntegerField(db_default=0, default=0, verbose_name='Dernière phase atteinte'),
        ),
    ]
