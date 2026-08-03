"""Use cases du référentiel d'aliments d'une ferme."""

from __future__ import annotations

from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from ..domain.exceptions import (
    FeedReferenceIdempotencyConflict,
    FeedReferenceNotFound,
)
from ..models import FarmFeedReference


class FeedReferenceService:
    """Crée et sécurise les identités d'aliments au niveau d'une ferme."""

    @staticmethod
    def normalize_species(species: str) -> str:
        return 'clarias' if species == 'catfish' else species

    @staticmethod
    def _decimal(value):
        return Decimal(str(value)) if value is not None else None

    @classmethod
    def _same_payload(cls, reference: FarmFeedReference, payload: dict) -> bool:
        expected = {
            'source': payload['source'],
            'catalog_product_id': getattr(payload.get('catalog_product'), 'id', None),
            'normalized_name': ' '.join(payload['name'].casefold().split()),
            'species': payload['species'],
            'pellet_size_mm': cls._decimal(payload['pellet_size_mm']),
            'brand': payload.get('brand') or '',
            'protein_percentage': cls._decimal(payload.get('protein_percentage')),
            'lipid_percentage': cls._decimal(payload.get('lipid_percentage')),
            'package_weight_kg': cls._decimal(payload.get('package_weight_kg')),
        }
        actual = {
            'source': reference.source,
            'catalog_product_id': reference.catalog_product_id,
            'normalized_name': reference.normalized_name,
            'species': reference.species,
            'pellet_size_mm': reference.pellet_size_mm,
            'brand': reference.brand,
            'protein_percentage': reference.protein_percentage,
            'lipid_percentage': reference.lipid_percentage,
            'package_weight_kg': reference.package_weight_kg,
        }
        return actual == expected

    @classmethod
    @transaction.atomic
    def create(
        cls,
        *,
        user,
        farm_profile,
        data: dict,
        allow_catalog_snapshot: bool = False,
    ) -> FarmFeedReference:
        if farm_profile.user_id != user.id:
            raise PermissionError(_('Cette ferme ne vous appartient pas.'))

        source = data['source']
        product = data.get('catalog_product')
        if source == FarmFeedReference.SOURCE_CATALOG:
            if not product:
                raise ValueError(_('Un produit AquaCare est requis.'))
            name = (data.get('name') or product.name).strip()
            requested_species = data.get('species')
            product_species = cls.normalize_species(product.species)
            if (
                not allow_catalog_snapshot
                and requested_species
                and cls.normalize_species(requested_species) != product_species
            ):
                raise ValueError(_('L’espèce du produit AquaCare ne correspond pas à l’espèce indiquée.'))
            species = cls.normalize_species(requested_species or product_species)
            product_pellet_size = product.pellet_size_mm
            requested_pellet_size = data.get('pellet_size_mm')
            if (
                not allow_catalog_snapshot
                and requested_pellet_size is not None
                and cls._decimal(requested_pellet_size) != cls._decimal(product_pellet_size)
            ):
                raise ValueError(_('La granulométrie du produit AquaCare ne peut pas être modifiée.'))
            pellet_size = requested_pellet_size if allow_catalog_snapshot else product_pellet_size
            if species not in {'tilapia', 'clarias'} or pellet_size is None:
                raise ValueError(_('L’instantané du produit AquaCare est incomplet.'))
            defaults = {
                'catalog_product': product,
                'brand': data.get('brand', product.brand) or '',
                'protein_percentage': data.get('protein_percentage', product.protein_percentage),
                'lipid_percentage': data.get('lipid_percentage', product.lipid_percentage),
                'package_weight_kg': (
                    data['package_weight_kg']
                    if data.get('package_weight_kg') is not None
                    else product.package_weight_kg
                ),
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
        canonical_payload = {
            'source': source,
            'catalog_product': product,
            'name': name,
            'species': species,
            'pellet_size_mm': pellet_size,
            **defaults,
        }
        client_uuid = data.get('client_uuid')
        if client_uuid:
            existing = FarmFeedReference.objects.select_for_update().filter(client_uuid=client_uuid).first()
            if existing:
                if existing.farm_profile_id != farm_profile.id:
                    raise FeedReferenceNotFound()
                if not cls._same_payload(existing, canonical_payload):
                    raise FeedReferenceIdempotencyConflict()
                return existing

        identity = {
            'farm_profile': farm_profile,
            'source': source,
            'normalized_name': normalized_name,
            'species': species,
            'pellet_size_mm': Decimal(str(pellet_size)),
        }
        if source == FarmFeedReference.SOURCE_CATALOG:
            identity['catalog_product'] = product
        try:
            reference, created = FarmFeedReference.objects.get_or_create(
                **identity,
                defaults={
                    'name': name,
                    'client_uuid': client_uuid,
                    'created_offline': data.get('created_offline', False),
                    'synced_at': timezone.now() if data.get('created_offline') else None,
                    **defaults,
                },
            )
        except IntegrityError:
            reference = FarmFeedReference.objects.get(**identity)
            created = False
        if not created and client_uuid and reference.client_uuid is None:
            reference.client_uuid = client_uuid
            reference.save(update_fields=['client_uuid', 'updated_at'])
        return reference

    @staticmethod
    def get_owned(*, user, reference_id) -> FarmFeedReference:
        reference = FarmFeedReference.objects.for_api().filter(pk=reference_id).first()
        if reference is None:
            raise FeedReferenceNotFound()
        if reference.farm_profile.user_id != user.id:
            raise FeedReferenceNotFound()
        return reference

    @staticmethod
    def get_owned_by_client_uuid(*, user, farm_profile, client_uuid) -> FarmFeedReference:
        """Résout une identité offline sans accepter une référence d'une autre ferme."""
        reference = FarmFeedReference.objects.for_api().filter(client_uuid=client_uuid).first()
        if reference is None:
            raise FeedReferenceNotFound()
        if reference.farm_profile_id != farm_profile.id or farm_profile.user_id != user.id:
            raise FeedReferenceNotFound()
        return reference
