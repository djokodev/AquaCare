from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiExample

from apps.accounts.models import User

from .serializers import (
    UserRegistrationSerializer,
    UserProfileSimpleSerializer,
    UserProfileSerializer,
    FarmProfileSerializer,
    LoginSerializer
)
from .permissions import IsOwnerOrReadOnly


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
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]
    
    @extend_schema(
        summary="Inscription d'un nouveau pisciculteur",
        description="Crée un compte utilisateur (individuel ou entreprise) avec génération automatique du profil ferme et des tokens JWT",
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
        # Debug: Log des données reçues
        print(f"DEBUG - Donnees recues pour inscription: {request.data}")
        print(f"DEBUG - Content-Type: {request.content_type}")
        
        serializer = self.get_serializer(data=request.data)
        
        if not serializer.is_valid():
            print(f"ERROR - Erreurs de validation: {serializer.errors}")
            
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        refresh = RefreshToken.for_user(user)
        
        return Response({
            'user': UserProfileSerializer(user).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            },
            'message': 'Compte créé avec succès'
        }, status=status.HTTP_201_CREATED)


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
    
    @extend_schema(
        summary="Connexion utilisateur MAVECAM",
        description="Authentification flexible avec deux méthodes : nom d'affichage OU numéro de téléphone + mot de passe",
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

        refresh = RefreshToken.for_user(user)

        return Response({
            'user': UserProfileSerializer(user).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            },
            'message': 'Connexion réussie'
        })


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
        return self.request.user


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
        try:
            refresh_token = request.data.get('refresh')
            
            if not refresh_token:
                return Response(
                    {'error': 'Token de rafraîchissement requis'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Blacklist du refresh token
            token = RefreshToken(refresh_token)
            token.blacklist()
            
            return Response(
                {'message': 'Déconnexion réussie'},
                status=status.HTTP_200_OK
            )
            
        except TokenError:
            return Response(
                {'error': 'Token invalide'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'error': 'Erreur lors de la déconnexion'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
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
        return self.request.user.farm_profile
