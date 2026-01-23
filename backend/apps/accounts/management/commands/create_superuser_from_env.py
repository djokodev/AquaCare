"""
Management command pour créer un superuser à partir des variables d'environnement.

Utilisé au démarrage de l'application via entrypoint.sh.
Idempotent : ne crée pas de doublon si l'utilisateur existe déjà.

Variables d'environnement requises:
    DJANGO_SUPERUSER_PHONE: Numéro de téléphone du superuser (ex: +237652000000)
    DJANGO_SUPERUSER_PASSWORD: Mot de passe du superuser
    DJANGO_SUPERUSER_FIRST_NAME: Prénom (optionnel, défaut: Admin)
    DJANGO_SUPERUSER_LAST_NAME: Nom (optionnel, défaut: MAVECAM)

Usage:
    python manage.py create_superuser_from_env
"""

import os
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Crée un superuser à partir des variables d\'environnement (idempotent)'

    def handle(self, *args, **options):
        phone = os.getenv('DJANGO_SUPERUSER_PHONE')
        password = os.getenv('DJANGO_SUPERUSER_PASSWORD')
        first_name = os.getenv('DJANGO_SUPERUSER_FIRST_NAME')
        last_name = os.getenv('DJANGO_SUPERUSER_LAST_NAME')

        if not phone or not password:
            self.stdout.write(
                self.style.WARNING(
                    'Variables DJANGO_SUPERUSER_PHONE et DJANGO_SUPERUSER_PASSWORD non définies. '
                    'Superuser non créé.'
                )
            )
            return

        # Vérifier si le superuser existe déjà
        if User.objects.filter(phone_number=phone).exists():
            user = User.objects.get(phone_number=phone)
            
            # Mettre à jour le mot de passe si nécessaire
            if not user.check_password(password):
                user.set_password(password)
                user.save()
                self.stdout.write(
                    self.style.SUCCESS(f'Mot de passe du superuser {phone} mis à jour.')
                )
            else:
                self.stdout.write(
                    self.style.SUCCESS(f'Superuser {phone} existe déjà.')
                )
            
            # S'assurer qu'il est bien superuser
            if not user.is_superuser or not user.is_staff:
                user.is_superuser = True
                user.is_staff = True
                user.save()
                self.stdout.write(
                    self.style.SUCCESS(f'Droits superuser accordés à {phone}.')
                )
            return

        # Créer le superuser
        try:
            user = User.objects.create_superuser(
                phone_number=phone,
                password=password,
                first_name=first_name,
                last_name=last_name,
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f'Superuser créé avec succès:\n'
                    f'  Phone: {phone}\n'
                    f'  Nom: {first_name} {last_name}'
                )
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Erreur lors de la création du superuser: {e}')
            )
