from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('aquaculture', '0016_farm_production_plan'),
    ]

    operations = [
        migrations.AddField(
            model_name='sanitarylog',
            name='client_uuid',
            field=models.UUIDField(
                blank=True,
                help_text='UUID généré côté mobile pour déduplication',
                null=True,
                unique=True,
                verbose_name='UUID client',
            ),
        ),
        migrations.AddField(
            model_name='sanitarylog',
            name='synced_at',
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name='Synchronisé le',
            ),
        ),
        migrations.AddIndex(
            model_name='sanitarylog',
            index=models.Index(fields=['created_offline', 'synced_at'], name='aquaculture_san_sync_idx'),
        ),
    ]
