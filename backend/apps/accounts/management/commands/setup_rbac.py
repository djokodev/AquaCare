"""
Management command pour configurer le systeme RBAC AquaCare.
Cree les groupes et assigne les permissions selon les roles.

Usage:
    python manage.py setup_rbac          # Creer groupes et permissions
    python manage.py setup_rbac --reset  # Supprimer et recreer
    python manage.py setup_rbac --dry-run # Simuler sans modifier
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.db import transaction

from common.admin_mixins import RBACConstants


class Command(BaseCommand):
    help = 'Configure les groupes et permissions RBAC pour AquaCare Admin'

    def add_arguments(self, parser):
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

    def handle(self, *args, **options):
        self.dry_run = options['dry_run']
        self.verbosity = options['verbosity']

        if self.dry_run:
            self.stdout.write(self.style.WARNING('Mode DRY-RUN: aucune modification'))

        try:
            with transaction.atomic():
                if options['reset']:
                    self._delete_groups()

                self._create_groups()
                self._assign_permissions()

                if self.dry_run:
                    # Rollback en mode dry-run
                    raise DryRunException()

            self.stdout.write(self.style.SUCCESS('RBAC configure avec succes!'))
            self._print_summary()

        except DryRunException:
            self.stdout.write(self.style.SUCCESS('DRY-RUN termine - aucune modification'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Erreur: {e}'))
            raise

    def _delete_groups(self):
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

    def _create_groups(self):
        """Cree les 3 groupes RBAC."""
        self.stdout.write('\n--- Creation des groupes ---')

        groups_config = [
            (RBACConstants.GROUP_MANAGERS, 'Managers - Gestion comptes et aquaculture'),
            (RBACConstants.GROUP_COMMERCE, 'Operateurs Commerce - Catalogue et commandes'),
            (RBACConstants.GROUP_SUPPORT, 'Operateurs Support - Chat et notifications'),
        ]

        self.groups = {}
        for name, description in groups_config:
            group, created = Group.objects.get_or_create(name=name)
            self.groups[name] = group
            status = 'Cree' if created else 'Existe deja'
            self.stdout.write(f'  {status}: {name}')

    def _assign_permissions(self):
        """Assigne les permissions a chaque groupe."""
        self.stdout.write('\n--- Attribution des permissions ---')

        # Permissions pour MANAGERS
        self._assign_manager_permissions()

        # Permissions pour COMMERCE
        self._assign_commerce_permissions()

        # Permissions pour SUPPORT
        self._assign_support_permissions()

    def _assign_manager_permissions(self):
        """Permissions pour mavecam_managers."""
        group = self.groups[RBACConstants.GROUP_MANAGERS]
        permissions = []

        # Accounts - view et change (pas delete, pas is_staff/is_superuser)
        accounts_perms = self._get_permissions_for_app('accounts', [
            'view_user', 'change_user',
            'view_farmprofile', 'add_farmprofile', 'change_farmprofile',
        ])
        permissions.extend(accounts_perms)

        # Aquaculture - CRUD complet
        aquaculture_perms = self._get_permissions_for_app('aquaculture', [
            'view_productioncycle', 'add_productioncycle', 'change_productioncycle',
            'view_cyclelog', 'add_cyclelog', 'change_cyclelog',
            'view_feedingplan', 'add_feedingplan', 'change_feedingplan',
            'view_sanitarylog', 'add_sanitarylog', 'change_sanitarylog',
            'view_nutritionalguide',
            'view_cyclemetrics',
        ])
        permissions.extend(aquaculture_perms)

        # Notifications - view seulement
        notif_perms = self._get_permissions_for_app('notifications', [
            'view_notification',
            'view_notificationpreference',
            'view_pushtoken',
        ])
        permissions.extend(notif_perms)

        self._set_group_permissions(group, permissions, 'MANAGERS')

    def _assign_commerce_permissions(self):
        """Permissions pour mavecam_commerce."""
        group = self.groups[RBACConstants.GROUP_COMMERCE]
        permissions = []

        # Commerce - CRUD produits, view commandes
        commerce_perms = self._get_permissions_for_app('commerce', [
            'view_product', 'add_product', 'change_product',
            'view_order',
            'view_orderitem',
        ])
        permissions.extend(commerce_perms)

        # Aquaculture - view seulement (pour contexte)
        aquaculture_perms = self._get_permissions_for_app('aquaculture', [
            'view_productioncycle',
            'view_nutritionalguide',
        ])
        permissions.extend(aquaculture_perms)

        self._set_group_permissions(group, permissions, 'COMMERCE')

    def _assign_support_permissions(self):
        """Permissions pour mavecam_support."""
        group = self.groups[RBACConstants.GROUP_SUPPORT]
        permissions = []

        # Chat - CRUD conversations et messages
        chat_perms = self._get_permissions_for_app('chat', [
            'view_conversation', 'change_conversation',
            'view_message', 'add_message', 'change_message',
        ])
        permissions.extend(chat_perms)

        # Notifications - view et change
        notif_perms = self._get_permissions_for_app('notifications', [
            'view_notification', 'add_notification', 'change_notification',
            'view_notificationpreference', 'change_notificationpreference',
            'view_pushtoken',
        ])
        permissions.extend(notif_perms)

        self._set_group_permissions(group, permissions, 'SUPPORT')

    def _get_permissions_for_app(self, app_label, codenames):
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

    def _set_group_permissions(self, group, permissions, group_label):
        """Assigne les permissions au groupe."""
        if not self.dry_run:
            group.permissions.clear()
            group.permissions.add(*permissions)

        self.stdout.write(f'\n{group_label} ({group.name}):')
        for perm in permissions:
            self.stdout.write(f'  + {perm.content_type.app_label}.{perm.codename}')

    def _print_summary(self):
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
        self.stdout.write('  user.groups.add(Group.objects.get(name="mavecam_commerce"))')
        self.stdout.write('  user.is_staff = True')
        self.stdout.write('  user.save()')


class DryRunException(Exception):
    """Exception pour rollback en mode dry-run."""
    pass
