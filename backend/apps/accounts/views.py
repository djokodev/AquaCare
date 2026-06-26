from django.http import Http404
from django.utils.translation import gettext as _
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from .models import FarmProfile, User
from .permissions import IsOwnerOrReadOnly
from .serializers import (
    AccountDeletionSerializer,
    AnnualSimulationInputSerializer,
    AuthSuccessResponseSerializer,
    ErrorResponseSerializer,
    FarmMapSerializer,
    FarmProfileSerializer,
    FarmSetupSerializer,
    LoginSerializer,
    LogoutSerializer,
    MessageResponseSerializer,
    UserProfileSerializer,
    UserRegistrationSerializer,
)
from .services import (
    AccountDeletionService,
    AnnualSimulationService,
    AuthApplicationService,
    InvalidRefreshTokenError,
    ProfileQueryService,
)
from .throttles import (
    AccountLoginThrottle,
    AccountRegisterThrottle,
    SensitiveAccountActionThrottle,
)


class RegisterView(generics.CreateAPIView):
    """
    🔐 Inscription des nouveaux pisciculteurs MAVECAM.
    
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
            400: OpenApiResponse(description="Erreurs de validation"),
        }
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
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
    Authentification flexible des pisciculteurs MAVECAM.
    
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
    throttle_classes = [AccountLoginThrottle]
    
    @extend_schema(
        summary="Connexion utilisateur MAVECAM",
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
            400: OpenApiResponse(description="Identifiants incorrects ou manquants"),
        }
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data['user']
        auth_result = AuthApplicationService.build_auth_success_result(
            user=user,
            message=_('Connexion réussie'),
        )
        response_serializer = AuthSuccessResponseSerializer(
            auth_result.to_payload()
        )
        return Response(response_serializer.data)


class ProfileView(generics.RetrieveUpdateAPIView):
    """
    👤 Gestion complète du profil utilisateur MAVECAM.
    
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
    - certification_status : Réservé aux admins MAVECAM
    """
    queryset = User.objects.with_farm_profile()
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrReadOnly]
    
    def get_object(self):
        return ProfileQueryService.get_user_profile(self.request.user.pk)


class LogoutView(generics.GenericAPIView):
    """
    Déconnexion sécurisée des pisciculteurs MAVECAM.
    
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
        }
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refresh_token = serializer.validated_data['refresh']

        try:
            AuthApplicationService.blacklist_refresh_token(refresh_token)
            response_serializer = MessageResponseSerializer(
                {'message': _('Déconnexion réussie')}
            )
            return Response(
                response_serializer.data,
                status=status.HTTP_200_OK,
            )

        except InvalidRefreshTokenError:
            response_serializer = ErrorResponseSerializer(
                {'error': _('Token invalide')}
            )
            return Response(
                response_serializer.data,
                status=status.HTTP_400_BAD_REQUEST,
            )

class FarmProfileView(generics.RetrieveUpdateAPIView):
    """
    Gestion spécialisée du profil ferme piscicole.
    
    **GET :** Consultation des informations techniques :
    - Infrastructure : nombre de bassins, superficie totale
    - Production : espèces élevées, production annuelle
    - Ressources : source d'eau utilisée
    - Certification : statut géré par les admins MAVECAM
    
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
            400: OpenApiResponse(description="Confirmation manquante"),
            401: OpenApiResponse(description="Authentification requise"),
        },
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        AccountDeletionService.anonymize_user_account(request.user)
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
    http_method_names = ['patch', 'post']

    def get_object(self):
        try:
            return ProfileQueryService.get_farm_profile(self.request.user.pk)
        except FarmProfile.DoesNotExist:
            raise Http404

    def patch(self, request, *args, **kwargs):
        farm = self.get_object()
        serializer = self.get_serializer(farm, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        return Response(
            FarmProfileSerializer(updated).data,
            status=status.HTTP_200_OK,
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

    @extend_schema(
        summary="Simulation annuelle de production",
        description=(
            "Calcule la rentabilité prévisionnelle sur l'année entière. "
            "Inclut les frais d'accompagnement AquaCare (20 FCFA/kg produit). "
            "Ne persiste aucune donnée — utilisez /farm/setup/ pour sauvegarder."
        ),
        request=AnnualSimulationInputSerializer,
        responses={200: dict},
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
        return Response(result, status=status.HTTP_200_OK)


class FarmMapView(generics.ListAPIView):
    """
    🗺️ Carte des fermes géolocalisées — réservé aux admins.

    Retourne toutes les fermes ayant des coordonnées GPS.
    Utilisé pour la carte Leaflet dans l'interface d'administration.

    **Filtres disponibles :**
    - `?region=centre` — filtre par région administrative
    - `?certification_status=certified` — filtre par statut

    **Permissions :** is_staff uniquement.
    """
    serializer_class = FarmMapSerializer
    permission_classes = [permissions.IsAdminUser]

    @extend_schema(
        summary="Carte des fermes géolocalisées (admin)",
        description="Retourne toutes les fermes ayant des coordonnées GPS. Réservé aux admins.",
        parameters=[
            OpenApiParameter('region', str, description='Filtre par région administrative (ex: centre, littoral)'),
            OpenApiParameter(
                'certification_status',
                str,
                description='Filtre par statut de certification (certified, pending, suspended, rejected)',
            ),
        ],
        responses={200: FarmMapSerializer(many=True)},
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        qs = (
            FarmProfile.objects
            .select_related('user')
            .filter(
                latitude__isnull=False,
                longitude__isnull=False,
                is_deleted=False,
            )
        )
        region = self.request.query_params.get('region')
        if region:
            qs = qs.filter(user__region=region)

        cert_status = self.request.query_params.get('certification_status')
        if cert_status:
            qs = qs.filter(certification_status=cert_status)

        return qs
