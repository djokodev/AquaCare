from decimal import Decimal

from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('aquaculture', '0007_add_economic_fields_to_production_cycle'),
    ]

    operations = [
        migrations.AddField(
            model_name='cyclelog',
            name='feed_size_mm',
            field=models.DecimalField(
                blank=True,
                decimal_places=1,
                help_text='Diamètre des granulés distribués',
                max_digits=3,
                null=True,
                validators=[
                    django.core.validators.MinValueValidator(Decimal('0.1')),
                    django.core.validators.MaxValueValidator(Decimal('20.0')),
                ],
                verbose_name="Taille d'aliment (mm)",
            ),
        ),
    ]
