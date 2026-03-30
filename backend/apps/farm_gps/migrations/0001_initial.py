from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0006_farmprofile_add_gps'),
    ]

    operations = [
        migrations.CreateModel(
            name='GeolocatedFarm',
            fields=[],
            options={
                'proxy': True,
                'app_label': 'farm_gps',
                'verbose_name': 'Ferme géolocalisée',
                'verbose_name_plural': 'Fermes géolocalisées',
                'indexes': [],
                'constraints': [],
            },
            bases=('accounts.farmprofile',),
        ),
    ]
