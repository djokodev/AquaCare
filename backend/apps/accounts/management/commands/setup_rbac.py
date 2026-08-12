"""
Management command pour configurer le systeme RBAC AquaCare.
Cree les groupes et assigne les permissions selon les roles.

Usage:
    python manage.py setup_rbac          # Creer groupes et permissions
    python manage.py setup_rbac --reset  # Supprimer et recreer
    python manage.py setup_rbac --dry-run # Simuler sans modifier
"""

from __future__ import annotations

from typing import Any

from common.admin_capabilities import CUSTOM_ADMIN_PERMISSIONS, ROLE_DJANGO_PERMISSIONS
from common.admin_policies import RBACConstants
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = 'Configure les groupes et permissions RBAC pour AquaCare Admin'

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Supprimer les groupes existants et les recreer',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Afficher les modifications sans les appliquer',
        )

    def handle(self, *args: object, **options: Any) -> None:
        self.dry_run = options['dry_run']
        self.verbosity = options['verbosity']

        if self.dry_run:
            self.stdout.write(self.style.WARNING('Mode DRY-RUN: aucune modification'))

        try:
            with transaction.atomic():
                if options['reset']:
                    self._delete_groups()

                self._create_groups()
                self._create_custom_permissions()
                self._assign_permissions()

                if self.dry_run:
                    # Rollback en mode dry-run
                    raise DryRunException()
        except DryRunException:
            self.stdout.write(self.style.SUCCESS('DRY-RUN termine - aucune modification'))
            return

        self.stdout.write(self.style.SUCCESS('RBAC configure avec succes!'))
        self._print_summary()

    def _delete_groups(self) -> None:
        """Supprime les groupes RBAC existants."""
        group_names = [
            RBACConstants.GROUP_MANAGERS,
            RBACConstants.GROUP_COMMERCE,
            RBACConstants.GROUP_SUPPORT,
        ]

        for name in group_names:
            if Group.objects.filter(name=name).exists():
                if not self.dry_run:
                    Group.objects.filter(name=name).delete()
                self.stdout.write(f'  Supprime groupe: {name}')

    def _create_groups(self) -> None:
        """Cree les 3 groupes RBAC."""
        self.stdout.write('\n--- Creation des groupes ---')

        groups_config = [
            (RBACConstants.GROUP_MANAGERS, 'Managers - Gestion comptes et aquaculture'),
            (RBACConstants.GROUP_COMMERCE, 'Operateurs Commerce - Catalogue et commandes'),
            (RBACConstants.GROUP_SUPPORT, 'Operateurs Support - Chat et notifications'),
        ]

        self.groups: dict[str, Group] = {}
        for name, description in groups_config:
            group, created = Group.objects.get_or_create(name=name)
            self.groups[name] = group
            status = 'Cree' if created else 'Existe deja'
            self.stdout.write(f'  {status}: {name}')
            self._migrate_legacy_memberships(group)

    def _migrate_legacy_memberships(self, target_group: Group) -> None:
        """Copie les membres des anciens groupes vers les groupes AquaCare."""
        legacy_names = RBACConstants.LEGACY_GROUP_ALIASES.get(target_group.name, ())
        if not legacy_names:
            return

        legacy_groups = Group.objects.filter(name__in=legacy_names)
        for legacy_group in legacy_groups:
            users = list(legacy_group.user_set.all())
            if not users:
                continue
            if not self.dry_run:
                target_group.user_set.add(*users)
            self.stdout.write(
                f'  Membres migres: {legacy_group.name} -> {target_group.name} ({len(users)})'
            )

    def _assign_permissions(self) -> None:
        """Assigne les permissions a chaque groupe."""
        self.stdout.write('\n--- Attribution des permissions ---')

        labels = {
            RBACConstants.GROUP_MANAGERS: 'MANAGERS',
            RBACConstants.GROUP_COMMERCE: 'COMMERCE',
            RBACConstants.GROUP_SUPPORT: 'SUPPORT',
        }
        for group_name, permission_names in ROLE_DJANGO_PERMISSIONS.items():
            permissions = []
            for permission_name in permission_names:
                app_label, codename = permission_name.split('.', 1)
                permissions.extend(self._get_permissions_for_app(app_label, [codename]))
            self._set_group_permissions(
                self.groups[group_name],
                permissions,
                labels[group_name],
            )

    def _create_custom_permissions(self) -> None:
        """Crée les permissions d'action sur les ContentTypes existants."""
        for permission_name, (app_label, model, name) in CUSTOM_ADMIN_PERMISSIONS.items():
            _app_label, codename = permission_name.split('.', 1)
            try:
                content_type = ContentType.objects.get(app_label=app_label, model=model)
            except ContentType.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(
                        f'  ContentType non trouve pour permission action: {permission_name}'
                    )
                )
                continue
            Permission.objects.update_or_create(
                content_type=content_type,
                codename=codename,
                defaults={"name": name},
            )

    def _get_permissions_for_app(self, app_label: str, codenames: list[str]) -> list[Permission]:
        """Recupere les permissions par app et codename."""
        permissions = []
        for codename in codenames:
            try:
                perm = Permission.objects.get(
                    content_type__app_label=app_label,
                    codename=codename
                )
                permissions.append(perm)
            except Permission.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(f'  Permission non trouvee: {app_label}.{codename}')
                )
        return permissions

    def _set_group_permissions(self, group: Group, permissions: list[Permission], group_label: str) -> None:
        """Assigne les permissions au groupe."""
        if not self.dry_run:
            group.permissions.clear()
            group.permissions.add(*permissions)

        self.stdout.write(f'\n{group_label} ({group.name}):')
        for perm in permissions:
            self.stdout.write(f'  + {perm.content_type.app_label}.{perm.codename}')

    def _print_summary(self) -> None:
        """Affiche un resume de la configuration."""
        self.stdout.write('\n' + '=' * 50)
        self.stdout.write('RESUME RBAC AquaCare')
        self.stdout.write('=' * 50)

        self.stdout.write('\nGroupes crees:')
        for name, group in self.groups.items():
            count = group.permissions.count()
            self.stdout.write(f'  - {name}: {count} permissions')

        self.stdout.write('\nHierarchie des roles:')
        self.stdout.write('  OWNER (is_superuser=True) -> Acces total')
        self.stdout.write(f'  {RBACConstants.GROUP_MANAGERS} -> Comptes + Aquaculture')
        self.stdout.write(f'  {RBACConstants.GROUP_COMMERCE} -> Commerce + Catalogue')
        self.stdout.write(f'  {RBACConstants.GROUP_SUPPORT} -> Chat + Notifications')

        self.stdout.write('\nPour assigner un role:')
        self.stdout.write('  user.groups.add(Group.objects.get(name="aquacare_commerce"))')
        self.stdout.write('  user.is_staff = True')
        self.stdout.write('  user.save()')


class DryRunException(Exception):
    """Exception pour rollback en mode dry-run."""
    pass
