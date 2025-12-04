/**
 * Service API Commerce MAVECAM AquaCare
 *
 * Ce service gÃ¨re toutes les communications avec le backend Django
 * pour le module Commerce (produits alimentaires et commandes).
 *
 * Architecture :
 * - Utilise client Axios existant (@/servic@/services/api)
 * - Auto-refresh JWT automatique (dÃ©jÃ  configurÃ©)
 * - Gestion erreurs rÃ©seau (offline-first)
 * - Timeout 10s pour zones rurales Cameroun
 *
 * Endpoints backend :
 * - GET@/services/api/commerce/products/
 * - GET@/services/api/commerce/products/{id}/
 * - GET@/services/api/commerce/products/recommended/
 * - GET@/services/api/commerce/products/feeding_suggestions/
 * - POS@/services/api/commerce/products/cycle_simulation/
 * - GET@/services/api/commerce/orders/
 * - POS@/services/api/commerce/orders/
 * - GET@/services/api/commerce/orders/{id}/
 * - GET@/services/api/commerce/orders/statistics/
 * - POS@/services/api/commerce/orders/preview_delivery_fee/
 *
 * @module services/commerce/commerceApi
 */

import { apiService as api } from '@/services/api';
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
} from '@/types/commerce';

// ============================================================================
// ENDPOINTS PRODUITS
// ============================================================================

/**
 * RÃ©cupÃ¨re la liste des produits avec filtres optionnels
 *
 * @param filters - Filtres de recherche (espÃ¨ce, phase, marque, texte)
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
 * RÃ©cupÃ¨re les dÃ©tails d'un produit spÃ©cifique
 *
 * @param productId - UUID du produit
 * @returns DÃ©tails complets du produit
 */
export const getProductDetail = async (productId: string) => {
  const response = await api.get<Product>(`/commerce/products/${productId}/`);
  return response.data;
};

/**
 * RÃ©cupÃ¨re le produit recommandÃ© selon espÃ¨ce et poids poisson
 *
 * Utilise algorithme backend de recommandation granulomÃ©trie
 * basÃ© sur poids moyen actuel des poissons.
 *
 * @param species - EspÃ¨ce ('tilapia' ou 'catfish')
 * @param weightG - Poids moyen poisson en grammes
 * @returns Produit recommandÃ© (prioritÃ© Aller Aqua)
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
 * RÃ©cupÃ¨re suggestions alimentation intelligentes
 *
 * Analyse cycles actifs utilisateur et gÃ©nÃ¨re recommandations
 * multi-granulomÃ©trie basÃ©es sur :
 * - Historique logs 30 derniers jours
 * - Poids moyen actuel dÃ©tectÃ©
 * - Projection changements futurs taille aliments
 * - Buffer sÃ©curitÃ© +7 jours
 *
 * @param farmProfileId - UUID profil ferme (optionnel)
 * @returns Suggestions par cycle avec phases dÃ©taillÃ©es
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
 * - Croissance jour par jour (modÃ¨le logarithmique)
 * - Phases alimentation automatiques
 * - Besoins kg par phase
 * - Produits optimaux (20kg + 1kg)
 * - FCR estimÃ© vs cible MAVECAM
 * - ROI prÃ©visionnel
 *
 * @param params - ParamÃ¨tres simulation
 * @returns RÃ©sultat simulation dÃ©taillÃ©
 *
 * @example
 * const result = await simulateCycle({
 *   species: 'tilapia',
 *   initial_fish_count: 1000,
 *   target_weight_g: 300,
 * });
 * console.log(`FCR estimÃ© : ${result.summary.estimated_fcr}`);
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
 * RÃ©cupÃ¨re l'historique des commandes utilisateur
 *
 * @returns Liste commandes avec items prÃ©-chargÃ©s
 */
export const getOrders = async () => {
  const response = await api.get<Order[] | { results: Order[] }>('/commerce/orders/');
  const data = response.data as any;
  return Array.isArray(data) ? data : data.results;
};

/**
 * RÃ©cupÃ¨re les dÃ©tails d'une commande spÃ©cifique
 *
 * @param orderId - UUID de la commande
 * @returns DÃ©tails commande avec items et snapshot adresse
 */
export const getOrderDetail = async (orderId: string) => {
  const response = await api.get<Order>(`/commerce/orders/${orderId}/`);
  return response.data;
};

/**
 * CrÃ©e une nouvelle commande (offline-first)
 *
 * Workflow :
 * 1. Backend valide items et livraison
 * 2. RÃ©cupÃ¨re produits + calcule sous-total
 * 3. Calcule frais livraison selon rÃ¨gles MAVECAM
 * 4. Snapshot adresse utilisateur (immutable)
 * 5. GÃ©nÃ¨re order_number (ORD-YYYYMMDD-XXXX)
 * 6. CrÃ©e Order + OrderItems en transaction
 * 7. DÃ©duplication via client_uuid si offline
 *
 * RÃ¨gles frais livraison :
 * - Pickup (retrait magasin) : 0 FCFA
 * - Douala + >= 20 sacs : 0 FCFA (livraison gratuite)
 * - Tous autres cas : 3,000 FCFA
 *
 * @param orderData - Payload commande
 * @returns Commande crÃ©Ã©e avec items
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
 *   client_uuid: uuidv4(), // GÃ©nÃ©rÃ© client-side pour offline
 *   created_offline: false,
 * });
 */
export const createOrder = async (orderData: CreateOrderPayload) => {
  const response = await api.post<Order>('/commerce/orders/', orderData);
  return response.data;
};

/**
 * RÃ©cupÃ¨re statistiques commandes utilisateur
 *
 * @returns MÃ©triques globales (total dÃ©pensÃ©, nombre commandes, etc.)
 *
 * @example
 * const stats = await getOrderStatistics();
 * console.log(`Total dÃ©pensÃ© : ${stats.total_spent} FCFA`);
 * console.log(`${stats.total_orders} commandes passÃ©es`);
 */
export const getOrderStatistics = async () => {
  const response = await api.get<OrderStatistics>('/commerce/orders/statistics/');
  return response.data;
};

/**
 * Preview frais de livraison AVANT crÃ©ation commande
 *
 * Permet affichage temps rÃ©el dans panier pendant sÃ©lection items.
 *
 * @param data - Items panier + mÃ©thode livraison
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





