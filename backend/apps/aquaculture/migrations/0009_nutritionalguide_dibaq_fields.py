from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('aquaculture', '0008_add_feed_size_mm_to_cyclelog'),
    ]

    operations = [
        # 1. Add source field (needed before changing unique_together)
        migrations.AddField(
            model_name='nutritionalguide',
            name='source',
            field=models.CharField(
                choices=[('DIBAQ', 'DIBAQ'), ('ALLER_AQUA', 'Aller Aqua'), ('MAVECAM', 'MAVECAM')],
                default='MAVECAM',
                max_length=50,
                verbose_name='Source des données',
            ),
        ),
        # 2. Add temperature_rates JSONField
        migrations.AddField(
            model_name='nutritionalguide',
            name='temperature_rates',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Dict {temp_c: taux_pct_biomasse} ex: {'26': 5.3, '28': 4.8}",
                verbose_name='Taux par température (%)',
            ),
        ),
        # 3. Add reference_temperature_c field
        migrations.AddField(
            model_name='nutritionalguide',
            name='reference_temperature_c',
            field=models.IntegerField(
                default=26,
                help_text='Température utilisée pour feeding_rate_percentage',
                verbose_name='Température de référence (°C)',
            ),
        ),
        # 4. Remove old unique_together constraint on (species, growth_stage)
        migrations.AlterUniqueTogether(
            name='nutritionalguide',
            unique_together=set(),
        ),
        # 5. Add new unique_together constraint on (species, min_weight, source)
        migrations.AlterUniqueTogether(
            name='nutritionalguide',
            unique_together={('species', 'min_weight', 'source')},
        ),
    ]
