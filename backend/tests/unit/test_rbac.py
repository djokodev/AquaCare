"""
Tests unitaires pour le systeme RBAC AquaCare.

Couvre:
- Creation des groupes via setup_rbac
- Permissions par role (OWNER, MANAGERS, COMMERCE, SUPPORT)
- Protection anti-elevation de privileges
- Masquage PII
- Audit logging
"""
from io import StringIO
from unittest.mock import Mock

import pytest
from accounts.admin import UserAdmin
from commerce.admin import ProductAdmin
from commerce.models import Product
from common.admin_mixins import (
    AuditLogMixin,
    PIIMaskingMixin,
    RBACConstants,
)
from django.contrib.admin.models import LogEntry
from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser, Group
from django.core.exceptions import PermissionDenied
from django.test import RequestFactory

User = get_user_model()


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def request_factory():
    """Factory pour creer des requetes mock."""
    return RequestFactory()


@pytest.fixture
def admin_site():
    """Site admin pour les tests."""
    return AdminSite()


@pytest.fixture
def superuser(user_factory):
    """Utilisateur superuser (OWNER)."""
    return user_factory(
        phone_number='+237699000001',
        is_staff=True,
        is_superuser=True
    )


@pytest.fixture
def staff_user(user_factory):
    """Utilisateur staff sans groupe (admin de base)."""
    return user_factory(
        phone_number='+237699000002',
        is_staff=True,
        is_superuser=False
    )


@pytest.fixture
def manager_user(user_factory):
    """Utilisateur avec role MANAGERS."""
    user = user_factory(
        phone_number='+237699000003',
        is_staff=True,
        is_superuser=False
    )
    group, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_MANAGERS)
    user.groups.add(group)
    return user


@pytest.fixture
def commerce_user(user_factory):
    """Utilisateur avec role COMMERCE."""
    user = user_factory(
        phone_number='+237699000004',
        is_staff=True,
        is_superuser=False
    )
    group, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_COMMERCE)
    user.groups.add(group)
    return user


@pytest.fixture
def support_user(user_factory):
    """Utilisateur avec role SUPPORT."""
    user = user_factory(
        phone_number='+237699000005',
        is_staff=True,
        is_superuser=False
    )
    group, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_SUPPORT)
    user.groups.add(group)
    return user


@pytest.fixture
def regular_user(user_factory):
    """Utilisateur normal sans acces admin."""
    return user_factory(
        phone_number='+237699000006',
        is_staff=False,
        is_superuser=False
    )


@pytest.fixture
def mock_request(request_factory):
    """Cree une requete mock avec un utilisateur."""
    def _create_request(user):
        request = request_factory.get('/admin/')
        request.user = user
        return request
    return _create_request


# =============================================================================
# TESTS RBAC CONSTANTS
# =============================================================================

@pytest.mark.django_db
class TestRBACConstants:
    """Tests pour les constantes RBAC."""

    def test_group_names_defined(self):
        """Verifie que les noms de groupes sont definis."""
        assert RBACConstants.GROUP_MANAGERS == 'aquacare_managers'
        assert RBACConstants.GROUP_COMMERCE == 'aquacare_commerce'
        assert RBACConstants.GROUP_SUPPORT == 'aquacare_support'

    def test_role_apps_mapping(self):
        """Verifie le mapping role -> apps."""
        assert 'accounts' in RBACConstants.ROLE_APPS[RBACConstants.GROUP_MANAGERS]
        assert 'aquaculture' in RBACConstants.ROLE_APPS[RBACConstants.GROUP_MANAGERS]
        assert 'commerce' in RBACConstants.ROLE_APPS[RBACConstants.GROUP_COMMERCE]
        assert 'chat' in RBACConstants.ROLE_APPS[RBACConstants.GROUP_SUPPORT]

    def test_sensitive_fields_defined(self):
        """Verifie que les champs sensibles sont definis."""
        assert 'phone_number' in RBACConstants.SENSITIVE_FIELDS
        assert 'expo_push_token' in RBACConstants.SENSITIVE_FIELDS
        assert 'device_id' in RBACConstants.SENSITIVE_FIELDS


# =============================================================================
# TESTS SETUP_RBAC COMMAND
# =============================================================================

@pytest.mark.django_db
class TestSetupRBACCommand:
    """Tests pour la commande setup_rbac."""

    def test_command_creates_groups(self):
        """La commande cree les 3 groupes."""
        from django.core.management import call_command

        # Supprimer les groupes existants
        Group.objects.filter(name__startswith='aquacare_').delete()

        # Executer la commande
        out = StringIO()
        call_command('setup_rbac', stdout=out)

        # Verifier les groupes
        assert Group.objects.filter(name=RBACConstants.GROUP_MANAGERS).exists()
        assert Group.objects.filter(name=RBACConstants.GROUP_COMMERCE).exists()
        assert Group.objects.filter(name=RBACConstants.GROUP_SUPPORT).exists()

    def test_command_idempotent(self):
        """La commande peut etre executee plusieurs fois."""
        from django.core.management import call_command

        out = StringIO()
        call_command('setup_rbac', stdout=out)
        call_command('setup_rbac', stdout=out)

        # Toujours 3 groupes
        count = Group.objects.filter(name__startswith='aquacare_').count()
        assert count == 3

    def test_command_reset_option(self):
        """L'option --reset recree les groupes."""
        from django.core.management import call_command

        # Creer les groupes
        call_command('setup_rbac', stdout=StringIO())

        # Ajouter une permission custom a un groupe
        # Reset
        call_command('setup_rbac', '--reset', stdout=StringIO())

        # Le groupe existe toujours
        assert Group.objects.filter(name=RBACConstants.GROUP_MANAGERS).exists()

    def test_command_dry_run(self):
        """L'option --dry-run ne modifie rien."""
        from django.core.management import call_command

        # Supprimer les groupes
        Group.objects.filter(name__startswith='aquacare_').delete()

        # Dry run
        out = StringIO()
        call_command('setup_rbac', '--dry-run', stdout=out)

        # Aucun groupe cree
        assert not Group.objects.filter(name=RBACConstants.GROUP_MANAGERS).exists()


# =============================================================================
# TESTS SECURED MODEL ADMIN
# =============================================================================

@pytest.mark.django_db
class TestSecuredModelAdmin:
    """Tests pour SecuredModelAdmin."""

    def test_superuser_has_module_permission(self, mock_request, superuser):
        """Le superuser a acces a tous les modules."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(superuser)

        assert admin.has_module_permission(request) is True

    def test_unauthenticated_no_module_permission(self, mock_request, request_factory):
        """Un utilisateur non authentifie n'a pas acces."""
        admin = UserAdmin(User, AdminSite())
        request = request_factory.get('/admin/')
        request.user = AnonymousUser()

        assert admin.has_module_permission(request) is False

    def test_manager_has_module_permission_accounts(self, mock_request, manager_user):
        """Le manager a acces au module accounts."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(manager_user)

        assert admin.has_module_permission(request) is True

    def test_commerce_no_module_permission_accounts(self, mock_request, commerce_user):
        """Le commerce n'a pas acces au module accounts."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(commerce_user)

        # Commerce ne devrait pas avoir acces direct a accounts
        assert admin.has_module_permission(request) is False

    def test_support_no_module_permission_accounts(self, mock_request, support_user):
        """Le support n'a pas acces au module accounts."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(support_user)

        assert admin.has_module_permission(request) is False


# =============================================================================
# TESTS DELETE PERMISSIONS
# =============================================================================

@pytest.mark.django_db
class TestDeletePermissions:
    """Tests pour les permissions de suppression."""

    def test_superuser_can_delete_regular_user(self, mock_request, superuser, regular_user):
        """Le superuser peut supprimer un utilisateur normal."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(superuser)

        assert admin.has_delete_permission(request, regular_user) is True

    def test_superuser_cannot_delete_self(self, mock_request, superuser):
        """Le superuser ne peut pas se supprimer lui-meme."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(superuser)

        assert admin.has_delete_permission(request, superuser) is False

    def test_superuser_cannot_delete_another_superuser(self, mock_request, superuser, user_factory):
        """Le superuser ne peut pas supprimer un autre superuser."""
        another_superuser = user_factory(
            phone_number='+237699999999',
            is_staff=True,
            is_superuser=True
        )

        admin = UserAdmin(User, AdminSite())
        request = mock_request(superuser)

        assert admin.has_delete_permission(request, another_superuser) is False

    def test_manager_cannot_delete_users(self, mock_request, manager_user, regular_user):
        """Le manager ne peut pas supprimer d'utilisateurs."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(manager_user)

        assert admin.has_delete_permission(request, regular_user) is False


# =============================================================================
# TESTS CHANGE PERMISSIONS
# =============================================================================

@pytest.mark.django_db
class TestChangePermissions:
    """Tests pour les permissions de modification."""

    def test_superuser_can_change_any_user(self, mock_request, superuser, staff_user):
        """Le superuser peut modifier n'importe quel utilisateur."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(superuser)

        assert admin.has_change_permission(request, staff_user) is True

    def test_manager_can_change_regular_user(self, mock_request, manager_user, regular_user):
        """Le manager peut modifier un utilisateur normal."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(manager_user)

        assert admin.has_change_permission(request, regular_user) is True

    def test_manager_cannot_change_staff_user(self, mock_request, manager_user, staff_user):
        """Le manager ne peut pas modifier un autre admin."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(manager_user)

        assert admin.has_change_permission(request, staff_user) is False


# =============================================================================
# TESTS PRIVILEGE ESCALATION PROTECTION
# =============================================================================

@pytest.mark.django_db
class TestPrivilegeEscalation:
    """Tests pour la protection contre l'elevation de privileges."""

    def test_manager_cannot_promote_to_superuser(self, mock_request, manager_user, regular_user):
        """Le manager ne peut pas promouvoir un utilisateur en superuser."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(manager_user)

        # Simuler la tentative de promotion
        regular_user.is_superuser = True

        # La sauvegarde devrait lever une exception
        with pytest.raises(PermissionDenied):
            admin.save_model(request, regular_user, None, change=True)

    def test_manager_cannot_promote_to_staff(self, mock_request, manager_user, regular_user):
        """Le manager ne peut pas promouvoir un utilisateur en staff."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(manager_user)

        # Simuler la tentative de promotion
        regular_user.is_staff = True

        # La sauvegarde devrait lever une exception
        with pytest.raises(PermissionDenied):
            admin.save_model(request, regular_user, None, change=True)

    def test_superuser_can_promote_to_staff(self, mock_request, superuser, regular_user):
        """Le superuser peut promouvoir un utilisateur en staff."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(superuser)

        # Simuler la promotion
        regular_user.is_staff = True

        # Pas d'exception
        admin.save_model(request, regular_user, None, change=True)

        # Verifier que la modification a ete sauvegardee
        regular_user.refresh_from_db()
        assert regular_user.is_staff is True


# =============================================================================
# TESTS READONLY FIELDS
# =============================================================================

@pytest.mark.django_db
class TestReadonlyFields:
    """Tests pour les champs en lecture seule."""

    def test_superuser_can_edit_permission_fields(self, mock_request, superuser):
        """Le superuser peut modifier les champs de permission."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(superuser)

        readonly = admin.get_readonly_fields(request, None)

        assert 'is_staff' not in readonly
        assert 'is_superuser' not in readonly
        assert 'groups' not in readonly

    def test_manager_cannot_edit_permission_fields(self, mock_request, manager_user):
        """Le manager ne peut pas modifier les champs de permission."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(manager_user)

        readonly = admin.get_readonly_fields(request, None)

        assert 'is_staff' in readonly
        assert 'is_superuser' in readonly
        assert 'groups' in readonly
        assert 'user_permissions' in readonly


# =============================================================================
# TESTS QUERYSET FILTERING
# =============================================================================

@pytest.mark.django_db
class TestQuerysetFiltering:
    """Tests pour le filtrage des querysets."""

    def test_superuser_sees_all_users(self, mock_request, superuser, staff_user, regular_user):
        """Le superuser voit tous les utilisateurs."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(superuser)

        qs = admin.get_queryset(request)

        assert superuser in qs
        assert staff_user in qs
        assert regular_user in qs

    def test_manager_does_not_see_superusers(self, mock_request, manager_user, superuser, regular_user):
        """Le manager ne voit pas les superusers."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(manager_user)

        qs = admin.get_queryset(request)

        assert superuser not in qs
        assert regular_user in qs


# =============================================================================
# TESTS ACTIONS FILTERING
# =============================================================================

@pytest.mark.django_db
class TestActionsFiltering:
    """Tests pour le filtrage des actions admin."""

    def test_superuser_has_delete_action(self, mock_request, superuser):
        """Le superuser a l'action delete_selected."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(superuser)

        actions = admin.get_actions(request)

        assert 'delete_selected' in actions

    def test_manager_has_verify_action(self, mock_request, manager_user):
        """Le manager a l'action verify_users."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(manager_user)

        actions = admin.get_actions(request)

        assert 'verify_users' in actions
        assert 'certify_farms' in actions

    def test_manager_no_delete_action(self, mock_request, manager_user):
        """Le manager n'a pas l'action delete_selected."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(manager_user)

        actions = admin.get_actions(request)

        assert 'delete_selected' not in actions


# =============================================================================
# TESTS PII MASKING
# =============================================================================

@pytest.mark.django_db
class TestPIIMasking:
    """Tests pour le masquage des PII."""

    def test_phone_masked_method(self):
        """La methode phone_masked masque correctement le numero."""
        mixin = PIIMaskingMixin()

        # Mock object avec phone_number
        obj = Mock()
        obj.phone_number = '+237699123456'

        result = mixin.phone_masked(obj)

        # Verifier que le numero est partiellement masque
        assert '+23769' in result
        assert '56' in result
        assert 'X' in result

    def test_manager_sees_phone_number(self, mock_request, manager_user):
        """Le manager voit les numeros de telephone."""
        admin = UserAdmin(User, AdminSite())
        request = mock_request(manager_user)

        list_display = admin.get_list_display(request)

        assert 'phone_number' in list_display
        assert 'phone_masked' not in list_display


# =============================================================================
# TESTS AUDIT LOGGING
# =============================================================================

@pytest.mark.django_db
class TestAuditLogging:
    """Tests pour l'audit logging."""

    def test_log_action_creates_logentry(self, mock_request, superuser, regular_user):
        """log_action cree une entree LogEntry."""
        from django.contrib.admin.models import CHANGE

        mixin = AuditLogMixin()
        request = mock_request(superuser)

        # Compter les logs avant
        initial_count = LogEntry.objects.count()

        mixin.log_action(request, regular_user, CHANGE, message='Test audit')

        # Verifier qu'un log a ete cree
        assert LogEntry.objects.count() == initial_count + 1

        # Verifier le contenu
        log = LogEntry.objects.latest('action_time')
        assert log.user_id == superuser.pk
        assert 'Test audit' in log.change_message


# =============================================================================
# TESTS MODULE PERMISSIONS PAR ROLE
# =============================================================================

@pytest.mark.django_db
class TestModulePermissionsByRole:
    """Tests pour les permissions de module par role."""

    def test_commerce_has_commerce_module_permission(self, mock_request, commerce_user):
        """Le commerce a acces au module commerce."""
        from commerce.admin import ProductAdmin
        from commerce.models import Product

        admin = ProductAdmin(Product, AdminSite())
        request = mock_request(commerce_user)

        assert admin.has_module_permission(request) is True

    def test_commerce_has_aquaculture_view_permission(self, mock_request, commerce_user):
        """Le commerce a acces en lecture au module aquaculture."""
        from aquaculture.admin import ProductionCycleAdmin
        from aquaculture.models import ProductionCycle

        admin = ProductionCycleAdmin(ProductionCycle, AdminSite())
        request = mock_request(commerce_user)

        assert admin.has_module_permission(request) is True

    def test_support_has_chat_module_permission(self, mock_request, support_user):
        """Le support a acces au module chat."""
        from chat.admin import ConversationAdmin
        from chat.models import Conversation

        admin = ConversationAdmin(Conversation, AdminSite())
        request = mock_request(support_user)

        assert admin.has_module_permission(request) is True

    def test_support_has_notifications_module_permission(self, mock_request, support_user):
        """Le support a acces au module notifications."""
        from notifications.admin import NotificationAdmin
        from notifications.models import Notification

        admin = NotificationAdmin(Notification, AdminSite())
        request = mock_request(support_user)

        assert admin.has_module_permission(request) is True

    def test_commerce_no_chat_module_permission(self, mock_request, commerce_user):
        """Le commerce n'a pas acces au module chat."""
        from chat.admin import ConversationAdmin
        from chat.models import Conversation

        admin = ConversationAdmin(Conversation, AdminSite())
        request = mock_request(commerce_user)

        assert admin.has_module_permission(request) is False

    def test_support_no_commerce_module_permission(self, mock_request, support_user):
        """Le support n'a pas acces au module commerce."""
        from commerce.admin import ProductAdmin
        from commerce.models import Product

        admin = ProductAdmin(Product, AdminSite())
        request = mock_request(support_user)

        assert admin.has_module_permission(request) is False


# =============================================================================
# TESTS COMMERCE SPECIFIC
# =============================================================================

@pytest.mark.django_db
class TestCommerceAdmin:
    """Tests specifiques pour l'admin commerce."""

    def test_commerce_can_add_product(self, mock_request, commerce_user):
        """Le commerce peut ajouter des produits."""
        from commerce.admin import ProductAdmin
        from commerce.models import Product

        admin = ProductAdmin(Product, AdminSite())
        request = mock_request(commerce_user)

        assert admin.has_add_permission(request) is True

    def test_commerce_can_change_product(self, mock_request, commerce_user):
        """Le commerce peut modifier des produits."""
        from commerce.admin import ProductAdmin
        from commerce.models import Product

        admin = ProductAdmin(Product, AdminSite())
        request = mock_request(commerce_user)

        assert admin.has_change_permission(request) is True

    def test_commerce_cannot_delete_product(self, mock_request, commerce_user):
        """Le commerce ne peut pas supprimer des produits."""
        from commerce.admin import ProductAdmin
        from commerce.models import Product

        admin = ProductAdmin(Product, AdminSite())
        request = mock_request(commerce_user)

        assert admin.has_delete_permission(request) is False

    def test_order_add_permission_disabled(self, mock_request, superuser):
        """Les commandes ne peuvent pas etre creees via admin."""
        from commerce.admin import OrderAdmin
        from commerce.models import Order

        admin = OrderAdmin(Order, AdminSite())
        request = mock_request(superuser)

        assert admin.has_add_permission(request) is False

    def test_order_delete_permission_superuser_only(self, mock_request, superuser):
        """Seul le superuser peut supprimer des commandes."""
        from commerce.admin import OrderAdmin
        from commerce.models import Order

        admin = OrderAdmin(Order, AdminSite())
        request = mock_request(superuser)

        assert admin.has_delete_permission(request) is True


# =============================================================================
# TESTS SUPPORT INBOX
# =============================================================================

@pytest.mark.django_db
class TestSupportInbox:
    """Tests pour la boite de support."""

    def test_support_can_access_inbox(self, mock_request, support_user):
        """Le support peut acceder a la boite de support."""
        from chat.admin import support_inbox_view

        request = mock_request(support_user)
        request.method = 'GET'

        # Ne devrait pas lever PermissionDenied
        try:
            support_inbox_view(request)
            # Si on arrive ici, le support a acces
            assert True
        except PermissionDenied:
            pytest.fail("Le support devrait avoir acces a la boite de support")

    def test_commerce_cannot_access_inbox(self, mock_request, commerce_user):
        """Le commerce ne peut pas acceder a la boite de support."""
        from chat.admin import support_inbox_view

        request = mock_request(commerce_user)
        request.method = 'GET'

        with pytest.raises(PermissionDenied):
            support_inbox_view(request)


# =============================================================================
# TESTS MULTI-ROLE
# =============================================================================

@pytest.mark.django_db
class TestMultiRole:
    """Tests pour les utilisateurs avec plusieurs roles."""

    def test_user_with_multiple_groups(self, user_factory):
        """Un utilisateur peut avoir plusieurs groupes."""
        user = user_factory(
            phone_number='+237699888888',
            is_staff=True
        )

        manager_group, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_MANAGERS)
        commerce_group, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_COMMERCE)

        user.groups.add(manager_group, commerce_group)

        assert user.groups.count() == 2
        assert user.groups.filter(name=RBACConstants.GROUP_MANAGERS).exists()
        assert user.groups.filter(name=RBACConstants.GROUP_COMMERCE).exists()

    def test_multi_role_has_combined_permissions(self, mock_request, user_factory):
        """Un utilisateur multi-role a les permissions combinees."""
        user = user_factory(
            phone_number='+237699777777',
            is_staff=True
        )

        manager_group, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_MANAGERS)
        commerce_group, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_COMMERCE)
        user.groups.add(manager_group, commerce_group)

        request = mock_request(user)

        # A acces a accounts (via managers)
        user_admin = UserAdmin(User, AdminSite())
        assert user_admin.has_module_permission(request) is True

        # A acces a commerce (via commerce)
        product_admin = ProductAdmin(Product, AdminSite())
        assert product_admin.has_module_permission(request) is True
