# Spécifications pour le Développement Mobile - MAVECAM AquaCare

**Projet :** Application Mobile React Native/Expo pour Gestion Piscicole  

---

## 📱 PHILOSOPHIE DE DÉVELOPPEMENT

### Approche Méthodologique Requise

**ÉTAPE 1 : CONSULTATION DOCUMENTATION OFFICIELLE OBLIGATOIRE**
- **WebFetch React Native docs** : https://reactnative.dev/docs/ pour patterns et composants
- **WebFetch Expo docs** : https://docs.expo.dev/ pour SDK et outils spécifiques
- **WebFetch Redux Toolkit** : https://redux-toolkit.js.org/ pour state management
- Analyser ensuite les endpoints Django disponibles selon la documentation DRF
- Identifier les modèles de données, serializers et contraintes de validation
- Mapper les relations entre User, FarmProfile selon les bonnes pratiques TypeScript
- Vérifier la cohérence des types avec les patterns officiels React Native

**ÉTAPE 2 : VALIDATION UTILISATEUR À CHAQUE ÉTAPE**
- Implémenter une fonctionnalité complète (ex: écran de saisie quotidienne)
- Présenter à l'utilisateur pour validation UX/fonctionnelle
- Corriger selon les retours avant de passer à la fonctionnalité suivante
- Jamais d'accumulation de fonctionnalités non validées

**ÉTAPE 3 : TESTS SELON DOCUMENTATION OFFICIELLE**
- **WebFetch React Native Testing** : https://reactnative.dev/docs/testing-overview
- **WebFetch Jest + React Native** : https://jestjs.io/docs/tutorial-react-native
- Écrire les tests selon les patterns officiels recommandés
- Tester la synchronisation offline/online avec les outils Expo recommandés
- Valider les calculs métier selon les standards de test React Native

---

## 🎨 CHARTE GRAPHIQUE MAVECAM

### Palette de Couleurs Officielle

```scss
// Couleurs Principales
$mavecam-green-primary: #059669;     // Vert MAVECAM principal
$mavecam-green-light: #10b981;       // Vert clair pour accents
$mavecam-green-dark: #047857;        // Vert foncé pour headers

// Couleurs Secondaires  
$mavecam-white: #ffffff;             // Blanc pur
$mavecam-cream: #f8fafc;             // Blanc cassé pour backgrounds
$mavecam-blue: #2563eb;              // Bleu pour actions secondaires

// Couleurs d'État
$mavecam-success: #059669;           // Vert pour succès
$mavecam-warning: #f59e0b;          // Orange pour avertissements
$mavecam-error: #dc2626;            // Rouge pour erreurs
$mavecam-info: #0ea5e9;             // Bleu pour informations
```

### Utilisation des Couleurs

- **Headers/Navigation :** `$mavecam-green-primary` avec texte blanc
- **Boutons Principaux :** `$mavecam-green-primary` avec texte blanc
- **Backgrounds :** `$mavecam-cream` pour contraste doux
- **Cartes/Sections :** `$mavecam-white` avec ombres subtiles
- **Certifications :** `$mavecam-green-dark` pour badges certifiés
- **Actions Secondaires :** `$mavecam-blue` pour navigation

---

## 🏗️ ARCHITECTURE TECHNIQUE

### Stack Technologique Confirmée

```json
{
  "expo": "~53.0.0",
  "react-native": "~0.76.9",
  "typescript": "^5.3.0",
  "@reduxjs/toolkit": "^2.0.1",
  "react-redux": "^9.1.0",
  "@react-navigation/native": "^6.1.0",
  "@react-navigation/bottom-tabs": "^6.5.0",
  "@react-navigation/stack": "^6.3.0",
  "axios": "^1.6.0",
  "expo-secure-store": "~13.0.0",
  "react-i18next": "^14.0.0",
  "expo-camera": "~15.0.0",
  "expo-image-picker": "~15.0.0"
}
```

### Principes Architecturaux

1. **Offline-First Obligatoire**
   - Base de données locale SQLite via Expo SQLite
   - Synchronisation bidirectionnelle avec l'API Django
   - Interface réactive même sans connexion

2. **State Management Redux**
   - Slices séparés par domaine métier (auth, aquaculture, orders)
   - Middleware pour synchronisation automatique
   - Persistance de l'état critique

3. **Composants Réutilisables**
   - Design System basé sur les couleurs MAVECAM
   - Composants UI adaptés aux utilisateurs peu alphabétisés
   - Support pictogrammes et icônes explicites

---

## 📋 MODULES À DÉVELOPPER

### Module 1 : Authentification (✅ COMPLÉTÉ)
**État :** Développé et validé  
**Fonctionnalités :**
- Inscription (individuel/entreprise)
- Connexion (nom d'affichage ou téléphone)
- Gestion JWT avec refresh automatique
- Profils utilisateur et ferme

### Module 2 : Tableau de Bord Aquaculture (📝 À DÉVELOPPER)

**Backend Prerequisites :**
- Analyser les modèles `ProductionCycle`, `CycleLog`, `CycleMetrics`
- Comprendre les calculs automatiques (FCR, taux de survie, biomasse)
- Identifier les endpoints de synchronisation `/api/aquaculture/sync/`

**Écrans Requis :**

1. **Dashboard Principal**
   ```typescript
   interface DashboardData {
     activeCycles: ProductionCycle[];
     totalBiomass: number;
     averageFCR: number;
     averageSurvivalRate: number;
     recentLogs: CycleLog[];
     pendingNotifications: Notification[];
   }
   ```

2. **Détail Cycle de Production**
   - Informations générales (espèce, bassin, dates)
   - Métriques calculées en temps réel
   - Graphiques de croissance et mortalité
   - Actions rapides (ajout log, récolte)

3. **Saisie Quotidienne**
   ```typescript
   interface DailyLogForm {
     mortality_count: number;
     sample_count?: number;
     sample_total_weight?: number;
     feed_quantity?: number;
     water_temperature?: number;
     observations?: string;
   }
   ```

**Calculs Offline Requis :**
```typescript
// Calculateurs métier à implémenter côté mobile
class AquacultureCalculators {
  static calculateBiomass(count: number, avgWeight: number): number;
  static calculateSurvivalRate(initial: number, current: number): number;
  static calculateFCR(feedConsumed: number, weightGain: number): number;
  static calculateDailyGrowthRate(initialWeight: number, currentWeight: number, days: number): number;
}
```

### Module 3 : Planificateur d'Alimentation (📝 À DÉVELOPPER)

**Backend Prerequisites :**
- Analyser le modèle `FeedingPlan` et `NutritionalGuide`
- Comprendre l'algorithme de génération des plans hebdomadaires
- Identifier les données de référence (guides nutritionnels par espèce/stade)

**Fonctionnalités :**
- Génération automatique de plans d'alimentation
- Notifications locales pour rappels de nourrissage
- Guides nutritionnels consultables offline
- Calcul de quantités selon biomasse actuelle

**Notifications Locales :**
```typescript
import * as Notifications from 'expo-notifications';

interface FeedingNotification {
  cycleId: string;
  scheduledTime: Date;
  feedAmount: number;
  mealNumber: number; // 1, 2, 3 selon fréquence
}
```

### Module 4 : Journal Sanitaire (📝 À DÉVELOPPER)

**Fonctionnalités :**
- Enregistrement d'événements sanitaires
- Upload de photos compressées (max 1280x720)
- Gestion des traitements et suivis
- Alertes automatiques selon paramètres

**Gestion Photos :**
```typescript
// Compression obligatoire avant sauvegarde
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const compressImage = async (uri: string) => {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: 1280 } }],
    { compress: 0.7, format: SaveFormat.JPEG }
  );
  return result.uri;
};
```

### Module 5 : E-Commerce Intrants (📝 FUTUR)
**État :** En attente des spécifications du module commerce
**Note :** Développement reporté selon demande utilisateur

---

## 🔄 SYSTÈME DE SYNCHRONISATION

### Architecture Offline-First

```typescript
interface SyncManager {
  // Queue des actions offline
  pendingActions: OfflineAction[];
  
  // Synchronisation automatique
  scheduleSync(): void;
  performSync(): Promise<SyncResult>;
  
  // Gestion conflits
  resolveConflicts(conflicts: DataConflict[]): void;
}

interface OfflineAction {
  id: string;
  type: 'CREATE_LOG' | 'UPDATE_CYCLE' | 'CREATE_SANITARY_LOG';
  data: any;
  clientUuid: string;
  timestamp: Date;
  synced: boolean;
}
```

### Endpoints de Synchronisation

```typescript
// POST /api/aquaculture/sync/
interface SyncPayload {
  cycle_logs: CycleLog[];
  sanitary_logs: SanitaryLog[];
  new_cycles: ProductionCycle[];
  last_sync: string;
  client_id: string;
}

interface SyncResponse {
  status: 'success' | 'error';
  processed: {
    cycle_logs: number;
    sanitary_logs: number;
    new_cycles: number;
  };
  server_updates: {
    cycles: ProductionCycle[];
    logs: CycleLog[];
    feeding_plans: FeedingPlan[];
  };
  errors: SyncError[];
}
```

---

## 📱 SPÉCIFICATIONS UX/UI

### Guidelines Interface Utilisateur

1. **Simplicité Visuelle**
   - Icônes explicites pour chaque action
   - Texte gros et contrasté (lecture en plein soleil)
   - Maximum 3 actions par écran
   - Navigation claire avec breadcrumbs

2. **Optimisation Performances**
   - Lazy loading des images
   - Pagination des listes longues
   - Cache intelligent des données fréquentes
   - Animations légères (< 200ms)

3. **Feedback Utilisateur**
   - États de chargement visibles
   - Indicateurs de synchronisation
   - Messages d'erreur explicites
   - Confirmations pour actions critiques

### Composants UI Standards

```typescript
// Carte d'information avec couleurs MAVECAM
interface InfoCard {
  title: string;
  value: string | number;
  unit?: string;
  status?: 'success' | 'warning' | 'error';
  icon: string;
}

// Bouton MAVECAM standard
interface MAVECAMButton {
  variant: 'primary' | 'secondary' | 'danger';
  size: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
}
```

---

## 🧪 STRATÉGIE DE TESTS

### Tests Unitaires Obligatoires

```typescript
// Tests calculateurs métier
describe('AquacultureCalculators', () => {
  test('calcule biomasse correctement', () => {
    expect(calculateBiomass(1000, 150)).toBe(150);
  });
  
  test('calcule FCR selon formule MAVECAM', () => {
    expect(calculateFCR(100, 50)).toBe(2.0);
  });
});

// Tests synchronisation
describe('SyncManager', () => {
  test('gère déduplication via clientUuid', async () => {
    // Test déduplication logs
  });
  
  test('résout conflits de données', async () => {
    // Test résolution conflits
  });
});
```

### Tests d'Intégration

1. **Cycle Complet Offline**
   - Créer cycle sans connexion
   - Ajouter logs quotidiens
   - Vérifier calculs automatiques
   - Synchroniser et valider côté serveur

2. **Récupération Réseau**
   - Simuler perte de connexion
   - Accumuler actions offline
   - Restaurer réseau et valider sync

---

## 📚 DONNÉES DE RÉFÉRENCE

### Guides Nutritionnels (Pré-chargés)

```typescript
interface NutritionalGuide {
  species: 'tilapia' | 'clarias';
  growthStage: 'alevin' | 'juvenile' | 'croissance' | 'finition';
  minWeight: number; // grammes
  maxWeight: number;
  feedingRatePercentage: number; // % biomasse/jour
  proteinRequirement: number; // % protéines
  mealsPerDay: number;
  recommendedProducts: string[];
}

// Exemple données Tilapia selon documents MAVECAM
const TILAPIA_GUIDES: NutritionalGuide[] = [
  {
    species: 'tilapia',
    growthStage: 'alevin',
    minWeight: 2,
    maxWeight: 10,
    feedingRatePercentage: 8,
    proteinRequirement: 45,
    mealsPerDay: 4,
    recommendedProducts: ['MAVECAM Starter 1.0mm']
  },
  // ... autres stades
];
```

### Paramètres Environnementaux

```typescript
interface EnvironmentalThresholds {
  species: string;
  optimalTemperature: [number, number]; // [min, max] °C
  optimalPH: [number, number];
  minDissolvedOxygen: number; // mg/L
  maxDensity: number; // kg/m³
}
```

---


## 📋 CRITÈRES DE VALIDATION

### Validation Technique
- [ ] Application fonctionne 100% offline
- [ ] Synchronisation bidirectionnelle sans perte de données
- [ ] Calculs métier conformes aux formules MAVECAM
- [ ] Interface fluide sur appareils Android 7.0+
- [ ] Couleurs MAVECAM respectées dans tous les écrans

### Validation Utilisateur
- [ ] Saisie quotidienne possible en < 2 minutes
- [ ] Compréhension intuitive sans formation
- [ ] Feedback immédiat sur toutes les actions
- [ ] Notifications utiles sans être intrusives

### Validation Métier
- [ ] Données compatibles avec reporting MAVECAM
- [ ] Traçabilité complète des cycles de production
- [ ] Intégration future avec module commerce facilitée
- [ ] Export des données pour analyses terrain


# Ajoute les logs pendant que tu codes afin que s'il y'a des erreurs ou autres tu peut mieux comprendre les eventuels problemes et corriger

# Chaque fois qu'on fini une fonctionnalite lance l'application afin de voir si tout fontionne parfaitement.
---
