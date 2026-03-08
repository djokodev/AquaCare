import logging
from typing import TypedDict

from django.http import Http404
from django.utils.translation import gettext as _
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .models import FarmProfile, User
from .permissions import IsOwnerOrReadOnly
from .serializers import (
    AccountDeletionSerializer,
    FarmProfileSerializer,
    LoginSerializer,
    UserProfileSerializer,
    UserRegistrationSerializer,
)
from .services import AccountDeletionService
from .throttles import (
    AccountLoginThrottle,
    AccountRegisterThrottle,
    SensitiveAccountActionThrottle,
)

logger = logging.getLogger(__name__)


class AuthTokenPayload(TypedDict):
    refresh: str
    access: str


def build_auth_tokens(user: User) -> AuthTokenPayload:
    """Construit la paire de tokens JWT d'un utilisateur."""
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }


def build_auth_success_response(user: User, message: str) -> dict[str, object]:
    """Construit le payload HTTP commun aux vues register/login."""
    return {
        'user': UserProfileSerializer(user).data,
        'tokens': build_auth_tokens(user),
        'message': message,
    }


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
            201: OpenApiResponse(description="Compte créé avec succès"),
            400: OpenApiResponse(description="Erreurs de validation"),
        }
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        user = User.objects.with_farm_profile().get(pk=user.pk)

        return Response(
            build_auth_success_response(user, _('Compte créé avec succès')),
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
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
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AccountLoginThrottle]
    
    @extend_schema(
        summary="Connexion utilisateur MAVECAM",
        description=(
            "Authentification flexible avec deux méthodes : nom d'affichage "
            "OU numéro de téléphone + mot de passe"
        ),
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
            200: OpenApiResponse(description="Connexion réussie avec tokens JWT"),
            400: OpenApiResponse(description="Identifiants incorrects ou manquants"),
        }
    )
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data['user']
        return Response(build_auth_success_response(user, _('Connexion réussie')))


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
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrReadOnly]
    
    def get_object(self):
        return User.objects.with_farm_profile().get(pk=self.request.user.pk)


class LogoutView(APIView):
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
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveAccountActionThrottle]
    
    @extend_schema(
        summary="Déconnexion sécurisée",
        description="Invalide le refresh token pour une déconnexion complète et sécurisée",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'refresh': {
                        'type': 'string',
                        'description': 'Token de rafraîchissement à invalider'
                    }
                },
                'required': ['refresh']
            }
        },
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
            200: OpenApiResponse(description="Déconnexion réussie"),
            400: OpenApiResponse(description="Token invalide ou manquant"),
        }
    )
    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response(
                {'error': _('Token de rafraîchissement requis')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(
                {'message': _('Déconnexion réussie')},
                status=status.HTTP_200_OK,
            )

        except TokenError:
            return Response(
                {'error': _('Token invalide')},
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
    serializer_class = FarmProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_object(self):
        try:
            return FarmProfile.objects.with_user().get(user_id=self.request.user.pk)
        except FarmProfile.DoesNotExist:
            raise Http404


class AccountDeletionView(APIView):
    """
    Suppression logique du compte utilisateur.

    Comportement:
    - Désactive le compte (`is_active=False`)
    - Anonymise les données personnelles
    - Marque le profil ferme comme supprimé
    - Nettoie les tokens JWT/push connus
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveAccountActionThrottle]

    @extend_schema(
        summary="Supprimer définitivement mon compte",
        description="Désactive et anonymise le compte utilisateur après confirmation explicite.",
        request=AccountDeletionSerializer,
        responses={
            200: OpenApiResponse(description="Compte supprimé/anonymisé avec succès"),
            400: OpenApiResponse(description="Confirmation manquante"),
            401: OpenApiResponse(description="Authentification requise"),
        },
    )
    def post(self, request):
        serializer = AccountDeletionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data["confirm"] is not True:
            return Response(
                {"error": _("Confirmation explicite requise.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        AccountDeletionService.anonymize_user_account(request.user)

        return Response(
            {"message": _("Compte supprimé avec succès.")},
            status=status.HTTP_200_OK,
        )
