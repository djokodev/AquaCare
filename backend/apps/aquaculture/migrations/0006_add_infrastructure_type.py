from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('aquaculture', '0005_add_production_reports'),
    ]

    operations = [
        migrations.AddField(
            model_name='productioncycle',
            name='infrastructure_type',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Ex: ['etang', 'cage_flottante', 'bac_hors_sol']",
                verbose_name="Types d'infrastructure",
            ),
        ),
    ]
