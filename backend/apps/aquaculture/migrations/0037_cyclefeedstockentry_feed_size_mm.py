from django.db import migrations, models
import django.core.validators
from decimal import Decimal


class Migration(migrations.Migration):

    dependencies = [
        ('aquaculture', '0036_alter_productioncycle_initial_count'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='cyclefeedstockentry',
                    name='feed_size_mm',
                    field=models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        help_text='Diamètre des granulés de cette entrée de stock',
                        max_digits=4,
                        null=True,
                        validators=[
                            django.core.validators.MinValueValidator(Decimal('0.1')),
                            django.core.validators.MaxValueValidator(Decimal('20.0')),
                        ],
                        verbose_name='Granulométrie (mm)',
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        SET LOCAL lock_timeout = '2s';
                        ALTER TABLE aquaculture_cycle_feed_stock_entry
                        ADD COLUMN feed_size_mm numeric(4, 2) NULL;
                    """,
                    reverse_sql="""
                        SET LOCAL lock_timeout = '2s';
                        ALTER TABLE aquaculture_cycle_feed_stock_entry
                        DROP COLUMN feed_size_mm;
                    """,
                ),
            ],
        ),
    ]
