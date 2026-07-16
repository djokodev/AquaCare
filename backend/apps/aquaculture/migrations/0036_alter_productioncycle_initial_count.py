from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('aquaculture', '0035_final_harvest_operation'),
    ]

    operations = [
        migrations.AlterField(
            model_name='productioncycle',
            name='initial_count',
            field=models.PositiveIntegerField(
                validators=[MinValueValidator(1), MaxValueValidator(1_000_000)],
                verbose_name='Nombre initial de poissons',
            ),
        ),
    ]
