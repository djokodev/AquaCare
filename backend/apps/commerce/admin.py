"""
Administration securisee du module commerce MAVECAM AquaCare.
Implemente le RBAC multi-niveau avec audit logging.

Roles:
- OWNER (is_superuser): Controle total
- COMMERCE (mavecam_commerce): CRUD produits, view commandes, generer PDF
- MANAGERS: Lecture seule pour contexte
- SUPPORT: Pas d'acces
"""
from django.contrib import admin
from django.contrib.admin.models import CHANGE
from django.utils.html import format_html, escape, mark_safe
from django.utils.translation import gettext_lazy as _
from django.http import HttpResponse, FileResponse
from django.urls import reverse
from django.contrib import messages
import io
import zipfile

from .models import Product, Order, OrderItem
from .services.pdf_service import generate_order_pdf
from common.admin_mixins import (
    SecuredModelAdmin,
    CommerceOperatorMixin,
    RBACConstants,
)


class CommerceSecuredAdmin(CommerceOperatorMixin, SecuredModelAdmin):
    """
    Base class pour tous les admins du module commerce.
    Commerce operators ont acces complet, managers en lecture seule.
    """

    def has_module_permission(self, request):
        """Commerce et managers peuvent voir le module commerce."""
        if request.user.is_superuser:
            return True

        user_groups = set(request.user.groups.values_list('name', flat=True))

        # Commerce operators: acces complet
        if RBACConstants.GROUP_COMMERCE in user_groups:
            return True

        # Managers: lecture seule
        if RBACConstants.GROUP_MANAGERS in user_groups:
            return True

        return False


class OrderItemInline(admin.TabularInline):
    """
    Affichage inline des lignes de commande dans l'admin Order.
    """
    model = OrderItem
    extra = 0
    readonly_fields = ['product', 'product_name', 'unit_price', 'quantity', 'line_total']
    can_delete = False

    def has_add_permission(self, request, obj=None):
        """Empeche ajout items apres creation commande."""
        return False


@admin.register(Product)
class ProductAdmin(CommerceSecuredAdmin):
    """
    Administration securisee du catalogue produits MAVECAM.
    """
    list_display = [
        'name', 'brand_badge', 'species_badge', 'phase',
        'pellet_size_mm', 'protein_percentage', 'package_weight_kg',
        'price_display', 'availability_badge', 'updated_at'
    ]
    list_filter = ['brand', 'species', 'phase', 'is_available']
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
        return request.user.groups.filter(
            name=RBACConstants.GROUP_COMMERCE
        ).exists()

    def has_change_permission(self, request, obj=None):
        """Commerce et superusers peuvent modifier des produits."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_COMMERCE
        ).exists()

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
        """Badge couleur pour marque."""
        colors = {
            'aller_aqua': '#059669',
            'dibaq': '#3b82f6'
        }
        color = colors.get(obj.brand, '#6b7280')
        return format_html(
            '<span style="display:inline-block; min-width:90px; text-align:center; white-space:nowrap; background-color: {}; color: white; padding: 4px 10px; border-radius: 6px;">{}</span>',
            color,
            obj.get_brand_display()
        )
    brand_badge.short_description = _('Marque')

    def species_badge(self, obj):
        """Badge couleur pour espece."""
        colors = {
            'tilapia': '#10b981',
            'catfish': '#f59e0b'
        }
        color = colors.get(obj.species, '#6b7280')
        return format_html(
            '<span style="display:inline-block; min-width:90px; text-align:center; white-space:nowrap; background-color: {}; color: white; padding: 4px 10px; border-radius: 6px;">{}</span>',
            color,
            obj.get_species_display()
        )
    species_badge.short_description = _('Espece')

    def price_display(self, obj):
        """Affichage formate du prix."""
        formatted_price = f"{obj.price_per_package:,.0f}"
        return format_html('{} FCFA', formatted_price)
    price_display.short_description = _('Prix')
    price_display.admin_order_field = 'price_per_package'

    def availability_badge(self, obj):
        """Badge disponibilite."""
        if obj.is_available:
            return format_html(
                '<span style="display:inline-block; min-width:110px; text-align:center; white-space:nowrap; background-color: #10b981; color: white; padding: 4px 10px; border-radius: 6px;">Disponible</span>'
            )
        else:
            return format_html(
                '<span style="display:inline-block; min-width:120px; text-align:center; white-space:nowrap; background-color: #ef4444; color: white; padding: 4px 10px; border-radius: 6px;">Indisponible</span>'
            )
    availability_badge.short_description = _('Disponibilite')


@admin.register(Order)
class OrderAdmin(CommerceSecuredAdmin):
    """
    Administration securisee des commandes MAVECAM.
    """
    list_display = [
        'order_number', 'user_link', 'farm_link', 'status_badge',
        'delivery_method_badge', 'total_bags_display', 'total_display',
        'created_at', 'pdf_download_link'
    ]
    list_filter = ['status', 'delivery_method', 'created_at', 'created_offline']
    search_fields = [
        'order_number', 'user__first_name', 'user__last_name',
        'delivery_phone'
    ]
    readonly_fields = [
        'id', 'order_number', 'user', 'farm_profile',
        'subtotal', 'delivery_fee', 'total', 'total_bags',
        'is_free_delivery', 'client_uuid', 'synced_at',
        'created_at', 'updated_at', 'pdf_download_link', 'order_summary_display',
    ]
    inlines = [OrderItemInline]
    date_hierarchy = 'created_at'
    ordering = ['-created_at']
    actions = ['generate_pdf_action']

    fieldsets = (
        (_('Récapitulatif'), {
            'fields': ('order_summary_display',)
        }),
        (_('Statut & téléchargement'), {
            'fields': ('status', 'pdf_download_link')
        }),
        (_('Client'), {
            'fields': ('user', 'farm_profile')
        }),
        (_('Livraison'), {
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
            )
        }),
        (_('Identifiants'), {
            'fields': ('id', 'order_number'),
            'classes': ('collapse',)
        }),
        (_('Synchronisation Offline'), {
            'fields': ('client_uuid', 'created_offline', 'synced_at'),
            'classes': ('collapse',)
        }),
        (_('Metadonnees'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def has_view_permission(self, request, obj=None):
        """Commerce et managers peuvent voir les commandes en lecture seule."""
        if request.user.is_superuser:
            return True
        user_groups = set(request.user.groups.values_list('name', flat=True))
        return (
            RBACConstants.GROUP_COMMERCE in user_groups
            or RBACConstants.GROUP_MANAGERS in user_groups
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
        ]
        return custom + urls

    def view_pdf_view(self, request, object_id):
        """Ouvre le bon de commande PDF directement dans le navigateur."""
        order = self.get_object(request, object_id)
        if order is None:
            return HttpResponse("Commande introuvable.", status=404)
        if not self.has_view_permission(request, order):
            return HttpResponse("Accès refusé.", status=403)
        try:
            pdf_bytes = generate_order_pdf(order)
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = (
                f'inline; filename="commande_{order.order_number}.pdf"'
            )
            return response
        except Exception as exc:
            return HttpResponse(f"Erreur : {exc}", status=500)

    def download_pdf_view(self, request, object_id):
        """Télécharge le bon de commande PDF."""
        order = self.get_object(request, object_id)
        if order is None:
            return HttpResponse("Commande introuvable.", status=404)
        if not self.has_view_permission(request, order):
            return HttpResponse("Accès refusé.", status=403)
        try:
            pdf_bytes = generate_order_pdf(order)
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = (
                f'attachment; filename="commande_{order.order_number}.pdf"'
            )
            return response
        except Exception as exc:
            messages.error(request, f"Erreur génération PDF : {exc}")
            return HttpResponse(str(exc), status=500)

    def get_search_fields(self, request):
        """Retire phone_number de la recherche pour non-commerce."""
        search_fields = list(self.search_fields)

        if request.user.is_superuser:
            search_fields.append('user__phone_number')
        elif request.user.groups.filter(name=RBACConstants.GROUP_COMMERCE).exists():
            search_fields.append('user__phone_number')

        return search_fields

    def get_actions(self, request):
        """Retire les actions selon le role."""
        actions = super().get_actions(request)

        if not request.user.is_superuser:
            # Seuls commerce operators peuvent generer PDF
            is_commerce = request.user.groups.filter(
                name=RBACConstants.GROUP_COMMERCE
            ).exists()

            if not is_commerce:
                if 'generate_pdf_action' in actions:
                    del actions['generate_pdf_action']

        return actions

    def has_add_permission(self, request):
        """Empeche creation commande via admin (doit passer par API)."""
        return False

    def has_change_permission(self, request, obj=None):
        """Commerce operators peuvent modifier le statut des commandes."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_COMMERCE
        ).exists()

    def has_delete_permission(self, request, obj=None):
        """Empeche suppression commande."""
        return False

    # --- Display methods ---

    def order_summary_display(self, obj):
        """Aperçu visuel complet de la commande directement dans l'admin."""
        if not obj.pk:
            return mark_safe('<em style="color:#6b7280;">—</em>')

        order_number = escape(str(obj.order_number or '—'))
        status_labels = {
            'confirmed': ('Confirmée', '#2563eb'),
            'delivered': ('Livrée', '#f59e0b'),
            'received': ('Reçue', '#059669'),
        }
        status_label, status_color = status_labels.get(obj.status, (escape(str(obj.status)), '#6b7280'))

        # Delivery info
        delivery_label = escape(str(obj.get_delivery_method_display() if hasattr(obj, 'get_delivery_method_display') else obj.delivery_method))
        pickup_label = ''
        if obj.pickup_location:
            pickup_label = escape(f' — {obj.get_pickup_location_display()}' if hasattr(obj, 'get_pickup_location_display') else '')
        delivery_name = escape(str(obj.delivery_name or '—'))
        delivery_phone = escape(str(obj.delivery_phone or '—'))
        delivery_city = escape(str(obj.delivery_city or ''))
        delivery_region = escape(str(obj.delivery_region or ''))
        delivery_address = escape(str(obj.delivery_full_address or ''))

        # Totals
        subtotal = f'{obj.subtotal:,.0f}' if obj.subtotal else '—'
        delivery_fee = f'{obj.delivery_fee:,.0f}' if obj.delivery_fee else '—'
        total = f'{obj.total:,.0f}' if obj.total else '—'
        bags = str(obj.total_bags or '—')

        # Items
        items_html = ''
        try:
            items = obj.items.select_related('product').all()
            if items.exists():
                items_html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
                items_html += (
                    '<tr style="background:#f3f4f6;">'
                    '<th style="padding:6px 10px;text-align:left;border-bottom:1px solid #e5e7eb;">Produit</th>'
                    '<th style="padding:6px 10px;text-align:center;border-bottom:1px solid #e5e7eb;">Qté (sacs)</th>'
                    '<th style="padding:6px 10px;text-align:right;border-bottom:1px solid #e5e7eb;">Prix unit.</th>'
                    '<th style="padding:6px 10px;text-align:right;border-bottom:1px solid #e5e7eb;">Total</th>'
                    '</tr>'
                )
                for item in items:
                    product_name = escape(str(item.product_name or '—'))
                    qty = escape(str(item.quantity))
                    unit_price = f'{item.unit_price:,.0f} FCFA' if item.unit_price else '—'
                    line_total = f'{item.line_total:,.0f} FCFA' if item.line_total else '—'
                    items_html += (
                        f'<tr style="border-bottom:1px solid #f3f4f6;">'
                        f'<td style="padding:6px 10px;">{product_name}</td>'
                        f'<td style="padding:6px 10px;text-align:center;">{qty}</td>'
                        f'<td style="padding:6px 10px;text-align:right;">{escape(unit_price)}</td>'
                        f'<td style="padding:6px 10px;text-align:right;font-weight:bold;">{escape(line_total)}</td>'
                        f'</tr>'
                    )
                items_html += '</table>'
            else:
                items_html = '<em style="color:#6b7280;font-size:13px;">Aucun article.</em>'
        except Exception:
            items_html = '<em style="color:#6b7280;">Articles non disponibles.</em>'

        html = (
            '<div style="font-family:sans-serif;max-width:780px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:4px 0;">'

            # Header
            f'<div style="background:#059669;color:white;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;">'
            f'<strong>Commande #{order_number}</strong>'
            f'<span style="background:{status_color};color:white;padding:2px 10px;border-radius:20px;font-size:12px;">{status_label}</span>'
            f'</div>'

            # Items
            f'<div style="border-bottom:1px solid #e5e7eb;">'
            f'{items_html}'
            f'</div>'

            # Totals
            f'<div style="display:flex;border-bottom:1px solid #e5e7eb;">'
            f'<div style="flex:1;padding:10px 16px;border-right:1px solid #e5e7eb;">'
            f'<div style="font-size:12px;color:#6b7280;">Sous-total</div>'
            f'<div style="font-weight:bold;">{escape(subtotal)} FCFA</div>'
            f'</div>'
            f'<div style="flex:1;padding:10px 16px;border-right:1px solid #e5e7eb;">'
            f'<div style="font-size:12px;color:#6b7280;">Livraison</div>'
            f'<div style="font-weight:bold;">{escape(delivery_fee)} FCFA</div>'
            f'</div>'
            f'<div style="flex:1;padding:10px 16px;border-right:1px solid #e5e7eb;">'
            f'<div style="font-size:12px;color:#6b7280;">Total</div>'
            f'<div style="font-weight:bold;color:#059669;font-size:16px;">{escape(total)} FCFA</div>'
            f'</div>'
            f'<div style="flex:1;padding:10px 16px;">'
            f'<div style="font-size:12px;color:#6b7280;">Sacs commandés</div>'
            f'<div style="font-weight:bold;">{escape(bags)} sacs</div>'
            f'</div>'
            f'</div>'

            # Delivery
            f'<div style="padding:10px 16px;font-size:13px;background:#f9fafb;">'
            f'<strong>🚚 {delivery_label}{pickup_label}</strong> — '
            f'{delivery_name} · {delivery_phone}'
            f'{"  ·  " + delivery_city if delivery_city else ""}'
            f'{"  ·  " + delivery_region if delivery_region else ""}'
            f'{"<br><span style=\'color:#6b7280;\'>" + delivery_address + "</span>" if delivery_address else ""}'
            f'</div>'

            '</div>'
        )
        return mark_safe(html)
    order_summary_display.short_description = _('Aperçu de la commande')

    def pdf_download_link(self, obj):
        """Boutons Visualiser + Télécharger le bon de commande PDF."""
        if not obj.pk:
            return "—"
        view_url = reverse('admin:commerce_order_view_pdf', args=[obj.pk])
        download_url = reverse('admin:commerce_order_download_pdf', args=[obj.pk])
        btn_base = (
            'display:inline-block;padding:6px 14px;border-radius:4px;'
            'text-decoration:none;font-weight:bold;font-size:13px;'
        )
        return format_html(
            '<a href="{}" target="_blank" style="{}background:#3b82f6;color:white;">👁 Visualiser</a>'
            '&nbsp;&nbsp;'
            '<a href="{}" style="{}background:#059669;color:white;">📄 Télécharger</a>',
            view_url, btn_base, download_url, btn_base,
        )
    pdf_download_link.short_description = _('Bon de commande PDF')

    def user_link(self, obj):
        """Lien vers utilisateur."""
        return format_html(
            '<a href="/admin/accounts/user/{}/change/">{}</a><br><small>Tel: ***</small>',
            obj.user.id,
            obj.user.full_name
        )
    user_link.short_description = _('Client')

    def farm_link(self, obj):
        """Lien vers ferme."""
        return format_html(
            '<a href="/admin/accounts/farmprofile/{}/change/">{}</a>',
            obj.farm_profile.id,
            obj.farm_profile.farm_name
        )
    farm_link.short_description = _('Ferme')

    def status_badge(self, obj):
        """Badge statut colore."""
        colors = {
            'confirmed': '#2563eb',
            'delivered': '#f59e0b',
            'received': '#10b981',
        }
        color = colors.get(obj.status, '#6b7280')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; border-radius: 3px;">{}</span>',
            color,
            obj.get_status_display()
        )
    status_badge.short_description = _('Statut')

    def delivery_method_badge(self, obj):
        """Badge mode livraison."""
        colors = {
            'home': '#3b82f6',
            'pickup': '#f59e0b'
        }
        color = colors.get(obj.delivery_method, '#6b7280')
        text = obj.get_delivery_method_display()
        if obj.pickup_location:
            text += f' ({obj.get_pickup_location_display()})'

        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; border-radius: 3px;">{}</span>',
            color, text
        )
    delivery_method_badge.short_description = _('Livraison')

    def total_bags_display(self, obj):
        """Nombre total de sacs."""
        return format_html(
            '<strong>{}</strong> sacs',
            obj.total_bags
        )
    total_bags_display.short_description = _('Quantite')

    def total_display(self, obj):
        """Affichage formate du total."""
        formatted_total = f"{obj.total:,.0f}"
        return format_html(
            '<strong style="color: #059669;">{} FCFA</strong>',
            formatted_total
        )
    total_display.short_description = _('Total')
    total_display.admin_order_field = 'total'

    # --- Actions securisees ---

    @admin.action(description=_("Generer PDF des commandes selectionnees"))
    def generate_pdf_action(self, request, queryset):
        """Genere PDF pour commandes selectionnees (max 10). Commerce only."""
        # Verifier permission
        if not request.user.is_superuser:
            if not request.user.groups.filter(name=RBACConstants.GROUP_COMMERCE).exists():
                messages.error(request, _("Vous n'avez pas la permission de generer des PDF."))
                return

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
                pdf_bytes = generate_order_pdf(order)
                response = HttpResponse(pdf_bytes, content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="commande_{order.order_number}.pdf"'

                # Audit
                self.log_action(request, order, CHANGE, message="PDF bon de commande genere")

                messages.success(
                    request,
                    _("PDF genere avec succes pour commande {}").format(order.order_number)
                )
                return response

            except Exception as e:
                messages.error(
                    request,
                    _("Erreur generation PDF : {}").format(str(e))
                )
                return

        # Cas 2 : Plusieurs commandes -> ZIP de PDFs
        try:
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for order in queryset:
                    pdf_bytes = generate_order_pdf(order)
                    zip_file.writestr(
                        f"commande_{order.order_number}.pdf",
                        pdf_bytes
                    )
                    # Audit
                    self.log_action(request, order, CHANGE, message="PDF bon de commande genere (batch)")

            zip_buffer.seek(0)
            response = FileResponse(zip_buffer, content_type='application/zip')
            response['Content-Disposition'] = 'attachment; filename="commandes_aquacare.zip"'

            messages.success(
                request,
                _("{} PDFs generes avec succes et archives dans un ZIP").format(count)
            )
            return response

        except Exception as e:
            messages.error(
                request,
                _("Erreur generation ZIP : {}").format(str(e))
            )


@admin.register(OrderItem)
class OrderItemAdmin(CommerceSecuredAdmin):
    """
    Administration securisee des lignes de commande (consultation uniquement).
    """
    list_display = [
        'order_number', 'product_name', 'quantity', 'unit_price_display', 'line_total_display'
    ]
    list_filter = ['order__created_at']
    search_fields = ['order__order_number', 'product_name']
    readonly_fields = ['order', 'product', 'product_name', 'unit_price', 'quantity', 'line_total']

    def order_number(self, obj):
        """Lien vers commande."""
        return format_html(
            '<a href="/admin/commerce/order/{}/change/">{}</a>',
            obj.order.id,
            obj.order.order_number
        )
    order_number.short_description = _('Commande')

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
        """Empeche suppression item."""
        return False
