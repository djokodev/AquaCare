import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from django.utils.translation import gettext as _
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .models import FarmProfile, User
from .permissions import IsOwnerOrReadOnly
from .serializers import (
    AccountDeletionSerializer,
    AccountsTokenRefreshSerializer,
    AccountsTokenVerifySerializer,
    AnnualSimulationInputSerializer,
    AnnualSimulationResponseSerializer,
    AuthSuccessResponseSerializer,
    ErrorResponseSerializer,
    FarmProfileSerializer,
    FarmSetupSerializer,
    LoginSerializer,
    LogoutSerializer,
    MessageResponseSerializer,
    UserProfileSerializer,
    UserRegistrationSerializer,
)
from .schemas import (
    AUTH_REQUIRED_RESPONSE,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
    THROTTLED_RESPONSE,
    TOKEN_ERROR_RESPONSE,
    VALIDATION_ERROR_RESPONSE,
)
from .services.account_deletion_service import AccountDeletionService
from .services.annual_simulation_service import AnnualSimulationService
from .services.auth_application_service import AuthApplicationService, InvalidRefreshTokenError
from .services.farm_setup_service import FarmSetupService
from .services.profile_mutation_service import AccountProfileMutationService
from .services.profile_query_service import ProfileQueryService
from .throttles import (
    AccountFarmSetupThrottle,
    AccountLoginGlobalThrottle,
    AccountLoginThrottle,
    AccountRegisterThrottle,
    AccountSimulationThrottle,
    AccountTokenThrottle,
    SensitiveAccountActionThrottle,
)

logger = logging.getLogger(__name__)

def _user_id(user) -> str:
    return str(user.pk)


def _auth_method_from_payload(payload) -> str:
    if payload.get('phone_number'):
        return 'phone_number'
    if payload.get('login_name'):
        return 'login_name'
    return 'unknown'


def _raise_drf_validation_error(error: DjangoValidationError) -> None:
    if hasattr(error, 'message_dict'):
        raise DRFValidationError(error.message_dict) from error
    if hasattr(error, 'messages'):
        raise DRFValidationError(error.messages) from error
    raise DRFValidationError(str(error)) from error


class RegisterView(generics.CreateAPIView):
    """
    Inscription des nouveaux pisciculteurs AquaCare.
    
    Permet aux pisciculteurs de créer un nouveau compte (individuel ou entreprise)
    et génère automatiquement :
    - Un profil ferme associé
    - Des tokens JWT (access + refresh) pour l'authentification
    
    **Types de comptes supportés :**
    - `individual` : Personne physique (first_name, last_name, age_group requis)
    - `company` : Entreprise (business_name, legal_status, promoter_name requis)
    
    **Validation automatique :**
    - Normalisation du numéro de téléphone (+237XXXXXXXXX)
    - Vérification de l'unicité du téléphone
    - Validation des champs métier selon le type de compte
    """
    queryset = User.objects.with_farm_profile()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AccountRegisterThrottle]
    
    @extend_schema(
        summary="Inscription d'un nouveau pisciculteur",
        description=(
            "Crée un compte utilisateur (individuel ou entreprise) avec génération "
            "automatique du profil ferme et des tokens JWT"
        ),
        request=UserRegistrationSerializer,
        examples=[
            OpenApiExample(
                'Personne physique',
                value={
                    "phone_number": "+237678901234",
                    "email": "jean.farmer@email.com",
                    "first_name": "Jean",
                    "last_name": "Farmer",
                    "account_type": "individual",
                    "age_group": "26_35",
                    "activity_type": "poisson_table",
                    "region": "littoral",
                    "password": "MotDePasse123",
                    "password_confirm": "MotDePasse123"
                },
                request_only=True
            ),
            OpenApiExample(
                'Entreprise',
                value={
                    "phone_number": "+237699887766",
                    "email": "contact@aquaferme.cm",
                    "business_name": "AquaFerme SARL",
                    "account_type": "company",
                    "legal_status": "sarl",
                    "promoter_name": "Marie Aquaculture",
                    "activity_type": "mixte",
                    "region": "centre",
                    "password": "EntrepriseSecure456",
                    "password_confirm": "EntrepriseSecure456"
                },
                request_only=True
            )
        ],
        responses={
            201: OpenApiResponse(
                response=AuthSuccessResponseSerializer,
                description="Compte créé avec succès",
            ),
            400: VALIDATION_ERROR_RESPONSE,
            429: THROTTLED_RESPONSE,
        }
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        logger.info(
            "Account registered",
            extra={
                "event": "accounts.register.succeeded",
                "endpoint": request.path,
                "user_id": _user_id(user),
                "account_type": user.account_type,
                "status_code": status.HTTP_201_CREATED,
            },
        )
        auth_result = AuthApplicationService.build_auth_success_result(
            user=user,
            message=_('Compte créé avec succès'),
        )
        response_serializer = AuthSuccessResponseSerializer(
            auth_result.to_payload()
        )

        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
        )


class LoginView(generics.GenericAPIView):
    """
    Authentification flexible des pisciculteurs AquaCare.
    
    Système de connexion supportant deux méthodes :
    1. **Nom d'affichage + mot de passe** (UX optimisée)
    2. **Numéro de téléphone + mot de passe** (fallback)
    
    **Méthode 1 - Identifiants par nom :**
    - Personnes physiques : "Jean Farmer" (first_name + last_name)
    - Entreprises : "AquaFerme SARL" (business_name)
    
    **Méthode 2 - Identifiants par téléphone :**
    - Format : "+237XXXXXXXXX" + mot de passe
    
    **Réponse :**
    - Profil utilisateur simplifié
    - Tokens JWT (access valide 15 min, refresh 7 jours)
    - Message de confirmation
    """
    serializer_class = LoginSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AccountLoginGlobalThrottle, AccountLoginThrottle]
    
    @extend_schema(
        summary="Connexion utilisateur AquaCare",
        description=(
            "Authentification flexible avec deux méthodes : nom d'affichage "
            "OU numéro de téléphone + mot de passe"
        ),
        request=LoginSerializer,
        examples=[
            OpenApiExample(
                'Connexion personne physique par nom',
                value={
                    "login_name": "Jean Farmer",
                    "password": "MotDePasse123"
                },
                request_only=True
            ),
            OpenApiExample(
                'Connexion entreprise par nom',
                value={
                    "login_name": "AquaFerme SARL",
                    "password": "EntrepriseSecure456"
                },
                request_only=True
            ),
            OpenApiExample(
                'Connexion par numéro de téléphone',
                value={
                    "phone_number": "+237691234569",
                    "password": "MotDePasse123"
                },
                request_only=True
            )
        ],
        responses={
            200: OpenApiResponse(
                response=AuthSuccessResponseSerializer,
                description="Connexion réussie avec tokens JWT",
            ),
            400: VALIDATION_ERROR_RESPONSE,
            429: THROTTLED_RESPONSE,
        }
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data['user']
        logger.info(
            "Account login succeeded",
            extra={
                "event": "accounts.login.succeeded",
                "endpoint": request.path,
                "user_id": _user_id(user),
                "auth_method": _auth_method_from_payload(request.data),
                "status_code": status.HTTP_200_OK,
            },
        )
        auth_result = AuthApplicationService.build_auth_success_result(
            user=user,
            message=_('Connexion réussie'),
        )
        response_serializer = AuthSuccessResponseSerializer(
            auth_result.to_payload()
        )
        return Response(response_serializer.data)


@extend_schema_view(
    get=extend_schema(
        responses={
            200: UserProfileSerializer,
            401: AUTH_REQUIRED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    ),
    put=extend_schema(
        request=UserProfileSerializer,
        responses={
            200: UserProfileSerializer,
            400: VALIDATION_ERROR_RESPONSE,
            401: AUTH_REQUIRED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    ),
    patch=extend_schema(
        request=UserProfileSerializer,
        responses={
            200: UserProfileSerializer,
            400: VALIDATION_ERROR_RESPONSE,
            401: AUTH_REQUIRED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: NOT_FOUND_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    ),
)
class ProfileView(generics.RetrieveUpdateAPIView):
    """
    Gestion complète du profil utilisateur AquaCare.
    
    **GET :** Récupère le profil complet incluant :
    - Informations personnelles/entreprise
    - Données de localisation (région, département, etc.)
    - Profil ferme associé avec statut de certification
    - Propriétés calculées (display_name, is_individual, etc.)
    
    **PUT/PATCH :** Modification des champs autorisés :
    - Informations contact (email, localisation)
    - Préférences (langue)
    - Zone d'intervention
    
    **Restrictions :**
    - phone_number : Non modifiable (identifiant unique)
    - certification_status : Réservé aux admins AquaCare
    """
    queryset = User.objects.with_farm_profile()
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrReadOnly]
    
    def get_object(self):
        return ProfileQueryService.get_user_profile(self.request.user.pk)

    def perform_update(self, serializer):
        try:
            user = AccountProfileMutationService.update_user_profile(
                user_id=self.request.user.pk,
                updates=serializer.validated_data,
            )
        except DjangoValidationError as err:
            _raise_drf_validation_error(err)
        serializer.instance = user
        logger.info(
            "Account profile updated",
            extra={
                "event": "accounts.profile.updated",
                "endpoint": self.request.path,
                "user_id": _user_id(user),
                "status_code": status.HTTP_200_OK,
            },
        )


class LogoutView(generics.GenericAPIView):
    """
    Déconnexion sécurisée des pisciculteurs AquaCare.
    
    Invalide le refresh token côté serveur pour empêcher toute réutilisation.
    Cette approche garantit une déconnexion complète et sécurisée.
    
    **Processus de déconnexion :**
    1. Réception du refresh token depuis le client
    2. Blacklist du token pour invalidation permanente
    3. Confirmation de déconnexion
    
    **Sécurité :**
    - Prévient la réutilisation de tokens compromis
    - Déconnexion immédiate côté serveur
    - Compatible avec l'architecture JWT stateless
    """
    serializer_class = LogoutSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveAccountActionThrottle]
    
    @extend_schema(
        summary="Déconnexion sécurisée",
        description="Invalide le refresh token pour une déconnexion complète et sécurisée",
        request=LogoutSerializer,
        examples=[
            OpenApiExample(
                'Déconnexion standard',
                value={
                    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                },
                request_only=True
            )
        ],
        responses={
            200: OpenApiResponse(
                response=MessageResponseSerializer,
                description="Déconnexion réussie",
            ),
            400: OpenApiResponse(
                response=ErrorResponseSerializer,
                description="Token invalide",
            ),
            401: AUTH_REQUIRED_RESPONSE,
            429: THROTTLED_RESPONSE,
        }
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refresh_token = serializer.validated_data['refresh']

        try:
            AuthApplicationService.blacklist_refresh_token(
                refresh_token,
                expected_user=request.user,
            )
            logger.info(
                "Account logout succeeded",
                extra={
                    "event": "accounts.logout.succeeded",
                    "endpoint": request.path,
                    "user_id": _user_id(request.user),
                    "status_code": status.HTTP_200_OK,
                },
            )
            response_serializer = MessageResponseSerializer(
                {'message': _('Déconnexion réussie')}
            )
            return Response(
                response_serializer.data,
                status=status.HTTP_200_OK,
            )

        except InvalidRefreshTokenError:
            logger.warning(
                "Account logout rejected",
                extra={
                    "event": "accounts.logout.rejected",
                    "endpoint": request.path,
                    "user_id": _user_id(request.user),
                    "reason_code": "invalid_refresh_token",
                    "status_code": status.HTTP_400_BAD_REQUEST,
                },
            )
            response_serializer = ErrorResponseSerializer(
                {'error': _('Token invalide')}
            )
            return Response(
                response_serializer.data,
                status=status.HTTP_400_BAD_REQUEST,
            )


class AccountsTokenRefreshView(TokenRefreshView):
    """Renouvelle un token seulement pour un compte accounts actif."""

    serializer_class = AccountsTokenRefreshSerializer
    throttle_classes = [AccountTokenThrottle]

    @extend_schema(
        request=AccountsTokenRefreshSerializer,
        responses={
            200: AccountsTokenRefreshSerializer,
            400: VALIDATION_ERROR_RESPONSE,
            401: TOKEN_ERROR_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    )
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        logger.info(
            "Accounts token refreshed",
            extra={
                "event": "accounts.token.refresh.succeeded",
                "endpoint": request.path,
                "status_code": response.status_code,
            },
        )
        return response


class AccountsTokenVerifyView(TokenVerifyView):
    """Vérifie un token seulement pour un compte accounts actif."""

    serializer_class = AccountsTokenVerifySerializer
    throttle_classes = [AccountTokenThrottle]

    @extend_schema(
        request=AccountsTokenVerifySerializer,
        responses={
            200: OpenApiResponse(description="Token valide, réponse vide."),
            400: VALIDATION_ERROR_RESPONSE,
            401: TOKEN_ERROR_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    )
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        logger.info(
            "Accounts token verified",
            extra={
                "event": "accounts.token.verify.succeeded",
                "endpoint": request.path,
                "status_code": response.status_code,
            },
        )
        return response


@extend_schema_view(
    get=extend_schema(
        responses={
            200: FarmProfileSerializer,
            401: AUTH_REQUIRED_RESPONSE,
            404: NOT_FOUND_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    ),
    put=extend_schema(
        request=FarmProfileSerializer,
        responses={
            200: FarmProfileSerializer,
            400: VALIDATION_ERROR_RESPONSE,
            401: AUTH_REQUIRED_RESPONSE,
            404: NOT_FOUND_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    ),
    patch=extend_schema(
        request=FarmProfileSerializer,
        responses={
            200: FarmProfileSerializer,
            400: VALIDATION_ERROR_RESPONSE,
            401: AUTH_REQUIRED_RESPONSE,
            404: NOT_FOUND_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    ),
)
class FarmProfileView(generics.RetrieveUpdateAPIView):
    """
    Gestion spécialisée du profil ferme piscicole.
    
    **GET :** Consultation des informations techniques :
    - Infrastructure : nombre de bassins, superficie totale
    - Production : espèces élevées, production annuelle
    - Ressources : source d'eau utilisée
    - Certification : statut géré par les admins AquaCare
    
    **PUT/PATCH :** Modification des données techniques :
    - Informations sur les bassins et la superficie
    - Détails de production et espèces
    - Source d'approvisionnement en eau
    
    **Restrictions :**
    - certification_status : Modification réservée aux administrateurs
    - created_at/updated_at : Timestamps automatiques
    - id : UUID non modifiable pour la synchronisation mobile
    """
    queryset = FarmProfile.objects.with_user()
    serializer_class = FarmProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_object(self):
        try:
            return ProfileQueryService.get_farm_profile(self.request.user.pk)
        except FarmProfile.DoesNotExist:
            raise Http404

    def perform_update(self, serializer):
        try:
            farm = AccountProfileMutationService.update_farm_profile(
                user_id=self.request.user.pk,
                updates=serializer.validated_data,
            )
        except DjangoValidationError as err:
            _raise_drf_validation_error(err)
        serializer.instance = farm
        logger.info(
            "Farm profile updated",
            extra={
                "event": "accounts.farm_profile.updated",
                "endpoint": self.request.path,
                "user_id": _user_id(self.request.user),
                "farm_id": str(farm.pk),
                "status_code": status.HTTP_200_OK,
            },
        )


class AccountDeletionView(generics.GenericAPIView):
    """
    Suppression logique du compte utilisateur.

    Comportement:
    - Désactive le compte (`is_active=False`)
    - Anonymise les données personnelles
    - Marque le profil ferme comme supprimé
    - Nettoie les tokens JWT/push connus
    """

    serializer_class = AccountDeletionSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveAccountActionThrottle]

    @extend_schema(
        summary="Supprimer définitivement mon compte",
        description="Désactive et anonymise le compte utilisateur après confirmation explicite.",
        request=AccountDeletionSerializer,
        responses={
            200: OpenApiResponse(
                response=MessageResponseSerializer,
                description="Compte supprimé/anonymisé avec succès",
            ),
            400: VALIDATION_ERROR_RESPONSE,
            401: AUTH_REQUIRED_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        AccountDeletionService.anonymize_user_account(request.user)
        logger.info(
            "Account deletion completed",
            extra={
                "event": "accounts.delete.succeeded",
                "endpoint": request.path,
                "user_id": _user_id(request.user),
                "status_code": status.HTTP_200_OK,
            },
        )
        response_serializer = MessageResponseSerializer(
            {"message": _("Compte supprimé avec succès.")}
        )

        return Response(
            response_serializer.data,
            status=status.HTTP_200_OK,
        )


class FarmSetupView(generics.UpdateAPIView):
    """
    POST/PATCH — Sauvegarde le formulaire "Créer mon élevage".

    Persiste les données annuelles dans FarmProfile et marque
    farm_setup_completed=True pour débloquer la navigation vers le dashboard.
    """
    serializer_class = FarmSetupSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AccountFarmSetupThrottle]
    http_method_names = ['patch', 'post']

    def get_object(self):
        try:
            return ProfileQueryService.get_farm_profile(self.request.user.pk)
        except FarmProfile.DoesNotExist:
            raise Http404

    @extend_schema(
        summary="Mettre à jour la configuration initiale d'élevage",
        description=(
            "Met à jour partiellement le formulaire Créer mon élevage. Une ferme "
            "incomplète ne peut pas être marquée comme configurée sans tous les "
            "champs requis."
        ),
        request=FarmSetupSerializer,
        responses={
            200: OpenApiResponse(
                response=FarmProfileSerializer,
                description="Profil ferme complet après sauvegarde du setup.",
            ),
            400: VALIDATION_ERROR_RESPONSE,
            401: AUTH_REQUIRED_RESPONSE,
            404: NOT_FOUND_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    )
    def patch(self, request, *args, **kwargs):
        farm = self.get_object()
        serializer = self.get_serializer(farm, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            updated = FarmSetupService.complete_setup(
                farm,
                serializer.validated_data,
            )
        except DjangoValidationError as err:
            _raise_drf_validation_error(err)
        logger.info(
            "Farm setup completed",
            extra={
                "event": "accounts.farm_setup.completed",
                "endpoint": request.path,
                "user_id": _user_id(request.user),
                "farm_id": str(updated.pk),
                "status_code": status.HTTP_200_OK,
            },
        )
        return Response(
            FarmProfileSerializer(updated).data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        summary="Compléter la configuration initiale d'élevage",
        description=(
            "Sauvegarde le formulaire Créer mon élevage et retourne le profil ferme "
            "complet, incluant farm_setup_completed et les champs setup readonly."
        ),
        request=FarmSetupSerializer,
        responses={
            200: OpenApiResponse(
                response=FarmProfileSerializer,
                description="Profil ferme complet après completion du setup.",
            ),
            400: VALIDATION_ERROR_RESPONSE,
            401: AUTH_REQUIRED_RESPONSE,
            404: NOT_FOUND_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    )
    def post(self, request, *args, **kwargs):
        return self.patch(request, *args, **kwargs)


class AnnualSimulationView(generics.GenericAPIView):
    """
    POST — Calcule une simulation annuelle sans rien persister.

    Reçoit les paramètres de production et retourne :
    - Résumé annuel (revenus, coûts, bénéfice, ROI)
    - Frais d'accompagnement AquaCare (20 FCFA/kg)
    - Détail par cycle (production, sacs d'aliment, dates estimées)
    """
    serializer_class = AnnualSimulationInputSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AccountSimulationThrottle]

    @extend_schema(
        summary="Simulation annuelle de production",
        description=(
            "Calcule la rentabilité prévisionnelle sur l'année entière. "
            "Inclut les frais d'accompagnement AquaCare (20 FCFA/kg produit). "
            "Ne persiste aucune donnée. Endpoint legacy, utilisez "
            "/api/aquaculture/production-plan/setup/ pour sauvegarder."
        ),
        request=AnnualSimulationInputSerializer,
        responses={
            200: OpenApiResponse(
                response=AnnualSimulationResponseSerializer,
                description="Simulation annuelle calculée sans persistance.",
            ),
            400: VALIDATION_ERROR_RESPONSE,
            401: AUTH_REQUIRED_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        result = AnnualSimulationService.simulate(
            species=data['species'],
            annual_production_target_kg=float(data['annual_production_target_kg']),
            num_cycles=data['num_cycles'],
            start_date=data.get('start_date'),
            selling_price_per_kg_fcfa=(
                float(data['selling_price_per_kg_fcfa'])
                if data.get('selling_price_per_kg_fcfa') else None
            ),
            fingerlings_cost_per_unit_fcfa=(
                float(data['fingerlings_cost_per_unit_fcfa'])
                if data.get('fingerlings_cost_per_unit_fcfa') else None
            ),
            other_costs_fcfa_per_year=float(data.get('other_costs_fcfa_per_year') or 0),
            target_harvest_weight_g=(
                float(data['target_harvest_weight_g'])
                if data.get('target_harvest_weight_g') else None
            ),
            expected_survival_rate_pct=(
                float(data['expected_survival_rate_pct'])
                if data.get('expected_survival_rate_pct') else None
            ),
            total_fingerlings_count=data.get('total_fingerlings_count'),
        )
        logger.info(
            "Annual simulation completed",
            extra={
                "event": "accounts.annual_simulation.completed",
                "endpoint": request.path,
                "user_id": _user_id(request.user),
                "status_code": status.HTTP_200_OK,
            },
        )
        return Response(result, status=status.HTTP_200_OK)
