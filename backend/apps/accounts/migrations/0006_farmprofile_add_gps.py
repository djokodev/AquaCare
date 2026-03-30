from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_alter_user_options_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='farmprofile',
            name='latitude',
            field=models.DecimalField(
                blank=True,
                decimal_places=7,
                help_text='Coordonnée GPS latitude de la ferme (WGS84)',
                max_digits=10,
                null=True,
                verbose_name='Latitude GPS',
            ),
        ),
        migrations.AddField(
            model_name='farmprofile',
            name='longitude',
            field=models.DecimalField(
                blank=True,
                decimal_places=7,
                help_text='Coordonnée GPS longitude de la ferme (WGS84)',
                max_digits=10,
                null=True,
                verbose_name='Longitude GPS',
            ),
        ),
        migrations.AddField(
            model_name='farmprofile',
            name='location_address',
            field=models.CharField(
                blank=True,
                help_text='Adresse lisible issue du reverse geocoding (ex: Mbalmayo, Centre)',
                max_length=300,
                verbose_name='Adresse GPS',
            ),
        ),
    ]
