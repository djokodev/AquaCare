"""
Modèles de données pour le module commerce MAVECAM AquaCare.

Architecture offline-first avec support synchronisation mobile via UUID.
Gestion catalogue produits alimentaires et commandes aquaculteurs.

Workflow commande (MVP simplifié) :
1. Aquaculteur crée commande → statut 'confirmed' (commandée)
2. Opérateur commerce met la commande en 'delivered' (livrée)
3. Aquaculteur confirme réception → statut 'received' (reçue)
4. Paiement à la livraison (cash)
"""
import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from .constants import (
    BRAND_CHOICES,
    DELIVERY_METHOD_CHOICES,
    ORDER_STATUS_CHOICES,
    PHASE_CHOICES,
    PICKUP_LOCATION_CHOICES,
    SPECIES_CHOICES,
)


class Product(models.Model):
    """
    Produit du catalogue MAVECAM (aliments pour poissons).

    Catalogue fixe de 22 produits :
    - Aller Aqua : INFA, FUTURA, CLARIAS FLOAT, TIL-PRO
    - DIBAQ : Catfish et Tilapia (différentes tailles)

    Pas de gestion de stock pour MVP (toujours disponible).
    """

    class Meta:
        app_label = 'commerce'
        verbose_name = _("Produit")
        verbose_name_plural = _("Produits")
        ordering = ['species', 'phase', 'pellet_size_mm']
        indexes = [
            models.Index(fields=['species', 'phase']),
            models.Index(fields=['brand', 'is_available']),
        ]

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text=_('Identifiant unique UUID pour synchronisation mobile')
    )

    # Identification produit
    brand = models.CharField(
        _('Marque'),
        max_length=50,
        choices=BRAND_CHOICES,
        help_text=_('Marque de l\'aliment')
    )
    name = models.CharField(
        _('Nom commercial'),
        max_length=200,
        help_text=_('Ex: CLARIAS FLOAT 3MM, TIL-PRO SANA 2MM')
    )

    # Classification (pour filtres et recherche)
    species = models.CharField(
        _('Espèce cible'),
        max_length=20,
        choices=SPECIES_CHOICES,
        help_text=_('Espèce de poisson visée')
    )
    phase = models.CharField(
        _('Phase d\'élevage'),
        max_length=30,
        choices=PHASE_CHOICES,
        null=True,
        blank=True,
        help_text=_('Phase de croissance du poisson (optionnel si non-vérifié)')
    )

    # Caractéristiques techniques (données catalogue MAVECAM)
    pellet_size_mm = models.DecimalField(
        _('Taille granulé (mm)'),
        max_digits=4,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.1'))],
        help_text=_('Diamètre du granulé en millimètres')
    )
    protein_percentage = models.PositiveIntegerField(
        _('Taux de protéines (%)'),
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
        help_text=_('Pourcentage de protéines brutes (optionnel si non-vérifié)')
    )
    lipid_percentage = models.PositiveIntegerField(
        _('Taux de lipides (%)'),
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
        help_text=_('Pourcentage de matières grasses (optionnel si non-vérifié)')
    )

    # Conditionnement et prix
    package_weight_kg = models.PositiveIntegerField(
        _('Poids conditionnement (kg)'),
        help_text=_('Poids d\'un sac (15, 20 ou 25 kg selon produit)')
    )
    price_per_package = models.DecimalField(
        _('Prix par sac (FCFA)'),
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
        help_text=_('Prix unitaire d\'un sac en Francs CFA')
    )

    # Disponibilité (toujours True pour MVP, champ pour futur usage)
    is_available = models.BooleanField(
        _('Disponible'),
        default=True,
        help_text=_('Si False, produit retiré temporairement du catalogue')
    )

    # Timestamps
    created_at = models.DateTimeField(
        _('Créé le'),
        auto_now_add=True
    )
    updated_at = models.DateTimeField(
        _('Modifié le'),
        auto_now=True
    )

    def __str__(self):
        return f"{self.name} ({self.package_weight_kg}kg)"

    def clean(self):
        """Validation métier du produit."""
        from django.core.exceptions import ValidationError
        errors = {}

        # Valider taille granulé
        if self.pellet_size_mm and self.pellet_size_mm <= 0:
            errors['pellet_size_mm'] = _("La taille du granulé doit être supérieure à 0")

        # Valider taux protéines
        if self.protein_percentage and (self.protein_percentage < 20 or self.protein_percentage > 50):
            errors['protein_percentage'] = _("Le taux de protéines doit être entre 20% et 50%")

        # Valider taux lipides
        if self.lipid_percentage and (self.lipid_percentage < 1 or self.lipid_percentage > 20):
            errors['lipid_percentage'] = _("Le taux de lipides doit être entre 1% et 20%")

        # Valider poids package (1, 20 ou 25 kg standard MAVECAM)
        if self.package_weight_kg is not None and self.package_weight_kg <= 0:
            errors['package_weight_kg'] = _("Le poids du conditionnement doit être supérieur à 0")
        elif self.package_weight_kg and self.package_weight_kg not in [1, 20, 25]:
            errors['package_weight_kg'] = _("Le poids du conditionnement doit être 1, 20 ou 25 kg")

        # Valider prix cohérent
        if self.price_per_package and self.price_per_package <= 0:
            errors['price_per_package'] = _("Le prix doit être supérieur à 0")

        if errors:
            raise ValidationError(errors)

    @property
    def price_per_kg(self):
        """Calcule le prix au kilogramme."""
        return self.price_per_package / self.package_weight_kg


class Order(models.Model):
    """
    Commande de produits MAVECAM par un aquaculteur.

    Workflow simplifié :
    - Statut initial 'confirmed' dès la création
    - Statut 'delivered' quand la commande est livrée
    - Statut 'received' après confirmation utilisateur
    - Adresse snapshot depuis User/FarmProfile au moment de la commande
    - Calcul automatique frais de livraison
    - Paiement à la livraison (géré hors app)

    Support synchronisation offline avec déduplication via client_uuid.
    """

    class Meta:
        app_label = 'commerce'
        verbose_name = _("Commande")
        verbose_name_plural = _("Commandes")
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['order_number']),
            models.Index(fields=['client_uuid']),
            models.Index(fields=['created_offline', 'synced_at']),
        ]

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text=_('Identifiant unique UUID pour synchronisation mobile')
    )

    # Offline sync metadata
    client_uuid = models.UUIDField(
        _('UUID client'),
        unique=True,
        null=True,
        blank=True,
        help_text=_('UUID généré côté mobile pour déduplication lors de la sync')
    )

    # Relations utilisateur
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.PROTECT,
        related_name='orders',
        verbose_name=_('Client'),
        help_text=_('Aquaculteur ayant passé la commande')
    )
    farm_profile = models.ForeignKey(
        'accounts.FarmProfile',
        on_delete=models.PROTECT,
        related_name='orders',
        verbose_name=_('Ferme'),
        help_text=_('Ferme associée à la commande')
    )

    # Identification commande
    order_number = models.CharField(
        _('Numéro de commande'),
        max_length=20,
        unique=True,
        help_text=_('Format: ORD-YYYYMMDD-XXXX (généré automatiquement)')
    )

    # Statut de traitement commande
    status = models.CharField(
        _('Statut'),
        max_length=20,
        choices=ORDER_STATUS_CHOICES,
        default='confirmed',
        help_text=_('Statut de la commande')
    )

    # Livraison (snapshot adresse au moment de la commande)
    delivery_method = models.CharField(
        _('Mode de livraison'),
        max_length=20,
        choices=DELIVERY_METHOD_CHOICES,
        help_text=_('Livraison à domicile ou retrait en magasin')
    )
    pickup_location = models.CharField(
        _('Point de retrait'),
        max_length=50,
        choices=PICKUP_LOCATION_CHOICES,
        blank=True,
        help_text=_('Marché Ndokoti ou Ndogpasi (si retrait)')
    )

    # Snapshot adresse utilisateur (immutable après création)
    delivery_name = models.CharField(
        _('Nom destinataire'),
        max_length=200,
        help_text=_('Nom complet du destinataire')
    )
    delivery_phone = models.CharField(
        _('Téléphone destinataire'),
        max_length=20,
        help_text=_('Numéro de téléphone pour contact livraison')
    )
    delivery_region = models.CharField(
        _('Région'),
        max_length=50,
        help_text=_('Région Cameroun (ex: Littoral, Centre)')
    )
    delivery_city = models.CharField(
        _('Ville'),
        max_length=100,
        help_text=_('Ville de livraison')
    )
    delivery_full_address = models.TextField(
        _('Adresse complète'),
        help_text=_('Adresse complète de livraison (région, département, ville, quartier)')
    )

    # Montants (calculés automatiquement, immutables après création)
    subtotal = models.DecimalField(
        _('Sous-total (FCFA)'),
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        help_text=_('Somme des articles avant frais de livraison')
    )
    delivery_fee = models.DecimalField(
        _('Frais de livraison (FCFA)'),
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0'))],
        help_text=_('Frais de livraison calculés automatiquement')
    )
    total = models.DecimalField(
        _('Total (FCFA)'),
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        help_text=_('Montant total = sous-total + frais de livraison')
    )

    # Synchronization metadata
    created_offline = models.BooleanField(
        _('Créée hors ligne'),
        default=False,
        help_text=_('True si commande créée en mode offline mobile')
    )
    synced_at = models.DateTimeField(
        _('Synchronisée le'),
        null=True,
        blank=True,
        help_text=_('Date/heure de synchronisation avec le serveur')
    )

    # Timestamps
    created_at = models.DateTimeField(
        _('Créée le'),
        auto_now_add=True
    )
    updated_at = models.DateTimeField(
        _('Modifiée le'),
        auto_now=True
    )

    def __str__(self):
        return f"{self.order_number} - {self.user.display_name}"

    def clean(self):
        """Validation métier de la commande."""
        from django.core.exceptions import ValidationError
        errors = {}

        # Valider cohérence livraison domicile
        if self.delivery_method == 'home':
            if not self.delivery_full_address or not self.delivery_full_address.strip():
                errors['delivery_full_address'] = _("L'adresse complète est requise pour la livraison à domicile")

        # Valider cohérence retrait en point de vente
        if self.delivery_method == 'pickup':
            if not self.pickup_location:
                errors['pickup_location'] = _("Le lieu de retrait est requis pour le retrait en magasin")

        # Valider cohérence montants (total = subtotal + delivery_fee)
        if self.subtotal is not None and self.delivery_fee is not None and self.total is not None:
            expected_total = self.subtotal + self.delivery_fee
            if abs(self.total - expected_total) > Decimal('0.01'):  # tolérance arrondi
                errors['total'] = _(
                    f"Total incohérent: attendu {expected_total} FCFA "
                    f"(sous-total {self.subtotal} + frais livraison {self.delivery_fee}), "
                    f"reçu {self.total} FCFA"
                )

        # Valider montants positifs
        if self.subtotal is not None and self.subtotal < 0:
            errors['subtotal'] = _("Le sous-total doit être positif")

        if self.delivery_fee is not None and self.delivery_fee < 0:
            errors['delivery_fee'] = _("Les frais de livraison doivent être positifs")

        if self.total is not None and self.total <= 0:
            errors['total'] = _("Le total doit être strictement positif")

        if errors:
            raise ValidationError(errors)

    @property
    def total_bags(self):
        """Calcule le nombre total de sacs commandés."""
        return sum(item.quantity for item in self.items.all())

    @property
    def is_free_delivery(self):
        """Vérifie si la livraison est gratuite."""
        return self.delivery_fee == 0


class OrderItem(models.Model):
    """
    Ligne de commande (article dans une commande).

    Snapshot des données produit au moment de la commande (prix, nom)
    pour traçabilité historique (même si produit modifié ultérieurement).
    """

    class Meta:
        app_label = 'commerce'
        verbose_name = _("Article commande")
        verbose_name_plural = _("Articles commande")
        ordering = ['order', 'id']
        indexes = [
            # Index pour performance admin inline OrderItem
            models.Index(fields=['order'], name='orderitem_order_idx'),
        ]

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_('Commande'),
        help_text=_('Commande parente')
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        verbose_name=_('Produit'),
        help_text=_('Référence produit (lien vers catalogue)')
    )

    # Snapshot produit (immutable après création commande)
    product_name = models.CharField(
        _('Nom produit'),
        max_length=200,
        help_text=_('Nom du produit au moment de la commande')
    )
    unit_price = models.DecimalField(
        _('Prix unitaire (FCFA)'),
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
        help_text=_('Prix du sac au moment de la commande')
    )
    quantity = models.PositiveIntegerField(
        _('Quantité'),
        validators=[MinValueValidator(1)],
        help_text=_('Nombre de sacs commandés')
    )
    line_total = models.DecimalField(
        _('Total ligne (FCFA)'),
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
        help_text=_('Total de la ligne = prix unitaire × quantité')
    )

    def __str__(self):
        return f"{self.product_name} x{self.quantity} ({self.line_total} FCFA)"

    def clean(self):
        """Validation métier : line_total doit correspondre à unit_price × quantity."""
        from django.core.exceptions import ValidationError
        expected_total = self.unit_price * self.quantity
        if self.line_total != expected_total:
            raise ValidationError(
                f"Total ligne incohérent: attendu {expected_total}, reçu {self.line_total}"
            )

    def save(self, *args, **kwargs):
        """Calcul automatique du line_total si non fourni."""
        if not self.pk:
            # À la création : calculer line_total si absent, puis valider
            if not self.line_total:
                self.line_total = self.unit_price * self.quantity
            self.full_clean()
        super().save(*args, **kwargs)
