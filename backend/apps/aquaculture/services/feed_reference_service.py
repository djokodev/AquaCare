"""Use cases du référentiel d'aliments d'une ferme."""

from __future__ import annotations

from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from ..models import FarmFeedReference


class FeedReferenceService:
    """Crée et sécurise les identités d'aliments au niveau d'une ferme."""

    @staticmethod
    def normalize_species(species: str) -> str:
        return 'clarias' if species == 'catfish' else species

    @classmethod
    @transaction.atomic
    def create(cls, *, user, farm_profile, data: dict) -> FarmFeedReference:
        if farm_profile.user_id != user.id:
            raise PermissionError(_('Cette ferme ne vous appartient pas.'))

        client_uuid = data.get('client_uuid')
        if client_uuid:
            existing = FarmFeedReference.objects.select_for_update().filter(client_uuid=client_uuid).first()
            if existing:
                if existing.farm_profile_id != farm_profile.id:
                    raise PermissionError(_('Ce client_uuid appartient à une autre ferme.'))
                return existing

        source = data['source']
        product = data.get('catalog_product')
        if source == FarmFeedReference.SOURCE_CATALOG:
            if not product:
                raise ValueError(_('Un produit AquaCare est requis.'))
            name = product.name
            species = cls.normalize_species(product.species)
            pellet_size = product.pellet_size_mm
            defaults = {
                'catalog_product': product,
                'brand': product.brand,
                'protein_percentage': product.protein_percentage,
                'lipid_percentage': product.lipid_percentage,
                'package_weight_kg': product.package_weight_kg,
            }
        else:
            if product:
                raise ValueError(_('Un aliment externe ne peut pas référencer le catalogue.'))
            name = (data.get('name') or '').strip()
            species = cls.normalize_species(data.get('species') or '')
            pellet_size = data.get('pellet_size_mm')
            if not name or species not in {'tilapia', 'clarias'} or pellet_size is None:
                raise ValueError(_('Le nom, l’espèce et la granulométrie sont requis.'))
            defaults = {
                'brand': (data.get('brand') or '').strip(),
                'protein_percentage': data.get('protein_percentage'),
                'lipid_percentage': data.get('lipid_percentage'),
                'package_weight_kg': data.get('package_weight_kg'),
            }

        normalized_name = ' '.join(name.casefold().split())
        try:
            reference, created = FarmFeedReference.objects.get_or_create(
                farm_profile=farm_profile,
                normalized_name=normalized_name,
                species=species,
                pellet_size_mm=Decimal(str(pellet_size)),
                defaults={
                    'source': source,
                    'name': name,
                    'client_uuid': client_uuid,
                    'created_offline': data.get('created_offline', False),
                    'synced_at': timezone.now() if data.get('created_offline') else None,
                    **defaults,
                },
            )
        except IntegrityError:
            reference = FarmFeedReference.objects.get(
                farm_profile=farm_profile,
                normalized_name=normalized_name,
                species=species,
                pellet_size_mm=Decimal(str(pellet_size)),
            )
            created = False
        if not created and reference.source != source:
            raise ValueError(_('Un aliment portant cette identité existe déjà avec une autre origine.'))
        return reference

    @staticmethod
    def get_owned(*, user, reference_id) -> FarmFeedReference:
        reference = FarmFeedReference.objects.for_api().filter(pk=reference_id).first()
        if reference is None:
            raise ValueError(_('Référence aliment introuvable.'))
        if reference.farm_profile.user_id != user.id:
            raise PermissionError(_('Cette référence aliment ne vous appartient pas.'))
        return reference
