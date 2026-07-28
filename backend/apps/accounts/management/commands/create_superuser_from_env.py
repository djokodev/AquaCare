"""
Management command pour créer un superuser à partir des variables d'environnement.

Utilisé au démarrage de l'application via entrypoint.sh.
Idempotent : ne crée pas de doublon si l'utilisateur existe déjà.

Variables d'environnement requises:
    DJANGO_SUPERUSER_PHONE: Numéro de téléphone du superuser (ex: +237652000000)
    DJANGO_SUPERUSER_PASSWORD: Mot de passe du superuser
    DJANGO_SUPERUSER_FIRST_NAME: Prénom (optionnel, défaut: Admin)
    DJANGO_SUPERUSER_LAST_NAME: Nom (optionnel, défaut: AquaCare)

Usage:
    python manage.py create_superuser_from_env
"""

import os

from accounts.models import User
from accounts.validators import normalize_phone_number
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError


class Command(BaseCommand):
    help = 'Crée un superuser à partir des variables d\'environnement (idempotent)'

    def handle(self, *args: object, **options: object) -> None:
        phone = os.getenv('DJANGO_SUPERUSER_PHONE')
        password = os.getenv('DJANGO_SUPERUSER_PASSWORD')
        first_name = (os.getenv('DJANGO_SUPERUSER_FIRST_NAME') or 'Admin').strip() or 'Admin'
        last_name = (os.getenv('DJANGO_SUPERUSER_LAST_NAME') or 'AquaCare').strip() or 'AquaCare'

        if not phone or not password:
            self.stdout.write(
                self.style.WARNING(
                    'Variables DJANGO_SUPERUSER_PHONE et DJANGO_SUPERUSER_PASSWORD non définies. '
                    'Superuser non créé.'
                )
            )
            return

        phone = normalize_phone_number(phone)

        # Vérifier si le superuser existe déjà
        if User.objects.filter(phone_number=phone).exists():
            user = User.objects.get(phone_number=phone)
            
            # Mettre à jour le mot de passe si nécessaire
            if not user.check_password(password):
                user.set_password(password)
                user.save(validate=False, update_fields=['password'])
                self.stdout.write(
                    self.style.SUCCESS(f'Mot de passe du superuser {phone} mis à jour.')
                )
            else:
                self.stdout.write(
                    self.style.SUCCESS(f'Superuser {phone} existe déjà.')
                )
            
            # S'assurer qu'il est bien superuser
            fields_to_update = []
            defaults = {
                'first_name': first_name,
                'last_name': last_name,
                'account_type': 'individual',
                'age_group': '26_35',
                'is_superuser': True,
                'is_staff': True,
                'is_active': True,
                'is_verified': True,
            }
            for field, value in defaults.items():
                if not getattr(user, field):
                    setattr(user, field, value)
                    fields_to_update.append(field)

            if fields_to_update:
                user.save(validate=False, update_fields=fields_to_update)
                self.stdout.write(
                    self.style.SUCCESS(f'Profil superuser vérifié pour {phone}.')
                )
                if 'is_superuser' in fields_to_update or 'is_staff' in fields_to_update:
                    self.stdout.write(
                        self.style.SUCCESS(f'Droits superuser accordés pour {phone}.')
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
        except (IntegrityError, ValidationError, ValueError) as err:
            raise CommandError(f'Erreur lors de la création du superuser: {err}') from err
