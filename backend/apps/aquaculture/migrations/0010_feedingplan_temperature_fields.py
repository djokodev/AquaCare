from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('aquaculture', '0009_nutritionalguide_dibaq_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='feedingplan',
            name='temperature_used_c',
            field=models.DecimalField(
                blank=True,
                decimal_places=1,
                max_digits=4,
                null=True,
                verbose_name='Température utilisée (°C)',
            ),
        ),
        migrations.AddField(
            model_name='feedingplan',
            name='used_default_temperature',
            field=models.BooleanField(
                default=False,
                help_text="True si aucune saisie journalière disponible au moment de la génération",
                verbose_name='Température de référence utilisée',
            ),
        ),
        migrations.AddField(
            model_name='feedingplan',
            name='data_source',
            field=models.CharField(
                blank=True,
                default='',
                max_length=50,
                verbose_name='Source des données de rationnement',
            ),
        ),
    ]
