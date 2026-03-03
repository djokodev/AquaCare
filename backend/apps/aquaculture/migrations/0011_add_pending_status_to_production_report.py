"""Add 'pending' status to ProductionReport for async PDF generation."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("aquaculture", "0010_feedingplan_temperature_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="productionreport",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "En cours de génération"),
                    ("draft", "Brouillon"),
                    ("validated", "Validé"),
                ],
                default="draft",
                max_length=20,
                verbose_name="Statut",
            ),
        ),
    ]
