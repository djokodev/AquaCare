# DESIGN_SYSTEM.md

Systeme de design de l'application mobile MAVECAM AquaCare.

---

## Table des Matieres

1. [Identite Visuelle MAVECAM](#identite-visuelle-mavecam)
2. [Palette de Couleurs](#palette-de-couleurs)
3. [Typographie](#typographie)
4. [Composants UI](#composants-ui)
5. [Iconographie](#iconographie)
6. [Espacements et Grille](#espacements-et-grille)
7. [Ombres et Elevations](#ombres-et-elevations)
8. [Animations et Transitions](#animations-et-transitions)
9. [Accessibilite](#accessibilite)
10. [Patterns de Design](#patterns-de-design)
11. [Guidelines UX](#guidelines-ux)

---

## Identite Visuelle MAVECAM

### Principes de Design

**Public Cible :** Aquaculteurs camerounais avec niveaux d'alphabetisation variables.

**Objectifs UI/UX :**
1. **Simplicite** : Interface intuitive avec icones + texte
2. **Visibilite** : Contrastes eleves pour lisibilite mobile en exterieur
3. **Guidage** : Actions principales evidentes (boutons verts MAVECAM)
4. **Confiance** : Couleurs professionnelles vert/blanc MAVECAM
5. **Bilinguisme** : Traductions FR/EN systematiques
---

## Palette de Couleurs

### Couleurs Principales MAVECAM

**Couleurs Primaires :**
- GREEN_PRIMARY: #059669 (Vert MAVECAM principal)
- GREEN_LIGHT: #10b981 (Vert clair pour accents, highlights)
- GREEN_DARK: #047857 (Vert fonce pour headers, emphasis)

**Couleurs Neutres :**
- WHITE: #ffffff (Blanc pur pour backgrounds cards)
- CREAM: #f8fafc (Blanc casse pour background app)
- GRAY_LIGHT: #64748b (Gris clair pour texte secondaire)
- GRAY_DARK: #1e293b (Gris fonce pour texte principal)

**Couleurs Semantiques :**
- SUCCESS: #059669 (Succes = GREEN_PRIMARY)
- WARNING: #f59e0b (Avertissement orange)
- ERROR: #dc2626 (Erreur rouge)
- INFO: #0ea5e9 (Information bleu ciel)

### Utilisation des Couleurs

#### **Vert MAVECAM Primary (#059669)**
- Headers principaux (Dashboard, ProfileScreen)
- Boutons d'action primaire ("Creer cycle", "Sauvegarder")
- Icones principales (poisson, bassins)
- Badges de statut positif ("Certifiee")

#### **Vert Light (#10b981)**
- Highlights hover/active
- Indicateurs de progression
- Accents secondaires

#### **Vert Dark (#047857)**
- Text emphasis important
- Borders actifs
- Icones secondaires

#### **Blanc (#ffffff) et Creme (#f8fafc)**
- **Blanc** : Backgrounds cards, modales
- **Creme** : Background general app

**Contraste WCAG :**
- Blanc sur Vert Primary : 21:1 (AAA)
- Gris Dark sur Blanc : 12.6:1 (AAA)

#### **Gris Light (#64748b) et Gris Dark (#1e293b)**
- **Gris Dark** : Texte principal (titres, labels)
- **Gris Light** : Texte secondaire (subtitles, placeholders)

#### **Couleurs Semantiques**

**Success (Vert #059669) :**
- Confirmations actions
- Indicateurs positifs (survie >80%)
- Messages succes

**Warning (Orange #f59e0b) :**
- Notifications alimentation
- Alertes non-critiques
- Indicateurs attention (FCR >2.0)

**Error (Rouge #dc2626) :**
- Erreurs formulaires
- Indicateurs critiques (mortalite >40%)
- Messages d'echec

**Info (Bleu #0ea5e9) :**
- Tooltips
- Messages informatifs
- Indicateurs neutres

**Utilisation :**
- Gradients (GREEN_500 vers GREEN_700)
- States hover/active (GREEN_100 vers GREEN_200)

---

## Typographie

### Familles de Police

**System Fonts (par defaut React Native) :**
- **iOS** : San Francisco
- **Android** : Roboto

**Avantages :**
- Zero config supplementaire
- Performance optimale
- Coherence systeme


### Echelle Typographique

**Titres :**
- **h1** : fontSize 32, fontWeight bold, lineHeight 40, color GRAY_DARK
- **h2** : fontSize 24, fontWeight bold, lineHeight 32, color GRAY_DARK
- **h3** : fontSize 20, fontWeight bold, lineHeight 28, color GRAY_DARK
- **h4** : fontSize 18, fontWeight 600, lineHeight 24, color GRAY_DARK

**Corps de texte :**
- **bodyLarge** : fontSize 16, fontWeight normal, lineHeight 24, color GRAY_DARK
- **bodyMedium** : fontSize 14, fontWeight normal, lineHeight 20, color GRAY_DARK
- **bodySmall** : fontSize 12, fontWeight normal, lineHeight 16, color GRAY_LIGHT

**Texte secondaire :**
- **caption** : fontSize 12, fontWeight normal, lineHeight 16, color GRAY_LIGHT

**Boutons :**
- **button** : fontSize 16, fontWeight 600, lineHeight 24, color WHITE

**Labels :**
- **label** : fontSize 14, fontWeight 500, lineHeight 20, color GRAY_DARK


### Guidelines Typographiques

1. **Hierarchie claire** : h1 > h2 > h3 > body
2. **Contraste suffisant** : Texte sur background (min 4.5:1)
3. **Line-height confortable** : 1.4-1.6x font size
4. **Longueur ligne** : Max 60-70 caracteres (lisibilite)
5. **Alignement** : Left pour textes longs, center pour titres courts

---

## Composants UI

### Boutons

#### **Bouton Primaire**
**Style :**
- backgroundColor: GREEN_PRIMARY
- paddingVertical: 16, paddingHorizontal: 24
- borderRadius: 12
- alignItems: center, justifyContent: center
- Shadow avec elevation 3

**Etats :**
- **Normal** : GREEN_PRIMARY
- **Pressed** : GREEN_DARK (opacity 0.8)
- **Disabled** : GRAY_LIGHT (opacity 0.5)

#### **Bouton Secondaire (Outline)**
**Style :**
- backgroundColor: transparent
- borderWidth: 2, borderColor: GREEN_PRIMARY
- paddingVertical: 14, paddingHorizontal: 24
- borderRadius: 12

#### **Bouton Action (avec icone)**
**Style :**
- backgroundColor: WHITE
- flexDirection: row, alignItems: center
- padding: 16, borderRadius: 12
- marginBottom: 12
- Shadow avec elevation 2
- Icone Ionicons (size 24) + Text (marginLeft 12)

### Cartes (Cards)

#### **Carte Standard**
**Style :**
- backgroundColor: WHITE
- borderRadius: 12, padding: 16
- marginBottom: 12
- Shadow avec elevation 3

**Utilisations :**
- Cycle actif (DashboardScreen)
- Statistique (StatisticsScreen)
- Notification (NotificationsScreen)

#### **Carte Statistique (Stat Card)**
**Style :**
- backgroundColor: WHITE
- width: 48% (Grid 2 colonnes)
- padding: 16, borderRadius: 12
- alignItems: center
- marginBottom: 12
- Shadow avec elevation 2

**Structure :**
- Icone Ionicons (size 32, couleur thematique)
- Nombre (fontSize 24, fontWeight bold, marginTop 8)
- Label (fontSize 14, color GRAY_LIGHT)

### Inputs (Formulaires)

#### **Input Texte Standard**
**Style :**
- backgroundColor: WHITE
- borderWidth: 1, borderColor: GRAY_LIGHT
- borderRadius: 8
- paddingVertical: 12, paddingHorizontal: 16
- fontSize: 16, color: GRAY_DARK

**Etats :**
- **Normal** : Border GRAY_LIGHT
- **Focus** : Border GREEN_PRIMARY (width 2)
- **Error** : Border ERROR (width 2)
- **Disabled** : Background CREAM, border GRAY_LIGHT

#### **Picker (Select)**
**Style :**
- backgroundColor: WHITE
- borderWidth: 1, borderColor: GRAY_LIGHT
- borderRadius: 8
- Module @react-native-picker/picker

### Badges et Tags

#### **Badge Notification**
**Style :**
- position: absolute (top -8, right -8)
- backgroundColor: ERROR
- borderRadius: 12
- paddingHorizontal: 6, paddingVertical: 2
- minWidth: 20
- Text (color WHITE, fontSize 10, fontWeight bold)

#### **Tag Statut**
**Style Certifiee (vert) :**
- backgroundColor: SUCCESS
- paddingHorizontal: 12, paddingVertical: 6
- borderRadius: 16
- Text (color WHITE, fontSize 12, fontWeight 600)

**Style Pending (orange) :**
- backgroundColor: WARNING
- Meme padding/radius

### Modales

**Structure :**
- **Overlay** : backgroundColor rgba(0,0,0,0.5), flex 1, justifyContent center
- **Content** : backgroundColor WHITE, borderRadius 16, padding 24, width 90%, maxWidth 400
- **Animation** : animationType fade, transparent true

---

## Iconographie

### Librairie Icones : Ionicons

**Raison :** Integre Expo, 1000+ icones, coherence Material Design/iOS.

**Module :** @expo/vector-icons/Ionicons


## Ombres et Elevations

### Systeme d'Ombres (Android + iOS)

**Elevation 1 (subtil) - sm :**
- shadowColor: #000
- shadowOffset: width 0, height 1
- shadowOpacity: 0.1
- shadowRadius: 2
- elevation: 2 (Android)

**Elevation 2 (standard) - md :**
- shadowColor: #000
- shadowOffset: width 0, height 2
- shadowOpacity: 0.1
- shadowRadius: 3
- elevation: 3 (Android)

**Elevation 3 (emphasize) - lg :**
- shadowColor: #000
- shadowOffset: width 0, height 4
- shadowOpacity: 0.15
- shadowRadius: 6
- elevation: 6 (Android)

**Utilisation :**
- **Cards standard** : sm ou md
- **Boutons primaires** : md
- **Modales** : lg
- **Headers flottants** : md

**Note Android :** elevation pour ombres natives Android.

---

## Animations et Transitions

### Animations Natives React Native

**Fade In (apparition douce) :**
- Module : Animated de react-native
- useRef avec Animated.Value(0)
- Animated.timing avec toValue 1, duration 300ms
- useNativeDriver: true (60fps)
- Style opacity avec fadeAnim

**Slide In (du bas) :**
- Animated.Value(100) initial
- Animated.spring avec speed 12, bounciness 8
- transform translateY avec slideAnim

### Transitions Modales

**Modal component :**
- animationType: fade, slide, ou none
- transparent: true
- visible: boolean state

### Guidelines Animations

1. **Duree** :
   - Rapide : 150-200ms (micro-interactions)
   - Standard : 300ms (transitions)
   - Lente : 500ms (changements majeurs)

2. **Easing** :
   - ease-in-out par defaut
   - spring pour interactions naturelles

3. **Performance** :
   - TOUJOURS useNativeDriver: true (60fps)
   - Eviter animer width, height (utiliser scale)

---

## Accessibilite

### Principes WCAG 2.1

#### **Contraste Couleurs (AA minimum)**
- **Texte normal** : 4.5:1 minimum
- **Texte large** : 3:1 minimum
- **Elements UI** : 3:1 minimum

**Verifications MAVECAM :**
- Blanc sur GREEN_PRIMARY : 21:1 (AAA)
- GRAY_DARK sur Blanc : 12.6:1 (AAA)
- GRAY_LIGHT sur Blanc : 4.7:1 (AA)

#### **Zones Tactiles**
**Minimum 44x44 pixels** (Apple HIG / Material Design)

**TouchableOpacity :**
- minWidth: 44
- minHeight: 44
- justifyContent: center
- alignItems: center

#### **Labels Accessibilite**
**Props TouchableOpacity :**
- accessibilityLabel: texte descriptif
- accessibilityHint: indication action
- accessibilityRole: button, header, etc.

#### **Support Lecteur d'Ecran**
**Text avec accessibilityRole header :**
- Pour titres principaux

**View avec accessible false :**
- Pour grouper elements decoratifs

---

## Patterns de Design

### Etat Vide (Empty State)

**Structure :**
- flex: 1, alignItems center, justifyContent center
- paddingVertical: 60, paddingHorizontal: 24
- Icone Ionicons (size 80, color GRAY_LIGHT)
- Titre (fontSize 20, fontWeight bold, marginTop 20)
- Description (fontSize 14, color GRAY_LIGHT, marginTop 8)
- Bouton action (backgroundColor GREEN_PRIMARY, marginTop 24)

### Etat Chargement (Loading)

**Structure :**
- flex: 1, alignItems center, justifyContent center
- paddingVertical: 40
- ActivityIndicator (size large, color GREEN_PRIMARY)
- Text (fontSize 16, color GRAY_LIGHT, marginTop 12)

### Etat Erreur

**Structure :**
- flex: 1, alignItems center, justifyContent center
- paddingVertical: 40, paddingHorizontal: 20
- Icone alert-circle (size 48, color ERROR)
- Message erreur (fontSize 16, color ERROR, textAlign center)
- Bouton retry (backgroundColor GREEN_PRIMARY, marginTop 20)

### Pull-to-Refresh

**RefreshControl component :**
- refreshing: boolean loading state
- onRefresh: callback fonction
- colors: [GREEN_PRIMARY] (Android)
- tintColor: GREEN_PRIMARY (iOS)

---

## Guidelines UX

### Navigation

**Principe :** 3 taps maximum pour atteindre action principale.

**Hierarchie :**
1. **Dashboard** (hub central)
2. **Screens actions** (NewCycle, DailyLog, etc.)
3. **Details/Historiques**

**Back Navigation :**
- Android : Bouton hardware back
- iOS : Swipe gauche ou bouton header

### Formulaires

**Principes :**
1. **Labels clairs** : Toujours au-dessus input
2. **Placeholders** : Exemples de saisie
3. **Validation temps reel** : Border rouge si erreur
4. **Messages erreur** : Sous input concerne
5. **Champs requis** : Asterisque (*) dans label
6. **Bouton submit** : Toujours visible (sticky bottom)

**Structure input avec validation :**
- Label au-dessus (fontWeight 500, marginBottom 8)
- TextInput avec borderColor conditionnel (error ? ERROR : GRAY_LIGHT)
- Message erreur en dessous si erreur (color ERROR, fontSize 12, marginTop 4)

### Feedback Utilisateur

**Toujours confirmer action :**
- Succes : Toast/Alert vert + icone check
- Erreur : Alert rouge + icone x
- Chargement : Spinner + texte descriptif

**Alert.alert usage :**
- Titre succes/erreur
- Message descriptif
- Bouton OK avec callback

### Messages Utilisateur

**Ton :**
- Amical mais professionnel
- Concis et actionnable
- Positif (encouragement)

**Bilinguisme :**
- TOUS les textes via t('key')
- Verifier traductions FR + EN coherentes

---

## Responsive Design

### Adaptations Mobiles

**Tailles ecrans supportees :**
- Petit : 320x568 (iPhone SE)
- Moyen : 375x667 (iPhone 8)
- Grand : 414x896 (iPhone 11)
- Extra : 428x926 (iPhone 13 Pro Max)

**Strategie :**
- **Layouts flexibles** : flex: 1, flexWrap
- **Grids adaptatifs** : width: 48% pour 2 colonnes
- **Font sizes absolues** : Pas de responsive fonts (lisibilite)
- **Safe Areas** : paddingTop: 60 pour notch iOS

### Orientations

**Portrait uniquement** (recommande aquaculture mobile)

**Configuration app.json :**
- expo.orientation: portrait

---

## Checklist Design Implementation

### Avant de coder un screen :

- [ ] Palette MAVECAM_COLORS respectee
- [ ] Typographie scale TYPOGRAPHY utilisee
- [ ] Espacements SPACING 4px appliques
- [ ] Ombres SHADOWS coherentes
- [ ] Icones Ionicons appropriees
- [ ] Contrastes accessibilite valides (4.5:1 min)
- [ ] Zones tactiles 44x44px minimum
- [ ] Etats vide/loading/erreur geres
- [ ] Traductions FR + EN completes
- [ ] Navigation coherente avec MainNavigator
- [ ] Pull-to-refresh si donnees dynamiques
- [ ] Feedback utilisateur sur actions

---

**Derniere mise a jour :** 2025-10-13
**Maintenu par :** Djoko Christian
