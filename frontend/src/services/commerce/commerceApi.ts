/**
 * Service API Commerce MAVECAM AquaCare
 *
 * Ce service gère toutes les communications avec le backend Django
 * pour le module Commerce (produits alimentaires et commandes).
 *
 * Architecture :
 * - Utilise client Axios existant (@/services/api)
 * - Auto-refresh JWT automatique (déjà configuré)
 * - Gestion erreurs réseau (offline-first)
 * - Timeout 10s pour zones rurales Cameroun
 *
 * Endpoints backend :
 * - GET  /api/commerce/products/
 * - GET  /api/commerce/products/{id}/
 * - GET  /api/commerce/products/recommended/
 * - GET  /api/commerce/products/feeding_suggestions/
 * - POST /api/commerce/products/cycle_simulation/
 * - GET  /api/commerce/orders/
 * - POST /api/commerce/orders/
 * - GET  /api/commerce/orders/{id}/
 * - GET  /api/commerce/orders/statistics/
 * - POST /api/commerce/orders/preview_delivery_fee/
 *
 * @module services/commerce/commerceApi
 */

import { apiService as api } from '../api';
import {
  Product,
  ProductFilters,
  Order,
  CreateOrderPayload,
  OrderStatistics,
  DeliveryFeePreview,
  FeedingSuggestion,
  CycleSimulationParams,
  SimulationResult,
} from '../../types/commerce';

// ============================================================================
// ENDPOINTS PRODUITS
// ============================================================================

/**
 * Récupère la liste des produits avec filtres optionnels
 *
 * @param filters - Filtres de recherche (espèce, phase, marque, texte)
 * @returns Liste produits MAVECAM (22 produits max)
 *
 * @example
 * // Tous les produits
 * const products = await getProducts();
 *
 * // Produits tilapia uniquement
 * const tilapiaProducts = await getProducts({ species: 'tilapia' });
 *
 * // Recherche textuelle
 * const clar iasProducts = await getProducts({ search: 'CLARIAS' });
 */
export const getProducts = async (filters?: ProductFilters) => {
  const response = await api.get<{results: Product[]}>('/commerce/products/', {
    params: filters,
  });
  // Django REST Framework retourne {count, next, previous, results}
  return response.data.results;
};

/**
 * Récupère les détails d'un produit spécifique
 *
 * @param productId - UUID du produit
 * @returns Détails complets du produit
 */
export const getProductDetail = async (productId: string) => {
  const response = await api.get<Product>(`/commerce/products/${productId}/`);
  return response.data;
};

/**
 * Récupère le produit recommandé selon espèce et poids poisson
 *
 * Utilise algorithme backend de recommandation granulométrie
 * basé sur poids moyen actuel des poissons.
 *
 * @param species - Espèce ('tilapia' ou 'catfish')
 * @param weightG - Poids moyen poisson en grammes
 * @returns Produit recommandé (priorité Aller Aqua)
 *
 * @example
 * // Recommandation pour tilapia de 50g
 * const product = await getRecommendedProduct('tilapia', 50);
 * // Retourne ALLER AQUA TILAPIA 3MM 15KG
 */
export const getRecommendedProduct = async (species: 'tilapia' | 'catfish', weightG: number) => {
  const response = await api.get<Product>('/commerce/products/recommended/', {
    params: { species, weight_g: weightG },
  });
  return response.data;
};

/**
 * Récupère suggestions alimentation intelligentes
 *
 * Analyse cycles actifs utilisateur et génère recommandations
 * multi-granulométrie basées sur :
 * - Historique logs 30 derniers jours
 * - Poids moyen actuel détecté
 * - Projection changements futurs taille aliments
 * - Buffer sécurité +7 jours
 *
 * @param farmProfileId - UUID profil ferme (optionnel)
 * @returns Suggestions par cycle avec phases détaillées
 *
 * @example
 * const suggestions = await getFeedingSuggestions();
 * if (suggestions.has_suggestions) {
 *   suggestions.suggestions.forEach(cycleSugg => {
 *     console.log(`Cycle ${cycleSugg.cycle_name} : ${cycleSugg.summary.total_bags} sacs`);
 *   });
 * }
 */
export const getFeedingSuggestions = async (farmProfileId?: string) => {
  const response = await api.get<FeedingSuggestion>('/commerce/products/feeding_suggestions/', {
    params: farmProfileId ? { farm_profile_id: farmProfileId } : undefined,
  });
  return response.data;
};

/**
 * Simule un cycle de production complet (60-180 jours)
 *
 * Calcule :
 * - Croissance jour par jour (modèle logarithmique)
 * - Phases alimentation automatiques
 * - Besoins kg par phase
 * - Produits optimaux (20kg + 1kg)
 * - FCR estimé vs cible MAVECAM
 * - ROI prévisionnel
 *
 * @param params - Paramètres simulation
 * @returns Résultat simulation détaillé
 *
 * @example
 * const result = await simulateCycle({
 *   species: 'tilapia',
 *   initial_fish_count: 1000,
 *   target_weight_g: 300,
 * });
 * console.log(`FCR estimé : ${result.summary.estimated_fcr}`);
 * console.log(`ROI : ${result.summary.roi_percentage}%`);
 */
export const simulateCycle = async (params: CycleSimulationParams) => {
  const response = await api.post<SimulationResult>('/commerce/products/cycle_simulation/', params);
  return response.data;
};

// ============================================================================
// ENDPOINTS COMMANDES
// ============================================================================

/**
 * Récupère l'historique des commandes utilisateur
 *
 * @returns Liste commandes avec items pré-chargés
 */
export const getOrders = async () => {
  const response = await api.get<Order[]>('/commerce/orders/');
  return response.data;
};

/**
 * Récupère les détails d'une commande spécifique
 *
 * @param orderId - UUID de la commande
 * @returns Détails commande avec items et snapshot adresse
 */
export const getOrderDetail = async (orderId: string) => {
  const response = await api.get<Order>(`/commerce/orders/${orderId}/`);
  return response.data;
};

/**
 * Crée une nouvelle commande (offline-first)
 *
 * Workflow :
 * 1. Backend valide items et livraison
 * 2. Récupère produits + calcule sous-total
 * 3. Calcule frais livraison selon règles MAVECAM
 * 4. Snapshot adresse utilisateur (immutable)
 * 5. Génère order_number (ORD-YYYYMMDD-XXXX)
 * 6. Crée Order + OrderItems en transaction
 * 7. Déduplication via client_uuid si offline
 *
 * Règles frais livraison :
 * - Pickup (retrait magasin) : 0 FCFA
 * - Douala + >= 20 sacs : 0 FCFA (livraison gratuite)
 * - Tous autres cas : 3,000 FCFA
 *
 * @param orderData - Payload commande
 * @returns Commande créée avec items
 *
 * @example
 * import { v4 as uuidv4 } from 'uuid';
 *
 * const order = await createOrder({
 *   items: [
 *     { product_id: 'uuid-product-1', quantity: 2 },
 *     { product_id: 'uuid-product-2', quantity: 3 },
 *   ],
 *   delivery_method: 'home',
 *   client_uuid: uuidv4(), // Généré client-side pour offline
 *   created_offline: false,
 * });
 */
export const createOrder = async (orderData: CreateOrderPayload) => {
  const response = await api.post<Order>('/commerce/orders/', orderData);
  return response.data;
};

/**
 * Récupère statistiques commandes utilisateur
 *
 * @returns Métriques globales (total dépensé, nombre commandes, etc.)
 *
 * @example
 * const stats = await getOrderStatistics();
 * console.log(`Total dépensé : ${stats.total_spent} FCFA`);
 * console.log(`${stats.total_orders} commandes passées`);
 */
export const getOrderStatistics = async () => {
  const response = await api.get<OrderStatistics>('/commerce/orders/statistics/');
  return response.data;
};

/**
 * Preview frais de livraison AVANT création commande
 *
 * Permet affichage temps réel dans panier pendant sélection items.
 *
 * @param data - Items panier + méthode livraison
 * @returns Preview montants (subtotal, frais, total)
 *
 * @example
 * const preview = await previewDeliveryFee({
 *   items: [{ product_id: 'uuid', quantity: 2 }],
 *   delivery_method: 'home',
 * });
 * console.log(`Frais livraison : ${preview.delivery_fee} FCFA`);
 * console.log(`Livraison gratuite : ${preview.free_delivery_threshold_reached}`);
 */
export const previewDeliveryFee = async (data: {
  items: Array<{ product_id: string; quantity: number }>;
  delivery_method: 'home' | 'pickup';
}) => {
  const response = await api.post<DeliveryFeePreview>('/commerce/orders/preview_delivery_fee/', data);
  return response.data;
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Products
  getProducts,
  getProductDetail,
  getRecommendedProduct,
  getFeedingSuggestions,
  simulateCycle,

  // Orders
  getOrders,
  getOrderDetail,
  createOrder,
  getOrderStatistics,
  previewDeliveryFee,
};
