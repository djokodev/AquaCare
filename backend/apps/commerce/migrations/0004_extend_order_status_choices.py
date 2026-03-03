from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('commerce', '0003_add_orderitem_order_index'),
    ]

    operations = [
        migrations.AlterField(
            model_name='order',
            name='status',
            field=models.CharField(
                choices=[
                    ('confirmed', 'Commandée'),
                    ('delivered', 'Livrée'),
                    ('received', 'Reçue'),
                ],
                default='confirmed',
                max_length=20,
                verbose_name='Statut',
                help_text='Statut de la commande',
            ),
        ),
    ]
