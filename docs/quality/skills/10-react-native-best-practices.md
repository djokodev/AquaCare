# Skill 10 - react-native-best-practices

## Audit initial

### Bloc 1 - main et navigation
- `AppNavigator` et `MainNavigator` portaient encore quelques couts inutiles de demarrage:
  - imports via barrels de features
  - listeners `i18n` sans effet utile
  - memoisation inutile de `initialRouteName`
- `DashboardScreen` portait encore une couche Reanimated complete alors que l'ecran n'utilisait pas de logique d'animation reelle
- le dashboard recalculait encore plusieurs derivees a chaque rendu:
  - commandes en attente de confirmation
  - metriques business
  - cartes de cycles actives

### Bloc 2 - aquaculture
- plusieurs ecrans list-heavy restaient en `ScrollView`:
  - `NotificationsScreen`
  - `CycleHistoryScreen`
  - `DailyLogHistoryScreen`
  - `ReportsScreen`
- des composants et ecrans complementaires restaient encore perfectibles:
  - `CyclePicker` rendait toute la liste des cycles en une fois
  - `StatisticsScreen` recalculait et rerendait plus que necessaire pour la selection de cycle
  - `ReportDetailScreen` gardait une structure `ScrollView + map()` qui scale mal sur des rapports riches
- le barrel `frontend/src/features/aquaculture/index.ts` existe encore mais n'est plus consomme par le code frontend interne

### Bloc 3 - commerce
- `ProductCatalogScreen` et `OrdersHistoryScreen` etaient deja sur des listes virtualisees
- les ecarts utiles restants se situaient surtout sur:
  - `CartScreen`, encore en `ScrollView + map()` pour une liste de produits potentiellement longue
  - `FeedingSuggestionsScreen`, encore en `ScrollView + map()` pour les suggestions par cycle
  - `ProductDetailScreen`, qui utilisait encore un carrousel `ScrollView` pour les produits similaires
  - plusieurs imports de constantes via le barrel `@/domain/commerce`

### Bloc 4 - chat et notifications
- `ChatScreen` etait deja sur `FlatList`, donc le gain utile n'etait pas la liste elle-meme mais:
  - nettoyage des timers d'auto-scroll
  - limitation du churn de scroll
  - options `FlatList` mieux adaptees
- `useNotificationsPolling` et les hooks notifications ont ete audites:
  - pas de refactor supplementaire justifie a ce stade
  - le hook est deja correctement borne par auth + foreground
- `frontend/src/features/chat/index.ts` reste expose comme API de module mais n'est plus consomme par le code frontend interne critique

### Bloc 5 - profile, auth, onboarding
- audit final realise
- constats:
  - `OnboardingScreen` est deja sur `FlatList` horizontal
  - `LoginScreen`, `RegisterScreen`, `ProfileScreen`, `FarmProfileScreen`, `SettingsScreen` sont surtout des formulaires/sections courtes, pas des listes a virtualiser
  - seul reliquat utile trouve: imports internes via barrels sur `AuthNavigator` et sur quelques estimateurs de domaine aquaculture
- pas de refactor de rendu plus profond justifie sur ces surfaces pour ce skill

## Plan d'execution

### Bloc 1 - main et navigation
- remplacer les imports barrel par des imports directs pour les ecrans critiques
- supprimer les listeners/lang-state inutiles dans la navigation
- retirer la couche Reanimated non necessaire du dashboard
- memoiser les derivees couteuses du dashboard

### Bloc 2 - aquaculture
- remplacer les `ScrollView + map()` par `FlatList` sur les ecrans de listes
- virtualiser la selection de cycles avec `FlatList`
- limiter les recalculs derivables sur `StatisticsScreen`
- transformer `ReportDetailScreen` en structure de liste plus scalable
- verifier `tsc` et les suites de tests des ecrans touches

### Bloc 3 - commerce
- auditer tous les ecrans de la feature sous l'angle:
  - virtualisation
  - imports directs
  - derivees memoisees seulement si utiles
  - eviter les rerenders inutiles sur catalogue/panier/commandes

### Bloc 4 - chat et notifications
- auditer `chat` et `notifications` pour:
  - listes et messages
  - polling / refresh
  - imports barrel
  - derivees et handlers recrees sans gain

### Bloc 5 - profile, auth, onboarding
- verifier les derniers imports internes via barrels
- confirmer qu'aucun ecran formulaire n'a besoin d'une virtualisation artificielle
- cloturer le skill uniquement apres validation frontend globale

## Execution

### Bloc 1 - main et navigation
- `AppNavigator`:
  - import direct de `LoadingScreen`
  - suppression du `useMemo` inutile pour `initialRouteName`
- `MainNavigator`:
  - imports directs des ecrans `main`, `profile`, `aquaculture`, `commerce`, `chat`
  - suppression des listeners `i18n` et etats de langue inutiles
  - suppression du `screenListeners` sans comportement
- `DashboardScreen`:
  - retrait de la couche Reanimated inutile
  - memoisation des derivees `pendingDeliveryConfirmations`, `dashboardBusinessMetrics` et `cycleCards`
  - passage a un header statique simple hors `ScrollView`

### Bloc 2 - aquaculture
- ecrans listes virtualises:
  - [frontend/src/features/aquaculture/screens/NotificationsScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/aquaculture/screens/NotificationsScreen.tsx)
  - [frontend/src/features/aquaculture/screens/CycleHistoryScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/aquaculture/screens/CycleHistoryScreen.tsx)
  - [frontend/src/features/aquaculture/screens/DailyLogHistoryScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/aquaculture/screens/DailyLogHistoryScreen.tsx)
  - [frontend/src/features/aquaculture/screens/ReportsScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/aquaculture/screens/ReportsScreen.tsx)
- composants/ecrans complementaires optimises:
  - [frontend/src/features/aquaculture/components/CyclePicker.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/aquaculture/components/CyclePicker.tsx)
  - [frontend/src/features/aquaculture/screens/StatisticsScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/aquaculture/screens/StatisticsScreen.tsx)
  - [frontend/src/features/aquaculture/screens/ReportDetailScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/aquaculture/screens/ReportDetailScreen.tsx)
- `aquaculture/index.ts` n'est plus utilise par le code frontend interne; le cout bundle principal du barrel a donc ete neutralise sans casser d'API potentielle

### Bloc 3 - commerce
- ecrans optimises:
  - [frontend/src/features/commerce/screens/CartScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/commerce/screens/CartScreen.tsx)
  - [frontend/src/features/commerce/screens/FeedingSuggestionsScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/commerce/screens/FeedingSuggestionsScreen.tsx)
  - [frontend/src/features/commerce/screens/ProductDetailScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/commerce/screens/ProductDetailScreen.tsx)
- imports directs de constantes pour reduire le cout bundle:
  - [frontend/src/features/commerce/screens/ProductCatalogScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/commerce/screens/ProductCatalogScreen.tsx)
  - [frontend/src/features/commerce/screens/CycleSimulatorScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/commerce/screens/CycleSimulatorScreen.tsx)
  - [frontend/src/features/commerce/screens/CartScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/commerce/screens/CartScreen.tsx)
- points concrets apportes:
  - `CartScreen` passe sur `FlatList` avec header/footer virtualises
  - `FeedingSuggestionsScreen` passe sur `FlatList` pour les suggestions par cycle et stabilise ses handlers d'expansion
  - `ProductDetailScreen` memoise ses produits similaires et remplace le carrousel `ScrollView` par `FlatList`

### Bloc 4 - chat et notifications
- [frontend/src/features/chat/screens/ChatScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/chat/screens/ChatScreen.tsx)
  - timers d'auto-scroll nettoyes
  - `FlatList` renforcee avec options de fenetrage
  - mise a jour de `showScrollToBottom` seulement en cas de changement reel
  - `renderEmptyState` et `renderListHeader` stabilises
- `notifications` audite sans refactor additionnel:
  - [frontend/src/features/notifications/hooks/useNotificationsPolling.ts](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/notifications/hooks/useNotificationsPolling.ts)

### Bloc 5 - profile, auth, onboarding
- imports directs ajoutes pour supprimer les derniers barrels internes utilises:
  - [frontend/src/navigation/AuthNavigator.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/navigation/AuthNavigator.tsx)
  - [frontend/src/features/aquaculture/screens/DailyLogHistoryScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/aquaculture/screens/DailyLogHistoryScreen.tsx)
  - [frontend/src/features/aquaculture/screens/DailyLogScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/aquaculture/screens/DailyLogScreen.tsx)
  - [frontend/src/features/aquaculture/screens/NewCycleScreen.tsx](/Users/apple/Desktop/projects/AquaCare/frontend/src/features/aquaculture/screens/NewCycleScreen.tsx)
- `profile`, `auth` et `onboarding` audites sans refactor de rendu plus profond:
  - surfaces majoritairement formulaire / sections courtes
  - pas de gain defendable a remplacer leurs `ScrollView` par des listes virtualisees

## Verifications executees

- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm test -- --watchAll=false src/features/main/screens/__tests__/DashboardScreen.test.tsx`
- `cd frontend && npm test -- --watchAll=false src/features/aquaculture/screens/__tests__/NotificationsScreen.test.tsx src/features/aquaculture/screens/__tests__/CycleHistoryScreen.test.tsx src/features/aquaculture/screens/__tests__/DailyLogHistoryScreen.test.tsx`
- `cd frontend && npm test -- --watchAll=false src/features/aquaculture/screens/__tests__/StatisticsScreen.test.tsx src/features/aquaculture/screens/__tests__/CycleSessionEntryScreen.test.tsx`
- `cd frontend && npm test -- --watchAll=false src/features/commerce/screens/__tests__/CartScreen.test.tsx src/features/commerce/screens/__tests__/FeedingSuggestionsScreen.test.tsx src/features/commerce/screens/__tests__/ProductCatalogScreen.test.tsx src/features/commerce/screens/__tests__/CycleSimulatorScreen.test.tsx`
- `cd frontend && npm test -- --watchAll=false src/features/commerce/screens/__tests__/ProductDetailScreen.test.tsx`
- `cd frontend && npm test -- --watchAll=false src/features/chat/screens/__tests__/ChatScreen.test.tsx`
- `cd frontend && npm test -- --watchAll=false`

## Etat courant

- `main/navigation` valide
- `aquaculture` valide
- `commerce` valide
- `chat + notifications` valide
- `profile/auth/onboarding` audites et clos sans refactor de rendu justifie
- skill frontend complete
