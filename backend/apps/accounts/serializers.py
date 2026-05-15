from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError
from django.core.validators import EmailValidator
from django.db import IntegrityError
from django.utils.translation import gettext as _
from rest_framework import serializers
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer, TokenVerifySerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken, UntypedToken

from aquaculture.domain.farm_setup_rules import FarmSetupRules
from aquaculture.services.farm_production_plan_service import FarmProductionPlanService

from .domain.farm_profile_rules import build_farm_profile_invariant_errors
from .models import FarmProfile, User
from .services.auth_application_service import (
    AmbiguousCredentialsError,
    AuthApplicationService,
    InvalidCredentialsError,
)
from .services.registration_service import AccountRegistrationService
from .validators import PhoneNumberValidator, build_user_account_invariant_errors


def validate_user_account_invariants(
    attrs: dict[str, Any],
    instance: User | None = None,
) -> dict[str, Any]:
    """Valide les invariants personne physique/entreprise au niveau API."""
    errors = build_user_account_invariant_errors(attrs, instance)
    if errors:
        raise serializers.ValidationError(errors)

    return attrs


class UserRegistrationSerializer(serializers.ModelSerializer):
    """
    Serializer pour l'inscription des utilisateurs
    """
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)
    phone_number = serializers.CharField(
        validators=[PhoneNumberValidator()],
        help_text="Format: +237XXXXXXXXX ou format international"
    )
    email = serializers.EmailField(
        required=False,
        allow_blank=True,
        validators=[EmailValidator()],
    )

    class Meta:
        model = User
        fields = (
            'phone_number', 'email', 'first_name', 'last_name',
            'business_name', 'account_type', 'language_preference',
            'password', 'password_confirm', 'activity_type',
            'region', 'department', 'district', 'city', 'neighborhood',
            'legal_status', 'promoter_name', 'age_group', 'intervention_zone'
        )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError(_("Les mots de passe ne correspondent pas."))

        try:
            validate_password(attrs['password'])
        except DjangoValidationError as err:
            raise serializers.ValidationError({'password': list(err.messages)}) from err

        validate_user_account_invariants(attrs)

        return attrs

    def create(self, validated_data: dict[str, Any]) -> User:
        validated_data.pop('password_confirm')
        generic_registration_error = _(
            "Impossible de créer ce compte avec les informations fournies."
        )

        try:
            user = AccountRegistrationService.register_user(**validated_data)
            return user
        except DjangoValidationError as err:
            if hasattr(err, 'error_dict'):
                if 'phone_number' in err.error_dict:
                    raise serializers.ValidationError({
                        'phone_number': [generic_registration_error]
                    }) from err
                raise serializers.ValidationError({
                    field: [str(error) for error in errors]
                    for field, errors in err.error_dict.items()
                }) from err
            else:
                raise serializers.ValidationError(str(err)) from err
        except IntegrityError as err:
            if 'phone_number' in str(err):
                raise serializers.ValidationError({
                    'phone_number': [generic_registration_error]
                }) from err
            else:
                raise serializers.ValidationError(
                    _('Une erreur inattendue s\'est produite. Veuillez réessayer.')
                ) from err


class LoginSerializer(serializers.Serializer):
    """
    Serializer pour l'authentification AquaCare.

    Supporte deux méthodes de connexion :
    1. login_name + password (nom d'entreprise ou "prénom nom")
    2. phone_number + password (numéro de téléphone)
    """
    login_name = serializers.CharField(
        required=False,
        help_text="Nom de l'entreprise OU nom complet de la personne (ex: 'Jean Farmer')"
    )
    phone_number = serializers.CharField(
        required=False,
        help_text="Numéro de téléphone (format: +237XXXXXXXXX)"
    )
    password = serializers.CharField(write_only=True, required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        login_name = attrs.get('login_name')
        phone_number = attrs.get('phone_number')
        password = attrs.get('password')

        if not login_name and not phone_number:
            raise serializers.ValidationError(
                _("Veuillez fournir soit le nom de connexion soit le numéro de téléphone.")
            )

        if not password:
            raise serializers.ValidationError(_("Le mot de passe est requis."))

        try:
            user = AuthApplicationService.authenticate_user(
                login_name=login_name,
                phone_number=phone_number,
                password=password,
            )
        except AmbiguousCredentialsError as err:
            raise serializers.ValidationError(
                _(
                    "Identifiants invalides. Vérifiez vos informations ou utilisez "
                    "votre numéro de téléphone si votre nom de connexion est ambigu."
                )
            ) from err
        except InvalidCredentialsError as err:
            error_msg = _(
                "Identifiants invalides. Vérifiez vos informations ou utilisez "
                "votre numéro de téléphone si votre nom de connexion est ambigu."
            )
            raise serializers.ValidationError(error_msg) from err

        attrs['user'] = user
        return attrs


class LogoutSerializer(serializers.Serializer):
    """Serializer de validation pour la deconnexion JWT."""

    refresh = serializers.CharField(
        required=True,
        help_text="Token de rafraichissement a invalider.",
    )


class FarmProfileSerializer(serializers.ModelSerializer):
    """
    Serializer pour les profils de fermes AquaCare.
    """
    is_certified = serializers.BooleanField(read_only=True)
    certification_status_display = serializers.CharField(
        source='get_certification_status_display', read_only=True
    )
    default_feed_price_per_kg = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        required=False,
        write_only=True,
    )
    annual_production_target_kg = serializers.SerializerMethodField()
    num_cycles_per_year = serializers.SerializerMethodField()
    setup_infrastructure_type = serializers.SerializerMethodField()
    setup_unit_count = serializers.SerializerMethodField()
    setup_unit_volume_m3 = serializers.SerializerMethodField()
    setup_unit_surface_m2 = serializers.SerializerMethodField()
    setup_species = serializers.SerializerMethodField()
    fingerlings_cost_per_unit_fcfa = serializers.SerializerMethodField()
    planned_selling_price_per_kg_fcfa = serializers.SerializerMethodField()
    farm_setup_completed = serializers.SerializerMethodField()

    class Meta:
        model = FarmProfile
        fields = (
            'id', 'farm_name', 'certification_status',
            'total_ponds', 'total_area_m2', 'water_source', 'main_species',
            'annual_production_kg', 'default_feed_price_per_kg',
            'latitude', 'longitude', 'location_address',
            # Champs setup élevage
            'annual_production_target_kg', 'num_cycles_per_year',
            'setup_infrastructure_type', 'setup_unit_count',
            'setup_unit_volume_m3', 'setup_unit_surface_m2',
            'setup_species', 'fingerlings_cost_per_unit_fcfa',
            'planned_selling_price_per_kg_fcfa', 'farm_setup_completed',
            'created_at', 'updated_at',
            'is_certified', 'certification_status_display'
        )
        read_only_fields = (
            'id', 'certification_status',
            'annual_production_target_kg', 'num_cycles_per_year',
            'setup_infrastructure_type', 'setup_unit_count',
            'setup_unit_volume_m3', 'setup_unit_surface_m2',
            'setup_species', 'fingerlings_cost_per_unit_fcfa',
            'planned_selling_price_per_kg_fcfa', 'farm_setup_completed',
            'created_at', 'updated_at', 'is_certified', 'certification_status_display'
        )

    def _get_plan_data(self, obj: FarmProfile) -> dict[str, Any]:
        return FarmProductionPlanService.get_plan_data(obj)

    @staticmethod
    def _format_decimal(value: Any) -> str | None:
        return f"{value:.2f}" if isinstance(value, Decimal) else value

    def get_annual_production_target_kg(self, obj: FarmProfile) -> Any:
        return self._format_decimal(self._get_plan_data(obj)["annual_production_target_kg"])

    def get_num_cycles_per_year(self, obj: FarmProfile) -> Any:
        return self._get_plan_data(obj)["num_cycles_per_year"]

    def get_setup_infrastructure_type(self, obj: FarmProfile) -> Any:
        return self._get_plan_data(obj)["setup_infrastructure_type"]

    def get_setup_unit_count(self, obj: FarmProfile) -> Any:
        return self._get_plan_data(obj)["setup_unit_count"]

    def get_setup_unit_volume_m3(self, obj: FarmProfile) -> Any:
        return self._format_decimal(self._get_plan_data(obj)["setup_unit_volume_m3"])

    def get_setup_unit_surface_m2(self, obj: FarmProfile) -> Any:
        return self._format_decimal(self._get_plan_data(obj)["setup_unit_surface_m2"])

    def get_setup_species(self, obj: FarmProfile) -> Any:
        return self._get_plan_data(obj)["setup_species"]

    def get_fingerlings_cost_per_unit_fcfa(self, obj: FarmProfile) -> Any:
        return self._format_decimal(self._get_plan_data(obj)["fingerlings_cost_per_unit_fcfa"])

    def get_planned_selling_price_per_kg_fcfa(self, obj: FarmProfile) -> Any:
        return self._format_decimal(self._get_plan_data(obj)["planned_selling_price_per_kg_fcfa"])

    def get_farm_setup_completed(self, obj: FarmProfile) -> bool:
        return bool(self._get_plan_data(obj)["farm_setup_completed"])

    def to_representation(self, instance: FarmProfile) -> dict[str, Any]:
        data = super().to_representation(instance)
        plan_data = self._get_plan_data(instance)
        data["default_feed_price_per_kg"] = self._format_decimal(
            plan_data["default_feed_price_per_kg"]
        )
        return data

    def validate_farm_name(self, value: str) -> str:
        if not value or not value.strip():
            raise serializers.ValidationError(_("Le nom de la ferme ne peut pas être vide."))
        return value.strip()

    def validate_total_area_m2(self, value: Decimal | None) -> Decimal | None:
        if value is not None and value < 0:
            raise serializers.ValidationError(_("La superficie totale ne peut pas être négative."))
        return value

    def validate_default_feed_price_per_kg(self, value: Decimal | None) -> Decimal | None:
        if value is not None and value <= 0:
            raise serializers.ValidationError(_("Le prix d'aliment par défaut doit être supérieur à 0."))
        return value

    def validate_latitude(self, value: Decimal | None) -> Decimal | None:
        if value is not None and not Decimal('-90') <= value <= Decimal('90'):
            raise serializers.ValidationError(_("La latitude doit être comprise entre -90 et 90."))
        return value

    def validate_longitude(self, value: Decimal | None) -> Decimal | None:
        if value is not None and not Decimal('-180') <= value <= Decimal('180'):
            raise serializers.ValidationError(_("La longitude doit être comprise entre -180 et 180."))
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        errors = build_farm_profile_invariant_errors(attrs, self.instance)
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class FarmSetupSerializer(serializers.Serializer):
    """
    Serializer dédié au flux "Créer mon élevage".

    Valide et persiste les données du formulaire annuel (espèce, infrastructure,
    objectifs de production, paramètres économiques).
    Marque farm_setup_completed=True une fois sauvegardé.
    """
    setup_species = serializers.ChoiceField(
        choices=['tilapia', 'clarias', 'autre'],
        required=False,
    )
    setup_infrastructure_type = serializers.ChoiceField(
        choices=['etang', 'cage_flottante', 'bac_hors_sol', 'bac_en_sol'],
        required=False,
    )
    setup_unit_count = serializers.IntegerField(required=False, allow_null=True)
    setup_unit_volume_m3 = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    setup_unit_surface_m2 = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    annual_production_target_kg = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    num_cycles_per_year = serializers.ChoiceField(
        choices=[2, 3],
        required=False,
        allow_null=True,
    )
    fingerlings_cost_per_unit_fcfa = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    planned_selling_price_per_kg_fcfa = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        allow_null=True,
    )

    def validate_annual_production_target_kg(self, value: Any) -> Any:
        if value is not None and value <= 0:
            raise serializers.ValidationError(
                _("La production cible doit être supérieure à 0.")
            )
        return value

    def validate_setup_unit_count(self, value: Any) -> Any:
        if value is not None and value <= 0:
            raise serializers.ValidationError(
                _("Le nombre d'unités doit être supérieur à 0.")
            )
        return value

    def validate_setup_unit_volume_m3(self, value: Any) -> Any:
        if value is not None and value <= 0:
            raise serializers.ValidationError(
                _("Le volume par unité doit être supérieur à 0.")
            )
        return value

    def validate_setup_unit_surface_m2(self, value: Any) -> Any:
        if value is not None and value <= 0:
            raise serializers.ValidationError(
                _("La surface par unité doit être supérieure à 0.")
            )
        return value

    def validate_fingerlings_cost_per_unit_fcfa(self, value: Any) -> Any:
        if value is not None and value < 0:
            raise serializers.ValidationError(
                _("Le coût par alevin ne peut pas être négatif.")
            )
        return value

    def validate_planned_selling_price_per_kg_fcfa(self, value: Any) -> Any:
        if value is not None and value <= 0:
            raise serializers.ValidationError(
                _("Le prix de vente prévu doit être supérieur à 0.")
            )
        return value

    def validate_num_cycles_per_year(self, value: Any) -> int | None:
        return int(value) if value is not None else None

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        plan = None
        if self.instance is not None:
            try:
                plan = self.instance.production_plan
            except ObjectDoesNotExist:
                plan = None
        errors = FarmSetupRules.build_errors(attrs, plan)
        if errors:
            raise serializers.ValidationError(errors)

        return attrs


class AnnualSimulationInputSerializer(serializers.Serializer):
    """
    Serializer de validation pour l'endpoint de simulation annuelle.
    Ne persiste rien — calcule uniquement.
    """
    species = serializers.ChoiceField(
        choices=['tilapia', 'clarias'],
        help_text="Espèce : 'tilapia' ou 'clarias'"
    )
    annual_production_target_kg = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal('1'),
        help_text="Production annuelle cible en kg"
    )
    num_cycles = serializers.ChoiceField(
        choices=[2, 3],
        help_text="Nombre de cycles par an : 2 ou 3"
    )
    start_date = serializers.DateField(
        required=False,
        allow_null=True,
        help_text="Date de démarrage du premier cycle (YYYY-MM-DD)"
    )
    selling_price_per_kg_fcfa = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=Decimal('1'),
        help_text="Prix de vente estimé (FCFA/kg)"
    )
    fingerlings_cost_per_unit_fcfa = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=Decimal('0'),
        help_text="Coût par alevin (FCFA)"
    )
    other_costs_fcfa_per_year = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        default=Decimal('0'),
        min_value=Decimal('0'),
        help_text="Autres charges annuelles (FCFA)"
    )
    target_harvest_weight_g = serializers.DecimalField(
        max_digits=8,
        decimal_places=1,
        required=False,
        allow_null=True,
        min_value=Decimal('50'),
        max_value=Decimal('5000'),
        help_text="Poids cible à la récolte (g)"
    )
    expected_survival_rate_pct = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=Decimal('1'),
        max_value=Decimal('100'),
        help_text="Taux de survie attendu (%, ex: 85)"
    )
    total_fingerlings_count = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
        help_text="Nombre total d'alevins achetés sur l'année (tous cycles confondus)"
    )

    def validate_num_cycles(self, value: Any) -> int:
        return int(value)


class AnnualSimulationCycleBreakdownSerializer(serializers.Serializer):
    """Contrat de detail par cycle retourne par la simulation annuelle."""

    cycle_num = serializers.IntegerField(read_only=True)
    production_kg = serializers.FloatField(read_only=True)
    start_date_estimate = serializers.DateField(read_only=True)
    end_date_estimate = serializers.DateField(read_only=True)
    duration_days = serializers.IntegerField(read_only=True)
    feed_bags_total = serializers.IntegerField(read_only=True)
    feed_cost_fcfa = serializers.FloatField(read_only=True)
    fingerlings_cost_fcfa = serializers.FloatField(read_only=True)
    initial_fish_count = serializers.IntegerField(read_only=True)


class AnnualSimulationResponseSerializer(serializers.Serializer):
    """Contrat de reponse stable de la simulation annuelle aquaculture."""

    species = serializers.ChoiceField(choices=['tilapia', 'clarias'], read_only=True)
    num_cycles = serializers.IntegerField(read_only=True)
    annual_production_target_kg = serializers.FloatField(read_only=True)
    annual_revenue_fcfa = serializers.FloatField(read_only=True)
    annual_feed_cost_fcfa = serializers.FloatField(read_only=True)
    annual_fingerlings_cost_fcfa = serializers.FloatField(read_only=True)
    annual_other_costs_fcfa = serializers.FloatField(read_only=True)
    annual_total_cost_fcfa = serializers.FloatField(read_only=True)
    aquacare_fee_fcfa = serializers.FloatField(read_only=True)
    annual_net_profit_fcfa = serializers.FloatField(read_only=True)
    annual_roi_pct = serializers.FloatField(read_only=True)
    production_per_cycle_kg = serializers.FloatField(read_only=True)
    cycle_duration_days = serializers.IntegerField(read_only=True)
    feed_bags_per_cycle = serializers.IntegerField(read_only=True)
    initial_fish_count_per_cycle = serializers.IntegerField(read_only=True)
    cycles_breakdown = AnnualSimulationCycleBreakdownSerializer(many=True, read_only=True)


class UserProfileSerializer(serializers.ModelSerializer):
    """
    Serializer pour le profil utilisateur avec informations de ferme.
    """
    full_name = serializers.CharField(read_only=True)
    login_name = serializers.CharField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    is_individual = serializers.BooleanField(read_only=True)
    is_company = serializers.BooleanField(read_only=True)

    farm_profile = FarmProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = (
            'id', 'phone_number', 'email', 'first_name', 'last_name',
            'business_name', 'account_type', 'is_verified', 'language_preference',
            'full_name', 'login_name', 'display_name', 'is_individual', 'is_company',
            'activity_type', 'region', 'department', 'district', 'city', 'neighborhood',
            'legal_status', 'promoter_name', 'age_group', 'intervention_zone',
            'farm_profile', 'date_joined', 'is_active'
        )
        read_only_fields = (
            'id', 'phone_number', 'account_type', 'is_verified', 'date_joined', 'is_active',
            'full_name', 'login_name', 'display_name', 'is_individual', 'is_company',
            'farm_profile'
        )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        return validate_user_account_invariants(attrs, self.instance)


class AuthTokenSerializer(serializers.Serializer):
    """Paire de tokens JWT retournee apres authentification."""

    refresh = serializers.CharField(read_only=True)
    access = serializers.CharField(read_only=True)


class AuthSuccessResponseSerializer(serializers.Serializer):
    """Contrat DRF commun des reponses register/login."""

    user = UserProfileSerializer(read_only=True)
    tokens = AuthTokenSerializer(read_only=True)
    message = serializers.CharField(read_only=True)


class MessageResponseSerializer(serializers.Serializer):
    """Message simple de succes pour les endpoints d'action."""

    message = serializers.CharField(read_only=True)


class ErrorResponseSerializer(serializers.Serializer):
    """Payload d'erreur metier simple pour les endpoints d'action."""

    error = serializers.CharField(read_only=True)


class DetailErrorResponseSerializer(serializers.Serializer):
    """Payload d'erreur DRF/SimpleJWT pour authentification, throttling et permissions."""

    detail = serializers.CharField(read_only=True)
    code = serializers.CharField(read_only=True, required=False)


class ValidationErrorResponseSerializer(serializers.Serializer):
    """Payload d'erreur de validation DRF avec erreurs par champ ou non_field_errors."""

    non_field_errors = serializers.ListField(
        child=serializers.CharField(),
        read_only=True,
        required=False,
    )


class AccountDeletionSerializer(serializers.Serializer):
    """
    Serializer de confirmation suppression de compte.
    """
    confirm = serializers.BooleanField(
        required=True,
        help_text="Doit être true pour confirmer la suppression du compte."
    )

    def validate_confirm(self, value: bool) -> bool:
        if value is not True:
            raise serializers.ValidationError(_("Confirmation explicite requise."))
        return value


def _ensure_token_user_is_active(token: object) -> None:
    """Refuse les tokens de comptes supprimés ou désactivés."""
    user_id = token.get(api_settings.USER_ID_CLAIM) if hasattr(token, 'get') else None
    if not user_id or not User.objects.filter(pk=user_id, is_active=True).exists():
        raise InvalidToken(_("Token invalide ou compte désactivé."))


class AccountsTokenRefreshSerializer(TokenRefreshSerializer):
    """Refresh JWT en vérifiant l'état métier du compte accounts."""

    def validate(self, attrs: dict[str, Any]) -> dict[str, str]:
        refresh = RefreshToken(attrs["refresh"])
        _ensure_token_user_is_active(refresh)
        return super().validate(attrs)


class AccountsTokenVerifySerializer(TokenVerifySerializer):
    """Verify JWT en vérifiant l'état métier du compte accounts."""

    def validate(self, attrs: dict[str, Any]) -> dict[str, object]:
        token = UntypedToken(attrs["token"])
        _ensure_token_user_is_active(token)
        return super().validate(attrs)
