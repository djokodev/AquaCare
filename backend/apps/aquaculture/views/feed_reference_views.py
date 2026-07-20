"""API du référentiel d'aliments d'une ferme."""

from accounts.models import FarmProfile
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from ..models import FarmFeedReference
from ..serializers import FarmFeedReferenceCreateSerializer, FarmFeedReferenceSerializer
from ..services.feed_reference_service import FeedReferenceService


class FarmFeedReferenceViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Références AquaCare et externes propres aux fermes de l'utilisateur."""

    def get_queryset(self):
        queryset = FarmFeedReference.objects.for_api().filter(farm_profile__user=self.request.user)
        farm_id = self.request.query_params.get('farm_profile')
        return queryset.filter(farm_profile_id=farm_id) if farm_id else queryset

    def get_serializer_class(self):
        return FarmFeedReferenceCreateSerializer if self.action == 'create' else FarmFeedReferenceSerializer

    @extend_schema(request=FarmFeedReferenceCreateSerializer, responses={201: FarmFeedReferenceSerializer})
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        farm = FarmProfile.objects.filter(pk=serializer.validated_data['farm_profile']).first()
        if farm is None:
            raise ValidationError({'farm_profile': _('Ferme introuvable.')})
        try:
            reference = FeedReferenceService.create(
                user=request.user,
                farm_profile=farm,
                data=serializer.validated_data,
            )
        except PermissionError as exc:
            raise PermissionDenied(str(exc)) from exc
        except ValueError as exc:
            raise ValidationError({'detail': str(exc)}) from exc
        return Response(FarmFeedReferenceSerializer(reference).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        reference = self.get_object()
        if reference.source != FarmFeedReference.SOURCE_EXTERNAL:
            raise PermissionDenied(_('Un produit AquaCare ne peut pas être modifié ici.'))
        return super().update(request, *args, **kwargs)
