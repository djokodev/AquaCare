from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('aquaculture', '0017_sanitarylog_sync_metadata'),
    ]

    operations = [
        migrations.AddField(
            model_name='productioncycle',
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
            model_name='productioncycle',
            name='created_offline',
            field=models.BooleanField(
                default=False,
                verbose_name='Créé hors ligne',
            ),
        ),
        migrations.AddField(
            model_name='productioncycle',
            name='synced_at',
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name='Synchronisé le',
            ),
        ),
        migrations.AddIndex(
            model_name='productioncycle',
            index=models.Index(fields=['created_offline', 'synced_at'], name='aquaculture_created_7d7f63_idx'),
        ),
    ]
