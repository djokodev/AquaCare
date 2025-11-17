/**
 * Redux Slice - Module Commerce MAVECAM AquaCare
 *
 * Gestion état global pour :
 * - Catalogue produits (22 produits MAVECAM)
 * - Panier utilisateur (offline-first)
 * - Commandes et historique
 * - Suggestions alimentation intelligentes
 * - Simulations cycles production
 *
 * Architecture :
 * - Actions sync : addToCart, removeFromCart, setFilters, etc.
 * - Actions async (thunks) : fetchProducts, createOrder, etc.
 * - State = miroir backend (pas de calculs métier)
 *
 * @module store/slices/commerceSlice
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import {
  CommerceState,
  Product,
  ProductFilters,
  CartItem,
  DeliveryMethod,
  PickupLocation,
  Order,
  CreateOrderPayload,
  OrderStatistics,
  DeliveryFeePreview,
  FeedingSuggestion,
  CycleSimulationParams,
  SimulationResult,
} from '../../types/commerce';
import commerceApi from '../../services/commerce/commerceApi';

// ============================================================================
// ÉTAT INITIAL
// ============================================================================

const initialState: CommerceState = {
  products: {
    items: [],
    loading: false,
    error: null,
    filters: {},
  },
  cart: {
    items: [],
    delivery_method: 'home',
    pickup_location: undefined,
    deliveryPreview: null,
    previewLoading: false,
  },
  orders: {
    items: [],
    statistics: null,
    loading: false,
    error: null,
  },
  suggestions: {
    data: null,
    loading: false,
    error: null,
  },
  simulation: {
    result: null,
    loading: false,
    error: null,
  },
};

// ============================================================================
// THUNKS ASYNC - PRODUITS
// ============================================================================

/**
 * Récupère liste produits avec filtres optionnels
 */
export const fetchProducts = createAsyncThunk(
  'commerce/fetchProducts',
  async (filters: ProductFilters | undefined, { rejectWithValue }) => {
    try {
      const products = await commerceApi.getProducts(filters);
      return products;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Erreur récupération produits');
    }
  }
);

/**
 * Récupère détails produit spécifique
 */
export const fetchProductDetail = createAsyncThunk(
  'commerce/fetchProductDetail',
  async (productId: string, { rejectWithValue }) => {
    try {
      const product = await commerceApi.getProductDetail(productId);
      return product;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Erreur récupération produit');
    }
  }
);

/**
 * Récupère produit recommandé selon espèce et poids
 */
export const fetchRecommendedProduct = createAsyncThunk(
  'commerce/fetchRecommendedProduct',
  async (
    { species, weightG }: { species: 'tilapia' | 'catfish'; weightG: number },
    { rejectWithValue }
  ) => {
    try {
      const product = await commerceApi.getRecommendedProduct(species, weightG);
      return product;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Erreur recommandation produit');
    }
  }
);

/**
 * Récupère suggestions alimentation intelligentes
 */
export const fetchFeedingSuggestions = createAsyncThunk(
  'commerce/fetchFeedingSuggestions',
  async (farmProfileId: string | undefined, { rejectWithValue }) => {
    try {
      const suggestions = await commerceApi.getFeedingSuggestions(farmProfileId);
      return suggestions;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Erreur récupération suggestions');
    }
  }
);

/**
 * Lance simulation cycle production
 */
export const fetchCycleSimulation = createAsyncThunk(
  'commerce/fetchCycleSimulation',
  async (params: CycleSimulationParams, { rejectWithValue }) => {
    try {
      const result = await commerceApi.simulateCycle(params);
      return result;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Erreur simulation cycle');
    }
  }
);

// ============================================================================
// THUNKS ASYNC - COMMANDES
// ============================================================================

/**
 * Récupère historique commandes utilisateur
 */
export const fetchOrders = createAsyncThunk(
  'commerce/fetchOrders',
  async (_, { rejectWithValue }) => {
    try {
      const orders = await commerceApi.getOrders();
      return orders;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Erreur récupération commandes');
    }
  }
);

/**
 * Récupère détails commande spécifique
 */
export const fetchOrderDetail = createAsyncThunk(
  'commerce/fetchOrderDetail',
  async (orderId: string, { rejectWithValue }) => {
    try {
      const order = await commerceApi.getOrderDetail(orderId);
      return order;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Erreur récupération commande');
    }
  }
);

/**
 * Crée nouvelle commande (offline-first)
 */
export const createOrder = createAsyncThunk(
  'commerce/createOrder',
  async (orderData: CreateOrderPayload, { rejectWithValue }) => {
    try {
      const order = await commerceApi.createOrder(orderData);
      return order;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Erreur création commande');
    }
  }
);

/**
 * Récupère statistiques commandes utilisateur
 */
export const fetchOrderStatistics = createAsyncThunk(
  'commerce/fetchOrderStatistics',
  async (_, { rejectWithValue }) => {
    try {
      const stats = await commerceApi.getOrderStatistics();
      return stats;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Erreur récupération statistiques');
    }
  }
);

/**
 * Preview frais livraison
 */
export const fetchDeliveryFeePreview = createAsyncThunk(
  'commerce/fetchDeliveryFeePreview',
  async (
    data: { items: Array<{ product_id: string; quantity: number }>; delivery_method: DeliveryMethod },
    { rejectWithValue }
  ) => {
    try {
      const preview = await commerceApi.previewDeliveryFee(data);
      return preview;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Erreur preview frais livraison');
    }
  }
);

// ============================================================================
// SLICE
// ============================================================================

const commerceSlice = createSlice({
  name: 'commerce',
  initialState,
  reducers: {
    // ========================================================================
    // ACTIONS SYNC - FILTRES PRODUITS
    // ========================================================================

    /**
     * Applique filtres recherche produits
     */
    applyFilters: (state, action: PayloadAction<ProductFilters>) => {
      state.products.filters = action.payload;
    },

    /**
     * Réinitialise filtres produits
     */
    resetFilters: (state) => {
      state.products.filters = {};
    },

    // ========================================================================
    // ACTIONS SYNC - PANIER
    // ========================================================================

    /**
     * Ajoute produit au panier (ou augmente quantité si existe)
     */
    addToCart: (state, action: PayloadAction<{ product: Product; quantity: number }>) => {
      const { product, quantity } = action.payload;
      const existingItem = state.cart.items.find((item) => item.product.id === product.id);

      if (existingItem) {
        // Produit déjà dans panier → augmente quantité
        existingItem.quantity += quantity;
      } else {
        // Nouveau produit
        state.cart.items.push({ product, quantity });
      }

      // Reset preview (sera recalculé)
      state.cart.deliveryPreview = null;
    },

    /**
     * Supprime produit du panier
     */
    removeFromCart: (state, action: PayloadAction<string>) => {
      state.cart.items = state.cart.items.filter((item) => item.product.id !== action.payload);
      state.cart.deliveryPreview = null;
    },

    /**
     * Met à jour quantité produit dans panier
     */
    updateCartQuantity: (
      state,
      action: PayloadAction<{ productId: string; quantity: number }>
    ) => {
      const { productId, quantity } = action.payload;
      const item = state.cart.items.find((item) => item.product.id === productId);

      if (item) {
        if (quantity <= 0) {
          // Quantité 0 → supprime
          state.cart.items = state.cart.items.filter((item) => item.product.id !== productId);
        } else {
          item.quantity = quantity;
        }
      }

      state.cart.deliveryPreview = null;
    },

    /**
     * Vide panier complètement
     */
    clearCart: (state) => {
      state.cart.items = [];
      state.cart.deliveryPreview = null;
    },

    /**
     * Définit méthode livraison
     */
    setDeliveryMethod: (state, action: PayloadAction<DeliveryMethod>) => {
      state.cart.delivery_method = action.payload;

      // Reset pickup_location si passage à home
      if (action.payload === 'home') {
        state.cart.pickup_location = undefined;
      }

      state.cart.deliveryPreview = null;
    },

    /**
     * Définit localisation retrait (si pickup)
     */
    setPickupLocation: (state, action: PayloadAction<PickupLocation | undefined>) => {
      state.cart.pickup_location = action.payload;
    },

    // ========================================================================
    // ACTIONS SYNC - RESET ÉTATS
    // ========================================================================

    /**
     * Reset état suggestions
     */
    resetSuggestions: (state) => {
      state.suggestions.data = null;
      state.suggestions.error = null;
    },

    /**
     * Reset état simulation
     */
    resetSimulation: (state) => {
      state.simulation.result = null;
      state.simulation.error = null;
    },
  },

  extraReducers: (builder) => {
    // ========================================================================
    // REDUCERS ASYNC - PRODUITS
    // ========================================================================

    builder
      .addCase(fetchProducts.pending, (state) => {
        state.products.loading = true;
        state.products.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.products.loading = false;
        state.products.items = action.payload;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.products.loading = false;
        state.products.error = action.payload as string;
      });

    builder
      .addCase(fetchFeedingSuggestions.pending, (state) => {
        state.suggestions.loading = true;
        state.suggestions.error = null;
      })
      .addCase(fetchFeedingSuggestions.fulfilled, (state, action) => {
        state.suggestions.loading = false;
        state.suggestions.data = action.payload;
      })
      .addCase(fetchFeedingSuggestions.rejected, (state, action) => {
        state.suggestions.loading = false;
        state.suggestions.error = action.payload as string;
      });

    builder
      .addCase(fetchCycleSimulation.pending, (state) => {
        state.simulation.loading = true;
        state.simulation.error = null;
      })
      .addCase(fetchCycleSimulation.fulfilled, (state, action) => {
        state.simulation.loading = false;
        state.simulation.result = action.payload;
      })
      .addCase(fetchCycleSimulation.rejected, (state, action) => {
        state.simulation.loading = false;
        state.simulation.error = action.payload as string;
      });

    // ========================================================================
    // REDUCERS ASYNC - COMMANDES
    // ========================================================================

    builder
      .addCase(fetchOrders.pending, (state) => {
        state.orders.loading = true;
        state.orders.error = null;
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.orders.loading = false;
        state.orders.items = action.payload;
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        state.orders.loading = false;
        state.orders.error = action.payload as string;
      });

    builder
      .addCase(fetchOrderDetail.pending, (state) => {
        state.orders.loading = true;
        state.orders.error = null;
      })
      .addCase(fetchOrderDetail.fulfilled, (state, action) => {
        state.orders.loading = false;
        // Ajoute ou met à jour commande dans liste
        const existingIndex = state.orders.items.findIndex((o) => o.id === action.payload.id);
        if (existingIndex >= 0) {
          state.orders.items[existingIndex] = action.payload;
        } else {
          state.orders.items.push(action.payload);
        }
      })
      .addCase(fetchOrderDetail.rejected, (state, action) => {
        state.orders.loading = false;
        state.orders.error = action.payload as string;
      });

    builder
      .addCase(createOrder.pending, (state) => {
        state.orders.loading = true;
        state.orders.error = null;
      })
      .addCase(createOrder.fulfilled, (state, action) => {
        state.orders.loading = false;
        // Ajoute commande créée en tête de liste
        state.orders.items.unshift(action.payload);
        // Vide panier après création réussie
        state.cart.items = [];
        state.cart.deliveryPreview = null;
      })
      .addCase(createOrder.rejected, (state, action) => {
        state.orders.loading = false;
        state.orders.error = action.payload as string;
      });

    builder
      .addCase(fetchOrderStatistics.pending, (state) => {
        state.orders.loading = true;
        state.orders.error = null;
      })
      .addCase(fetchOrderStatistics.fulfilled, (state, action) => {
        state.orders.loading = false;
        state.orders.statistics = action.payload;
      })
      .addCase(fetchOrderStatistics.rejected, (state, action) => {
        state.orders.loading = false;
        state.orders.error = action.payload as string;
      });

    builder
      .addCase(fetchDeliveryFeePreview.pending, (state) => {
        state.cart.previewLoading = true;
      })
      .addCase(fetchDeliveryFeePreview.fulfilled, (state, action) => {
        state.cart.previewLoading = false;
        state.cart.deliveryPreview = action.payload;
      })
      .addCase(fetchDeliveryFeePreview.rejected, (state) => {
        state.cart.previewLoading = false;
        state.cart.deliveryPreview = null;
      });
  },
});

// ============================================================================
// EXPORTS
// ============================================================================

export const {
  applyFilters,
  resetFilters,
  addToCart,
  removeFromCart,
  updateCartQuantity,
  clearCart,
  setDeliveryMethod,
  setPickupLocation,
  resetSuggestions,
  resetSimulation,
} = commerceSlice.actions;

export default commerceSlice.reducer;
