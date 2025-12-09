"""
Configuration Django Admin pour le module commerce MAVECAM AquaCare.

Interface d'administration pour gestion catalogue produits et commandes.
"""
from django.contrib import admin
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from django.http import HttpResponse, FileResponse
from django.contrib import messages
import io
import zipfile

from .models import Product, Order, OrderItem
from .services.pdf_service import generate_order_pdf


class OrderItemInline(admin.TabularInline):
    """
    Affichage inline des lignes de commande dans l'admin Order.
    """
    model = OrderItem
    extra = 0
    readonly_fields = ['product', 'product_name', 'unit_price', 'quantity', 'line_total']
    can_delete = False

    def has_add_permission(self, request, obj=None):
        """Empêche ajout items après création commande."""
        return False


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    """
    Administration catalogue produits MAVECAM.
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
        (_('Caractéristiques techniques'), {
            'fields': ('pellet_size_mm', 'protein_percentage', 'lipid_percentage')
        }),
        (_('Conditionnement & Prix'), {
            'fields': ('package_weight_kg', 'price_per_package', 'price_per_kg')
        }),
        (_('Disponibilité'), {
            'fields': ('is_available',)
        }),
        (_('Métadonnées'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

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
        """Badge couleur pour espèce."""
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
    species_badge.short_description = _('Espèce')

    def price_display(self, obj):
        """Affichage formaté du prix."""
        formatted_price = f"{obj.price_per_package:,.0f}"
        return format_html('{} FCFA', formatted_price)
    price_display.short_description = _('Prix')
    price_display.admin_order_field = 'price_per_package'

    def availability_badge(self, obj):
        """Badge disponibilité."""
        if obj.is_available:
            return format_html(
                '<span style="display:inline-block; min-width:110px; text-align:center; white-space:nowrap; background-color: #10b981; color: white; padding: 4px 10px; border-radius: 6px;">✓ Disponible</span>'
            )
        else:
            return format_html(
                '<span style="display:inline-block; min-width:120px; text-align:center; white-space:nowrap; background-color: #ef4444; color: white; padding: 4px 10px; border-radius: 6px;">✗ Indisponible</span>'
            )
    availability_badge.short_description = _('Disponibilité')


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    """
    Administration commandes MAVECAM.
    """
    list_display = [
        'order_number', 'user_link', 'farm_link', 'status_badge',
        'delivery_method_badge', 'total_bags_display', 'total_display',
        'created_at'
    ]
    list_filter = ['status', 'delivery_method', 'created_at', 'created_offline']
    search_fields = [
        'order_number', 'user__first_name', 'user__last_name',
        'user__phone_number', 'delivery_phone'
    ]
    readonly_fields = [
        'id', 'order_number', 'user', 'farm_profile',
        'subtotal', 'delivery_fee', 'total', 'total_bags',
        'is_free_delivery', 'client_uuid', 'synced_at',
        'created_at', 'updated_at'
    ]
    inlines = [OrderItemInline]
    date_hierarchy = 'created_at'
    ordering = ['-created_at']
    actions = ['generate_pdf_action']

    fieldsets = (
        (_('Commande'), {
            'fields': ('id', 'order_number', 'status')
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
        (_('Synchronisation Offline'), {
            'fields': ('client_uuid', 'created_offline', 'synced_at'),
            'classes': ('collapse',)
        }),
        (_('Métadonnées'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def user_link(self, obj):
        """Lien vers utilisateur."""
        return format_html(
            '<a href="/admin/accounts/user/{}/change/">{}</a><br><small>{}</small>',
            obj.user.id,
            obj.user.full_name,
            obj.user.phone_number
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
        """Badge statut coloré."""
        colors = {
            'confirmed': '#10b981'
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
        icon = '🚚' if obj.delivery_method == 'home' else '📦'
        text = obj.get_delivery_method_display()
        if obj.pickup_location:
            text += f' ({obj.get_pickup_location_display()})'

        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; border-radius: 3px;">{} {}</span>',
            color, icon, text
        )
    delivery_method_badge.short_description = _('Livraison')

    def total_bags_display(self, obj):
        """Nombre total de sacs."""
        return format_html(
            '<strong>{}</strong> sacs',
            obj.total_bags
        )
    total_bags_display.short_description = _('Quantité')

    def total_display(self, obj):
        """Affichage formaté du total."""
        formatted_total = f"{obj.total:,.0f}"
        return format_html(
            '<strong style="color: #059669;">{} FCFA</strong>',
            formatted_total
        )
    total_display.short_description = _('Total')
    total_display.admin_order_field = 'total'

    @admin.action(description="Generer PDF des commandes selectionnees")
    def generate_pdf_action(self, request, queryset):
        """Genere PDF pour commandes selectionnees (max 10)."""
        count = queryset.count()

        if count > 10:
            self.message_user(
                request,
                "Selection limitee a 10 commandes maximum. Veuillez reduire votre selection.",
                level=messages.WARNING
            )
            return

        # Cas 1 : Une seule commande -> PDF direct
        if count == 1:
            order = queryset.first()
            try:
                pdf_bytes = generate_order_pdf(order)
                response = HttpResponse(pdf_bytes, content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="commande_{order.order_number}.pdf"'

                self.message_user(
                    request,
                    f"PDF genere avec succes pour commande {order.order_number}",
                    level=messages.SUCCESS
                )
                return response

            except Exception as e:
                self.message_user(
                    request,
                    f"Erreur generation PDF : {str(e)}",
                    level=messages.ERROR
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

            zip_buffer.seek(0)
            response = FileResponse(zip_buffer, content_type='application/zip')
            response['Content-Disposition'] = 'attachment; filename="commandes_mavecam.zip"'

            self.message_user(
                request,
                f"{count} PDFs generes avec succes et archives dans un ZIP",
                level=messages.SUCCESS
            )
            return response

        except Exception as e:
            self.message_user(
                request,
                f"Erreur generation ZIP : {str(e)}",
                level=messages.ERROR
            )

    def has_add_permission(self, request):
        """Empêche création commande via admin (doit passer par API)."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Empêche suppression commande."""
        return False


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    """
    Administration lignes de commande (consultation uniquement).
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
        """Affichage formaté prix unitaire."""
        formatted_unit_price = f"{obj.unit_price:,.0f}"
        return format_html('{} FCFA', formatted_unit_price)
    unit_price_display.short_description = _('Prix unitaire')

    def line_total_display(self, obj):
        """Affichage formaté total ligne."""
        formatted_line_total = f"{obj.line_total:,.0f}"
        return format_html(
            '<strong>{} FCFA</strong>',
            formatted_line_total
        )
    line_total_display.short_description = _('Total')

    def has_add_permission(self, request):
        """Empêche création item via admin."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Empêche suppression item."""
        return False
