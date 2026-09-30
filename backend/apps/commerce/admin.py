"""
Administration securisee du module commerce AquaCare.
Implemente le RBAC multi-niveau avec audit logging.

Roles:
- OWNER (is_superuser): Controle total
- COMMERCE (aquacare_commerce): CRUD produits, view commandes, generer PDF
- MANAGERS: Lecture seule pour contexte
- SUPPORT: Pas d'acces
"""
import io
import logging
import zipfile

from common.admin_capabilities import (
    AdminCapability,
    has_capability,
    has_capability_and_permission,
)
from common.admin_mixins import (
    CommerceOperatorMixin,
    SecuredModelAdmin,
)
from common.admin_ui import badge, link_button
from django.contrib import admin, messages
from django.contrib.admin.models import CHANGE
from django.core.exceptions import PermissionDenied
from django.db.models import IntegerField, Sum, Value
from django.db.models.functions import Coalesce
from django.http import FileResponse, HttpResponse
from django.shortcuts import redirect
from django.template.response import TemplateResponse
from django.urls import reverse
from django.utils import timezone
from django.utils.html import escape, format_html, mark_safe
from django.utils.translation import gettext_lazy as _
from django.utils.translation import ngettext

from .constants import CANCELLATION_REASON_MAX_LENGTH, OPERATOR_CANCELLABLE_STATUSES
from .domain.exceptions import InvalidOrderError
from .models import Order, OrderItem, Product
from .services.order_application_service import OrderApplicationService
from .services.pdf_service import OrderDocumentService, generate_order_pdf

logger = logging.getLogger(__name__)


class CommerceSecuredAdmin(CommerceOperatorMixin, SecuredModelAdmin):
    """
    Base class pour tous les admins du module commerce.
    Commerce operators ont acces complet, managers en lecture seule.
    """

    def has_module_permission(self, request):
        """Commerce et managers peuvent voir le module commerce."""
        if request.user.is_superuser:
            return True

        return (
            has_capability(request.user, AdminCapability.VIEW_COMMERCE)
            and request.user.has_perm(
                f"{self.model._meta.app_label}.view_{self.model._meta.model_name}"
            )
        )

    def has_add_permission(self, request):
        if request.user.is_superuser:
            return True
        return has_capability_and_permission(
            request.user,
            AdminCapability.MANAGE_COMMERCE,
            f"{self.model._meta.app_label}.add_{self.model._meta.model_name}",
        )

    def has_change_permission(self, request, obj=None):
        if request.user.is_superuser:
            return True
        return has_capability_and_permission(
            request.user,
            AdminCapability.MANAGE_COMMERCE,
            f"{self.model._meta.app_label}.change_{self.model._meta.model_name}",
        )


class OrderItemInline(admin.TabularInline):
    """
    Affichage inline des lignes de commande dans l'admin Order.
    """
    model = OrderItem
    extra = 0
    readonly_fields = ['product', 'product_name', 'unit_price', 'quantity', 'line_total']

    def has_add_permission(self, request, obj=None):
        """Empeche ajout items apres creation commande."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Les lignes historiques ne sont jamais supprimables dans l'admin."""
        return False


@admin.register(Product)
class ProductAdmin(CommerceSecuredAdmin):
    """
    Administration securisee du catalogue produits AquaCare.
    """
    list_display = [
        'name', 'brand_badge', 'species_badge', 'phase',
        'pellet_size_mm', 'protein_percentage', 'package_weight_kg',
        'price_display', 'availability_badge', 'updated_at'
    ]
    list_filter = ['brand', 'species', 'phase', 'is_available']
    actions = ['make_available', 'make_unavailable']

    @admin.action(description=_("Rendre disponibles à la commande"))
    def make_available(self, request, queryset):
        if not self.has_change_permission(request):
            raise PermissionDenied
        count = queryset.filter(is_available=False).update(is_available=True)
        messages.success(request, _('{count} produit(s) rendu(s) disponible(s).').format(count=count))

    @admin.action(description=_("Retirer de la vente (indisponibles)"))
    def make_unavailable(self, request, queryset):
        if not self.has_change_permission(request):
            raise PermissionDenied
        count = queryset.filter(is_available=True).update(is_available=False)
        messages.success(request, _('{count} produit(s) retiré(s) de la vente.').format(count=count))
    search_fields = ['name', 'brand']
    readonly_fields = ['id', 'price_per_kg', 'created_at', 'updated_at']
    ordering = ['species', 'phase', 'pellet_size_mm']

    fieldsets = (
        (_('Identification'), {
            'fields': ('id', 'brand', 'name')
        }),
        (_('Classification'), {
            'fields': ('species', 'phase')
        }),
        (_('Caracteristiques techniques'), {
            'fields': ('pellet_size_mm', 'protein_percentage', 'lipid_percentage')
        }),
        (_('Conditionnement & Prix'), {
            'fields': ('package_weight_kg', 'price_per_package', 'price_per_kg')
        }),
        (_('Disponibilite'), {
            'fields': ('is_available',)
        }),
        (_('Metadonnees'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def has_add_permission(self, request):
        """Commerce et superusers peuvent ajouter des produits."""
        if request.user.is_superuser:
            return True
        return has_capability_and_permission(
            request.user,
            AdminCapability.MANAGE_COMMERCE,
            "commerce.add_product",
        )

    def has_change_permission(self, request, obj=None):
        """Commerce et superusers peuvent modifier des produits."""
        if request.user.is_superuser:
            return True
        return has_capability_and_permission(
            request.user,
            AdminCapability.MANAGE_COMMERCE,
            "commerce.change_product",
        )

    def has_delete_permission(self, request, obj=None):
        """Seul superuser peut supprimer des produits."""
        return request.user.is_superuser

    def save_model(self, request, obj, form, change):
        """Override save pour audit."""
        super().save_model(request, obj, form, change)

        from django.contrib.admin.models import ADDITION
        action = CHANGE if change else ADDITION
        self.log_action(request, obj, action)

    # --- Display methods ---

    def brand_badge(self, obj):
        return badge(obj.get_brand_display(), "info")
    brand_badge.short_description = _('Marque')

    def species_badge(self, obj):
        return badge(obj.get_species_display(), "ok" if obj.species == "tilapia" else "warn")
    species_badge.short_description = _('Espece')

    def price_display(self, obj):
        """Affichage formate du prix."""
        formatted_price = f"{obj.price_per_package:,.0f}"
        return format_html('{} FCFA', formatted_price)
    price_display.short_description = _('Prix')
    price_display.admin_order_field = 'price_per_package'

    def availability_badge(self, obj):
        if obj.is_available:
            return badge(_('Disponible'), "ok")
        return badge(_('Indisponible'), "danger")
    availability_badge.short_description = _('Disponibilite')


@admin.register(Order)
class OrderAdmin(CommerceSecuredAdmin):
    """
    Administration securisee des commandes AquaCare.
    """
    list_display = [
        'order_column', 'farm_cycle_column', 'status_badge',
        'delivery_summary', 'total_bags_display', 'total_display',
        'created_at_compact', 'workflow_actions_column', 'documents_compact',
    ]
    list_select_related = ['user', 'farm_profile', 'production_cycle']
    list_filter = ['status', 'delivery_method', 'created_at', 'created_offline']
    search_fields = [
        'order_number', 'user__first_name', 'user__last_name',
        'delivery_phone', 'farm_profile__farm_name', 'production_cycle__cycle_name',
    ]
    readonly_fields = [
        'id', 'order_number', 'status', 'user', 'farm_profile', 'production_cycle',
        'delivery_method', 'pickup_location', 'delivery_name', 'delivery_phone',
        'delivery_region', 'delivery_city', 'delivery_full_address',
        'farm_name_snapshot', 'document_schema_version', 'issuer_snapshot',
        'fulfilment_partner_snapshot', 'production_cycle_name_snapshot',
        'pickup_location_display_fr_snapshot', 'pickup_location_display_en_snapshot',
        'subtotal', 'delivery_fee', 'total', 'total_bags',
        'is_free_delivery', 'client_uuid', 'created_offline', 'synced_at',
        'delivered_at', 'delivered_by', 'ready_for_pickup_at',
        'ready_for_pickup_by', 'received_at', 'cancelled_at', 'cancelled_by',
        'cancellation_source', 'cancellation_reason', 'created_at', 'updated_at',
        'documents_display', 'workflow_history_display', 'workflow_action_display',
        'order_summary_display', 'farm_link',
        'items_summary_display', 'no_cycle_warning',
    ]
    inlines = []
    date_hierarchy = 'created_at'
    ordering = ['-created_at']
    actions = ['cancel_orders_action', 'generate_pdf_fr_action', 'generate_pdf_en_action']

    fieldsets = (
        (_('Commande'), {
            'fields': ('order_summary_display', 'workflow_action_display')
        }),
        (_('Articles'), {
            'fields': ('items_summary_display',)
        }),
        (_('Ferme et cycle'), {
            'fields': ('farm_link', 'production_cycle', 'no_cycle_warning')
        }),
        (_('Suivi'), {
            'fields': ('workflow_history_display',)
        }),
        (_('Livraison ou retrait'), {
            'fields': (
                'delivery_method', 'pickup_location',
                'delivery_name', 'delivery_phone', 'delivery_region',
                'delivery_city', 'delivery_full_address'
            )
        }),
        (_('Montants'), {
            'fields': (
                'subtotal', 'delivery_fee', 'total',
                'total_bags', 'is_free_delivery'
            ),
            'classes': ('collapse',)
        }),
        (_('Documents'), {
            'fields': ('documents_display',)
        }),
        (_('Synchronisation et métadonnées'), {
            'fields': (
                'id', 'client_uuid', 'created_offline', 'synced_at',
                'farm_name_snapshot', 'document_schema_version', 'issuer_snapshot',
                'fulfilment_partner_snapshot', 'production_cycle_name_snapshot',
                'pickup_location_display_fr_snapshot',
                'pickup_location_display_en_snapshot', 'created_at', 'updated_at',
            ),
            'classes': ('collapse',)
        }),
    )

    def has_view_permission(self, request, obj=None):
        """Commerce et managers peuvent voir les commandes en lecture seule."""
        if request.user.is_superuser:
            return True
        return has_capability_and_permission(
            request.user,
            AdminCapability.VIEW_COMMERCE,
            "commerce.view_order",
        )

    def get_urls(self):
        from django.urls import path
        urls = super().get_urls()
        custom = [
            path(
                '<path:object_id>/view-pdf/',
                self.admin_site.admin_view(self.view_pdf_view),
                name='commerce_order_view_pdf',
            ),
            path(
                '<path:object_id>/download-pdf/',
                self.admin_site.admin_view(self.download_pdf_view),
                name='commerce_order_download_pdf',
            ),
            path(
                '<path:object_id>/fulfil/',
                self.admin_site.admin_view(self.fulfil_order_view),
                name='commerce_order_fulfil',
            ),
            path(
                '<path:object_id>/cancel/',
                self.admin_site.admin_view(self.cancel_order_view),
                name='commerce_order_cancel',
            ),
        ]
        return custom + urls

    def has_order_document_permission(self, request, obj=None):
        return request.user.is_superuser or has_capability_and_permission(
            request.user,
            AdminCapability.MANAGE_COMMERCE,
            "commerce.download_order_document",
        )

    @staticmethod
    def _document_language(request):
        language_code = request.GET.get('language', 'fr')
        return language_code if language_code in {'fr', 'en'} else None

    def view_pdf_view(self, request, object_id):
        """Ouvre le bon de commande PDF directement dans le navigateur."""
        order = self.get_object(request, object_id)
        if order is None:
            return HttpResponse(_("Commande introuvable."), status=404)
        language_code = self._document_language(request)
        if language_code is None:
            return HttpResponse(_("Langue invalide."), status=400)
        if not self.has_order_document_permission(request, order):
            return HttpResponse(_("Accès refusé."), status=403)
        try:
            pdf_bytes = generate_order_pdf(order, language_code)
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = (
                f'inline; filename="{OrderDocumentService.filename(order, language_code)}"'
            )
            return response
        except Exception as exc:
            logger.exception(
                "Erreur admin lors de l'affichage PDF commande %s",
                object_id,
                exc_info=exc,
            )
            return HttpResponse(
                _("Erreur interne lors de la génération du PDF."),
                status=500,
            )

    def download_pdf_view(self, request, object_id):
        """Télécharge le bon de commande PDF."""
        order = self.get_object(request, object_id)
        if order is None:
            return HttpResponse(_("Commande introuvable."), status=404)
        language_code = self._document_language(request)
        if language_code is None:
            return HttpResponse(_("Langue invalide."), status=400)
        if not self.has_order_document_permission(request, order):
            return HttpResponse(_("Accès refusé."), status=403)
        try:
            pdf_bytes = generate_order_pdf(order, language_code)
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = (
                f'attachment; filename="{OrderDocumentService.filename(order, language_code)}"'
            )
            return response
        except Exception as exc:
            logger.exception(
                "Erreur admin lors du téléchargement PDF commande %s",
                object_id,
                exc_info=exc,
            )
            messages.error(request, _("Erreur interne lors de la génération du PDF."))
            return HttpResponse(
                _("Erreur interne lors de la génération du PDF."),
                status=500,
            )

    def get_search_fields(self, request):
        """Retire phone_number de la recherche pour non-commerce."""
        search_fields = list(self.search_fields)

        if request.user.is_superuser:
            search_fields.append('user__phone_number')
        elif has_capability(request.user, AdminCapability.MANAGE_COMMERCE):
            search_fields.append('user__phone_number')

        return search_fields

    def get_actions(self, request):
        """Retire les actions selon le role."""
        actions = super().get_actions(request)
        actions.pop('delete_selected', None)

        if not self.has_order_document_permission(request):
            actions.pop('generate_pdf_fr_action', None)
            actions.pop('generate_pdf_en_action', None)
        if not self.has_cancel_permission(request):
            actions.pop('cancel_orders_action', None)

        return actions

    @admin.action(description=_('Annuler les commandes sélectionnées'))
    def cancel_orders_action(self, request, queryset):
        """
        Annulation depuis la liste : page intermédiaire pour saisir le motif
        (obligatoire, envoyé au client), puis annulation via le service métier.
        """
        if not self.has_cancel_permission(request):
            raise PermissionDenied
        orders = list(queryset.select_related('farm_profile').order_by('-created_at'))
        cancellable = [order for order in orders if order.status in OPERATOR_CANCELLABLE_STATUSES]
        skipped = [order for order in orders if order.status not in OPERATOR_CANCELLABLE_STATUSES]

        if request.POST.get('apply') == '1':
            reason = (request.POST.get('reason') or '').strip()[:CANCELLATION_REASON_MAX_LENGTH]
            if not reason:
                messages.error(request, _("Indiquez le motif : il sera envoyé au client."))
            else:
                cancelled = 0
                for order in cancellable:
                    try:
                        result = OrderApplicationService.cancel_order_by_operator(order, request.user, reason)
                    except InvalidOrderError as exc:
                        messages.error(request, f'{order.order_number} : {exc}')
                        continue
                    if result.transitioned:
                        cancelled += 1
                        self.log_change(request, result.order, _('Commande annulée : {}').format(reason))
                if cancelled:
                    messages.success(
                        request,
                        ngettext(
                            '%(count)d commande annulée. Le client a été notifié.',
                            '%(count)d commandes annulées. Les clients ont été notifiés.',
                            cancelled,
                        ) % {'count': cancelled},
                    )
                if skipped:
                    messages.warning(
                        request,
                        _('Ignorées (déjà reçues ou annulées) : {}').format(
                            ', '.join(order.order_number for order in skipped)
                        ),
                    )
                return None

        if not cancellable:
            messages.warning(request, _('Aucune commande sélectionnée ne peut être annulée (déjà reçue ou annulée).'))
            return None

        return TemplateResponse(
            request,
            'admin/commerce/order/cancel_bulk.html',
            {
                **self.admin_site.each_context(request),
                'opts': self.model._meta,
                'title': _('Annuler les commandes sélectionnées'),
                'orders': cancellable,
                'skipped': skipped,
                'selected_ids': [str(order.pk) for order in orders],
                'action_checkbox_name': admin.helpers.ACTION_CHECKBOX_NAME,
                'reason_max_length': CANCELLATION_REASON_MAX_LENGTH,
            },
        )

    def get_list_display(self, request):
        fields = list(super().get_list_display(request))
        if not self.has_workflow_permission(request) and not self.has_cancel_permission(request):
            fields.remove('workflow_actions_column')
        if not self.has_order_document_permission(request):
            fields.remove('documents_compact')
        return fields

    def get_fieldsets(self, request, obj=None):
        fieldsets = super().get_fieldsets(request, obj)
        if self.has_order_document_permission(request):
            return fieldsets
        filtered = []
        for title, options in fieldsets:
            fields = tuple(
                field
                for field in options.get('fields', ())
                if (field != 'documents_display' or self.has_order_document_permission(request))
                and (field != 'workflow_action_display' or self.has_workflow_permission(request))
            )
            if fields:
                filtered.append((title, {**options, 'fields': fields}))
        return filtered

    def has_add_permission(self, request):
        """Empeche creation commande via admin (doit passer par API)."""
        return False

    def has_change_permission(self, request, obj=None):
        """Les commandes sont immuables dans la change view standard.

        Les transitions de fulfilment passent exclusivement par
        ``fulfil_order_view`` et ``has_workflow_permission``.
        """
        return False

    def has_delete_permission(self, request, obj=None):
        """Les commandes historiques ne sont jamais supprimables dans l'admin."""
        return False

    def get_queryset(self, request):
        return (
            super().get_queryset(request)
            .select_related('user', 'farm_profile', 'production_cycle')
            .prefetch_related('items__product')
            .annotate(
                admin_total_bags=Coalesce(
                    Sum('items__quantity'),
                    Value(0),
                    output_field=IntegerField(),
                )
            )
        )

    def has_workflow_permission(self, request) -> bool:
        return bool(
            request.user.is_superuser
            or has_capability_and_permission(
                request.user,
                AdminCapability.MANAGE_COMMERCE,
                "commerce.fulfil_order",
            )
        )

    def fulfil_order_view(self, request, object_id):
        """Page POST/CSRF de confirmation de la transition logistique."""
        order = self.get_object(request, object_id)
        if order is None:
            return HttpResponse(_('Commande introuvable.'), status=404)
        if not self.has_workflow_permission(request):
            raise PermissionDenied
        if order.status != 'confirmed':
            messages.warning(request, _('Cette commande ne nécessite plus cette action.'))
            return redirect('admin:commerce_order_change', object_id)

        action_label = (
            _('Marquer comme livrée')
            if order.delivery_method == 'home'
            else _('Marquer comme prête au retrait')
        )
        if request.method == 'POST':
            try:
                result = OrderApplicationService.mark_order_ready_for_customer_confirmation(
                    order,
                    request.user,
                )
            except InvalidOrderError as exc:
                messages.error(request, str(exc))
            else:
                if result.transitioned:
                    self.log_change(
                        request,
                        result.order,
                        _('Transition logistique effectuée via le service métier.'),
                    )
                    messages.success(
                        request,
                        _(
                            'La commande {} a été mise à jour. La notification client '
                            'a été traitée selon ses préférences.'
                        ).format(result.order.order_number),
                    )
                else:
                    messages.info(
                        request,
                        _('La commande {} était déjà dans cet état.').format(
                            result.order.order_number
                        ),
                    )
            return redirect('admin:commerce_order_change', object_id)

        context = {
            **self.admin_site.each_context(request),
            'opts': self.model._meta,
            'order': order,
            'items': order.items.all(),
            'action_label': action_label,
            'title': action_label,
        }
        return TemplateResponse(
            request,
            'admin/commerce/order/fulfil_confirmation.html',
            context,
        )

    def has_cancel_permission(self, request) -> bool:
        return bool(
            request.user.is_superuser
            or has_capability_and_permission(
                request.user,
                AdminCapability.MANAGE_COMMERCE,
                "commerce.cancel_order",
            )
        )

    def cancel_order_view(self, request, object_id):
        """Page POST/CSRF d'annulation : motif obligatoire, client notifié."""
        order = self.get_object(request, object_id)
        if order is None:
            return HttpResponse(_('Commande introuvable.'), status=404)
        if not self.has_cancel_permission(request):
            raise PermissionDenied
        if order.status not in OPERATOR_CANCELLABLE_STATUSES:
            messages.warning(request, _('Cette commande ne peut plus être annulée.'))
            return redirect('admin:commerce_order_change', object_id)

        reason = ''
        form_error = ''
        if request.method == 'POST':
            reason = (request.POST.get('reason') or '').strip()[:CANCELLATION_REASON_MAX_LENGTH]
            if not reason:
                form_error = _("Indiquez le motif : il sera envoyé au client.")
            else:
                try:
                    result = OrderApplicationService.cancel_order_by_operator(
                        order,
                        request.user,
                        reason,
                    )
                except InvalidOrderError as exc:
                    messages.error(request, str(exc))
                else:
                    if result.transitioned:
                        self.log_change(request, result.order, _('Commande annulée : {}').format(reason))
                        messages.success(
                            request,
                            _('La commande {} a été annulée. Le client a été notifié.').format(
                                result.order.order_number
                            ),
                        )
                    else:
                        messages.info(
                            request,
                            _('La commande {} était déjà annulée.').format(result.order.order_number),
                        )
                return redirect('admin:commerce_order_change', object_id)

        action_label = _('Annuler la commande')
        context = {
            **self.admin_site.each_context(request),
            'opts': self.model._meta,
            'order': order,
            'items': order.items.all(),
            'action_label': action_label,
            'title': action_label,
            'cancel_mode': True,
            'reason': reason,
            'form_error': form_error,
            'reason_max_length': CANCELLATION_REASON_MAX_LENGTH,
        }
        return TemplateResponse(
            request,
            'admin/commerce/order/fulfil_confirmation.html',
            context,
        )

    # --- Display methods ---

    def order_column(self, obj):
        url = reverse('admin:commerce_order_change', args=[obj.pk])
        return format_html('<a href="{}"><strong>{}</strong></a>', url, obj.order_number)
    order_column.short_description = _('Commande')
    order_column.admin_order_field = 'order_number'

    def farm_cycle_column(self, obj):
        cycle_name = obj.production_cycle.cycle_name if obj.production_cycle else _('Aucun cycle associé')
        return format_html(
            '<a href="{}"><strong>{}</strong></a><small class="order-secondary"> · {}</small>',
            reverse('admin:accounts_farmprofile_supervision', args=[obj.farm_profile_id]),
            obj.farm_profile.farm_name,
            cycle_name,
        )
    farm_cycle_column.short_description = _('Ferme / cycle')

    def delivery_summary(self, obj):
        if obj.delivery_method == 'pickup':
            return format_html(
                '<strong>{}</strong><small class="order-secondary"> · {}</small>',
                _('Retrait'),
                obj.get_pickup_location_display() if obj.pickup_location else _('Point non renseigné'),
            )
        destination = ', '.join(part for part in (obj.delivery_city, obj.delivery_region) if part)
        return format_html(
            '<strong>{}</strong><small class="order-secondary"> · {}</small>',
            _('Domicile'),
            destination or _('Destination non renseignée'),
        )
    delivery_summary.short_description = _('Livraison')

    def created_at_compact(self, obj):
        return timezone.localtime(obj.created_at).strftime('%d/%m/%Y %H:%M')
    created_at_compact.short_description = _('Créée le')
    created_at_compact.admin_order_field = 'created_at'

    def workflow_action_link(self, obj):
        if obj.status != 'confirmed':
            return '—'
        label = (
            _('Marquer comme livrée')
            if obj.delivery_method == 'home'
            else _('Marquer comme prête au retrait')
        )
        url = reverse('admin:commerce_order_fulfil', args=[obj.pk])
        return link_button(url, label, strong=True)
    def cancel_action_link(self, obj):
        if not obj.pk or obj.status not in OPERATOR_CANCELLABLE_STATUSES:
            return ''
        url = reverse('admin:commerce_order_cancel', args=[obj.pk])
        return link_button(url, _('Annuler la commande'), danger=True)
    def workflow_actions_column(self, obj):
        fulfil = self.workflow_action_link(obj) if obj.status == 'confirmed' else ''
        cancel = self.cancel_action_link(obj)
        if not fulfil and not cancel:
            return '—'
        return format_html('<div class="aq-actions">{}{}</div>', fulfil, cancel)
    workflow_actions_column.short_description = _('Action')

    def workflow_action_display(self, obj):
        if obj.status == 'cancelled':
            return format_html(
                '<strong class="aq-text-danger">{}</strong> {}',
                _('Commande annulée.'),
                obj.cancellation_reason or '',
            )
        return format_html(
            '<div class="aq-actions">{}{}</div>',
            self.workflow_action_link(obj) if obj.status == 'confirmed' else '',
            self.cancel_action_link(obj),
        )
    workflow_action_display.short_description = _('Action opérateur')

    def documents_compact(self, obj):
        if not obj.pk:
            return '—'
        view_url = reverse('admin:commerce_order_view_pdf', args=[obj.pk])
        return format_html(
            '<a href="{}?language=fr" target="_blank">FR</a> · '
            '<a href="{}?language=en" target="_blank">EN</a>',
            view_url,
            view_url,
        )
    documents_compact.short_description = _('Documents')

    def documents_display(self, obj):
        if not obj.pk:
            return '—'
        view_url = reverse('admin:commerce_order_view_pdf', args=[obj.pk])
        download_url = reverse('admin:commerce_order_download_pdf', args=[obj.pk])
        return format_html(
            '<div class="aq-actions">{}{}{}{}</div>',
            link_button(f'{view_url}?language=fr', _('Visualiser FR'), new_tab=True),
            link_button(f'{download_url}?language=fr', _('Télécharger FR')),
            link_button(f'{view_url}?language=en', _('View EN'), new_tab=True),
            link_button(f'{download_url}?language=en', _('Download EN')),
        )
    documents_display.short_description = _('Documents')

    def no_cycle_warning(self, obj):
        if obj.production_cycle_id:
            return _('Cycle associé : {}').format(obj.production_cycle)
        return format_html(
            '<strong class="aq-text-warn">{}</strong>',
            _(
                'Aucun cycle associé — cette commande ne générera pas '
                "d'entrée automatique dans un magasin de cycle."
            ),
        )
    no_cycle_warning.short_description = _('Magasin du cycle')

    def workflow_history_display(self, obj):
        operator = obj.delivered_by or obj.ready_for_pickup_by
        intermediate_label = (
            _('Livrée le') if obj.delivery_method == 'home' else _('Prête au retrait le')
        )
        intermediate_at = obj.delivered_at or obj.ready_for_pickup_at
        confirmed_label = (
            _('Réception confirmée le')
            if obj.delivery_method == 'home'
            else _('Retrait confirmé le')
        )
        rows = [
            (_('Commandée le'), obj.created_at),
            (intermediate_label, intermediate_at),
            (_('Opérateur'), getattr(operator, 'display_name', None) or operator),
            (confirmed_label, obj.received_at),
        ]
        if obj.status == 'cancelled':
            rows.extend([
                (_('Annulée le'), obj.cancelled_at),
                (_('Annulée par'), obj.get_cancellation_source_display()),
                (_('Motif'), obj.cancellation_reason),
            ])
        rendered = []
        for label, value in rows:
            if hasattr(value, 'tzinfo') and value is not None:
                value = timezone.localtime(value).strftime('%d/%m/%Y %H:%M')
            rendered.append((label, value or '—'))
        return format_html(
            '<dl class="aq-dl">{}</dl>',
            mark_safe(''.join(
                f'<dt>{escape(str(label))}</dt><dd>{escape(str(value))}</dd>'
                for label, value in rendered
            )),
        )
    workflow_history_display.short_description = _('Historique du workflow')

    def items_summary_display(self, obj):
        items = list(obj.items.all())
        if not items:
            return _('Aucun article.')
        rows = ''.join(
            '<tr>'
            f'<td>{escape(item.product_name)}</td>'
            f'<td class="aq-num">{item.quantity}</td>'
            f'<td class="aq-num">{item.unit_price:,.0f} FCFA</td>'
            f'<td class="aq-num">{item.line_total:,.0f} FCFA</td>'
            '</tr>'
            for item in items
        )
        return format_html(
            '<div class="aq-table-wrap"><table class="aq-table">'
            '<thead><tr><th>{}</th><th class="aq-num">{}</th>'
            '<th class="aq-num">{}</th><th class="aq-num">{}</th></tr></thead>'
            '<tbody>{}</tbody></table></div>',
            _('Produit'), _('Quantité'), _('Prix unitaire'), _('Total'),
            mark_safe(rows),
        )
    items_summary_display.short_description = _('Articles commandés')

    def order_summary_display(self, obj):
        """Récapitulatif lisible de la commande (en-tête, montants, livraison)."""
        if not obj.pk:
            return '—'
        status_label, tone = self._status_label_and_tone(obj)
        if obj.delivery_method == 'pickup':
            delivery = _('Retrait') + (
                f" — {obj.get_pickup_location_display()}" if obj.pickup_location else ''
            )
        else:
            delivery = _('Livraison à domicile')
        destination = ' · '.join(
            str(part) for part in (
                obj.delivery_name, obj.delivery_phone, obj.delivery_city,
                getattr(obj, 'get_delivery_region_display', lambda: obj.delivery_region)(),
            ) if part
        )

        def amount(value):
            return f'{value:,.0f} FCFA' if value else '—'

        cells = [
            (_('Sous-total'), amount(obj.subtotal)),
            (_('Livraison'), amount(obj.delivery_fee)),
            (_('Total'), amount(obj.total)),
            (_('Sacs commandés'), str(obj.total_bags or '—')),
        ]
        return format_html(
            '<div class="aq-summary">'
            '<div class="aq-summary__head"><strong>{} {}</strong>{}</div>'
            '<div class="aq-summary__cells">{}</div>'
            '<div class="aq-summary__body"><strong>{}</strong> — {}{}</div>'
            '</div>',
            _('Commande'), obj.order_number or '—', badge(status_label, tone),
            mark_safe(''.join(
                f'<div class="aq-summary__cell"><span class="aq-kpi__label">{escape(str(label))}</span>'
                f'<span class="aq-strong">{escape(value)}</span></div>'
                for label, value in cells
            )),
            delivery, destination or '—',
            format_html('<br><span class="aq-muted">{}</span>', obj.delivery_full_address)
            if obj.delivery_full_address else '',
        )
    order_summary_display.short_description = _('Aperçu de la commande')

    def pdf_download_link(self, obj):
        """Boutons PDF français et anglais."""
        if not obj.pk:
            return "—"
        return self.documents_display(obj)
    pdf_download_link.short_description = _('Bon de commande PDF')

    def user_link(self, obj):
        """Lien vers utilisateur."""
        return format_html(
            '<a href="/admin/accounts/user/{}/change/">{}</a><br><small>{}: ***</small>',
            obj.user.id,
            obj.user.full_name,
            _('Tel'),
        )
    user_link.short_description = _('Client')

    def farm_link(self, obj):
        """Lien vers ferme."""
        return format_html(
            '<a href="{}">{}</a>',
            reverse('admin:accounts_farmprofile_supervision', args=[obj.farm_profile.id]),
            obj.farm_profile.farm_name
        )
    farm_link.short_description = _('Ferme')

    STATUS_TONES = {
        'confirmed': 'info',
        'delivered': 'warn',
        'ready_for_pickup': 'warn',
        'received': 'ok',
        'cancelled': 'danger',
    }

    def _status_label_and_tone(self, obj):
        labels = {
            'confirmed': _('À préparer'),
            'delivered': _('Livrée — confirmation attendue'),
            'ready_for_pickup': _('Prête au retrait'),
            'received': (
                _('Réception confirmée')
                if obj.delivery_method == 'home'
                else _('Retrait confirmé')
            ),
            'cancelled': _('Annulée'),
        }
        return (
            labels.get(obj.status, obj.get_status_display()),
            self.STATUS_TONES.get(obj.status, 'muted'),
        )

    def status_badge(self, obj):
        label, tone = self._status_label_and_tone(obj)
        return badge(label, tone)
    status_badge.short_description = _('Statut')

    def delivery_method_badge(self, obj):
        text = obj.get_delivery_method_display()
        if obj.pickup_location:
            text += f' ({obj.get_pickup_location_display()})'
        return badge(text, 'info' if obj.delivery_method == 'home' else 'muted')
    delivery_method_badge.short_description = _('Livraison')

    def total_bags_display(self, obj):
        """Nombre total de sacs."""
        bag_count = getattr(obj, 'admin_total_bags', obj.total_bags)
        return format_html(
            '<strong>{}</strong> {}',
            bag_count,
            ngettext('sac', 'sacs', bag_count),
        )
    total_bags_display.short_description = _('Quantité')

    def total_display(self, obj):
        """Affichage formate du total."""
        formatted_total = f"{obj.total:,.0f}"
        return format_html(
            '<strong class="aq-text-ok">{} FCFA</strong>',
            formatted_total
        )
    total_display.short_description = _('Total')
    total_display.admin_order_field = 'total'

    # --- Actions securisees ---

    def _generate_pdf_zip(self, request, queryset, language_code):
        """Genere PDF pour commandes selectionnees (max 10). Commerce only."""
        # Verifier permission
        if not self.has_order_document_permission(request):
            return HttpResponse(_("Accès refusé."), status=403)

        count = queryset.count()

        if count > 10:
            messages.warning(
                request,
                _("Selection limitee a 10 commandes maximum. Veuillez reduire votre selection.")
            )
            return

        # Cas 1 : Une seule commande -> PDF direct
        if count == 1:
            order = queryset.first()
            try:
                pdf_bytes = generate_order_pdf(order, language_code)
                response = HttpResponse(pdf_bytes, content_type='application/pdf')
                filename = OrderDocumentService.filename(order, language_code)
                response['Content-Disposition'] = f'attachment; filename="{filename}"'

                # Audit
                self.log_action(request, order, CHANGE, message="PDF bon de commande genere")

                messages.success(
                    request,
                    _("PDF genere avec succes pour commande {}").format(order.order_number)
                )
                return response

            except Exception as e:
                logger.exception(
                    "Erreur admin lors de la génération PDF commande %s",
                    order.id,
                    exc_info=e,
                )
                messages.error(
                    request,
                    _("Erreur interne lors de la génération du PDF.")
                )
                return

        # Cas 2 : Plusieurs commandes -> ZIP de PDFs
        try:
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for order in queryset:
                    pdf_bytes = generate_order_pdf(order, language_code)
                    zip_file.writestr(
                        OrderDocumentService.filename(order, language_code),
                        pdf_bytes
                    )
                    # Audit
                    self.log_action(request, order, CHANGE, message="PDF bon de commande genere (batch)")

            zip_buffer.seek(0)
            response = FileResponse(zip_buffer, content_type='application/zip')
            filename = (
                'bons-commande-aquacare-fr.zip'
                if language_code == 'fr'
                else 'purchase-orders-aquacare-en.zip'
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'

            messages.success(
                request,
                _("{} PDFs generes avec succes et archives dans un ZIP").format(count)
            )
            return response

        except Exception as e:
            logger.exception(
                "Erreur admin lors de la génération ZIP des commandes",
                exc_info=e,
            )
            messages.error(
                request,
                _("Erreur interne lors de la génération de l'archive ZIP.")
            )

    @admin.action(description=_("Générer les bons de commande en français"))
    def generate_pdf_fr_action(self, request, queryset):
        return self._generate_pdf_zip(request, queryset, 'fr')

    @admin.action(description=_("Generate purchase orders in English"))
    def generate_pdf_en_action(self, request, queryset):
        return self._generate_pdf_zip(request, queryset, 'en')

    def changelist_view(self, request, extra_context=None):
        from common.admin_badge_views import clear_badge_cache
        from common.models import AdminViewState
        AdminViewState.mark_seen(request.user, AdminViewState.SECTION_ORDERS)
        clear_badge_cache(request.user)
        return super().changelist_view(request, extra_context)


@admin.register(OrderItem)
class OrderItemAdmin(CommerceSecuredAdmin):
    """
    Administration securisee des lignes de commande (consultation uniquement).
    """
    list_display = [
        'order_number', 'farm_name', 'product_name', 'quantity',
        'unit_price_display', 'line_total_display'
    ]
    list_filter = ['order__status', 'order__created_at', 'product__species', 'product__phase']
    search_fields = [
        'order__order_number', 'order__farm_profile__farm_name',
        'order__user__first_name', 'order__user__last_name', 'product_name',
    ]
    list_select_related = ['order', 'order__farm_profile', 'order__user', 'product']
    readonly_fields = [
        'order', 'product', 'product_name', 'unit_price', 'quantity', 'line_total',
        'product_brand_snapshot', 'product_species_snapshot', 'product_phase_snapshot',
        'product_pellet_size_mm_snapshot', 'product_package_weight_kg_snapshot',
    ]

    def order_number(self, obj):
        """Lien vers commande."""
        return format_html(
            '<a href="{}">{}</a>',
            reverse('admin:commerce_order_change', args=[obj.order.id]),
            obj.order.order_number
        )
    order_number.short_description = _('Commande')

    def farm_name(self, obj):
        return obj.order.farm_profile.farm_name
    farm_name.short_description = _('Ferme')

    def unit_price_display(self, obj):
        """Affichage formate prix unitaire."""
        formatted_unit_price = f"{obj.unit_price:,.0f}"
        return format_html('{} FCFA', formatted_unit_price)
    unit_price_display.short_description = _('Prix unitaire')

    def line_total_display(self, obj):
        """Affichage formate total ligne."""
        formatted_line_total = f"{obj.line_total:,.0f}"
        return format_html(
            '<strong>{} FCFA</strong>',
            formatted_line_total
        )
    line_total_display.short_description = _('Total')

    def has_add_permission(self, request):
        """Empeche creation item via admin."""
        return False

    def has_change_permission(self, request, obj=None):
        """Lecture seule pour tous."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Les lignes historiques ne sont jamais supprimables dans l'admin."""
        return False

    def get_actions(self, request):
        actions = super().get_actions(request)
        actions.pop('delete_selected', None)
        return actions
