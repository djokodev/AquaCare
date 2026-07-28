"""Serializers reserves aux surfaces admin du module accounts."""

from __future__ import annotations

from rest_framework import serializers

from .models import FarmProfile


class FarmMapSerializer(serializers.ModelSerializer):
    """Payload leger pour afficher les fermes geolocalisees sur la carte admin."""

    owner_name = serializers.CharField(source='user.display_name', read_only=True)
    owner_phone = serializers.CharField(source='user.phone_number', read_only=True)
    certification_status_display = serializers.CharField(
        source='get_certification_status_display',
        read_only=True,
    )

    class Meta:
        model = FarmProfile
        fields = (
            'id',
            'farm_name',
            'latitude',
            'longitude',
            'location_address',
            'certification_status',
            'certification_status_display',
            'owner_name',
            'owner_phone',
        )
