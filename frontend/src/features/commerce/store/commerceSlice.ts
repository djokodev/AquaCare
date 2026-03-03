import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import {
  CommerceState,
  Product,
  ProductFilters,
  DeliveryMethod,
  PickupLocation,
  CycleSimulationParams,
  CreateOrderPayload,
} from '@/types/commerce';
import commerceApi from '@/features/commerce/services/commerceApi';

const extractApiErrorMessage = (error: unknown, fallback: string): string => {
  const err = error as any;
  const data = err?.response?.data;

  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  if (data && typeof data === 'object') {
    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message;
    }
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }
    if (typeof data.detail === 'string' && data.detail.trim()) {
      return data.detail;
    }
    if (Array.isArray(data.non_field_errors) && data.non_field_errors.length > 0) {
      return String(data.non_field_errors[0]);
    }

    for (const value of Object.values(data)) {
      if (Array.isArray(value) && value.length > 0) {
        const first = value[0];
        if (typeof first === 'string' && first.trim()) {
          return first;
        }
      }
    }
  }

  if (typeof err?.message === 'string' && err.message.trim()) {
    return err.message;
  }

  return fallback;
};

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

export const fetchProducts = createAsyncThunk(
  'commerce/fetchProducts',
  async (filters: ProductFilters | undefined, { rejectWithValue }) => {
    try {
      return await commerceApi.getProducts(filters);
    } catch (error) {
      return rejectWithValue(extractApiErrorMessage(error, 'Erreur récupération produits'));
    }
  }
);

export const fetchProductDetail = createAsyncThunk(
  'commerce/fetchProductDetail',
  async (productId: string, { rejectWithValue }) => {
    try {
      return await commerceApi.getProductDetail(productId);
    } catch (error) {
      return rejectWithValue(extractApiErrorMessage(error, 'Erreur récupération produit'));
    }
  }
);

export const fetchRecommendedProduct = createAsyncThunk(
  'commerce/fetchRecommendedProduct',
  async (
    { species, weightG }: { species: 'tilapia' | 'catfish'; weightG: number },
    { rejectWithValue }
  ) => {
    try {
      return await commerceApi.getRecommendedProduct(species, weightG);
    } catch (error) {
      return rejectWithValue(extractApiErrorMessage(error, 'Erreur recommandation produit'));
    }
  }
);

export const fetchFeedingSuggestions = createAsyncThunk(
  'commerce/fetchFeedingSuggestions',
  async (
    options: { farmProfileId?: string; cycleId?: string } | undefined,
    { rejectWithValue }
  ) => {
    try {
      return await commerceApi.getFeedingSuggestions(options);
    } catch (error) {
      return rejectWithValue(extractApiErrorMessage(error, 'Erreur récupération suggestions'));
    }
  }
);

export const fetchCycleSimulation = createAsyncThunk(
  'commerce/fetchCycleSimulation',
  async (params: CycleSimulationParams, { rejectWithValue }) => {
    try {
      return await commerceApi.simulateCycle(params);
    } catch (error) {
      return rejectWithValue(extractApiErrorMessage(error, 'Erreur simulation cycle'));
    }
  }
);

export const fetchOrders = createAsyncThunk(
  'commerce/fetchOrders',
  async (_, { rejectWithValue }) => {
    try {
      return await commerceApi.getOrders();
    } catch (error) {
      return rejectWithValue(extractApiErrorMessage(error, 'Erreur récupération commandes'));
    }
  }
);

export const fetchOrderDetail = createAsyncThunk(
  'commerce/fetchOrderDetail',
  async (orderId: string, { rejectWithValue }) => {
    try {
      return await commerceApi.getOrderDetail(orderId);
    } catch (error) {
      return rejectWithValue(extractApiErrorMessage(error, 'Erreur récupération commande'));
    }
  }
);

export const createOrder = createAsyncThunk(
  'commerce/createOrder',
  async (orderData: CreateOrderPayload, { rejectWithValue }) => {
    try {
      return await commerceApi.createOrder(orderData);
    } catch (error) {
      return rejectWithValue(extractApiErrorMessage(error, 'Erreur création commande'));
    }
  }
);

export const confirmOrderReceipt = createAsyncThunk(
  'commerce/confirmOrderReceipt',
  async (orderId: string, { rejectWithValue }) => {
    try {
      return await commerceApi.confirmOrderReceipt(orderId);
    } catch (error) {
      return rejectWithValue(extractApiErrorMessage(error, 'Erreur confirmation réception'));
    }
  }
);

export const fetchOrderStatistics = createAsyncThunk(
  'commerce/fetchOrderStatistics',
  async (_, { rejectWithValue }) => {
    try {
      return await commerceApi.getOrderStatistics();
    } catch (error) {
      return rejectWithValue(extractApiErrorMessage(error, 'Erreur récupération statistiques'));
    }
  }
);

export const fetchDeliveryFeePreview = createAsyncThunk(
  'commerce/fetchDeliveryFeePreview',
  async (
    data: { items: Array<{ product_id: string; quantity: number }>; delivery_method: DeliveryMethod },
    { rejectWithValue }
  ) => {
    try {
      return await commerceApi.previewDeliveryFee(data);
    } catch (error) {
      return rejectWithValue(extractApiErrorMessage(error, 'Erreur preview frais livraison'));
    }
  }
);

const commerceSlice = createSlice({
  name: 'commerce',
  initialState,
  reducers: {
    applyFilters: (state, action: PayloadAction<ProductFilters>) => {
      state.products.filters = action.payload;
    },
    resetFilters: (state) => {
      state.products.filters = {};
    },
    addToCart: (state, action: PayloadAction<{ product: Product; quantity: number }>) => {
      const { product, quantity } = action.payload;
      const existingItem = state.cart.items.find((item) => item.product.id === product.id);

      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        state.cart.items.push({ product, quantity });
      }

      state.cart.deliveryPreview = null;
    },
    removeFromCart: (state, action: PayloadAction<string>) => {
      state.cart.items = state.cart.items.filter((item) => item.product.id !== action.payload);
      state.cart.deliveryPreview = null;
    },
    updateCartQuantity: (
      state,
      action: PayloadAction<{ productId: string; quantity: number }>
    ) => {
      const { productId, quantity } = action.payload;
      const item = state.cart.items.find((entry) => entry.product.id === productId);

      if (item) {
        if (quantity <= 0) {
          state.cart.items = state.cart.items.filter((entry) => entry.product.id !== productId);
        } else {
          item.quantity = quantity;
        }
      }

      state.cart.deliveryPreview = null;
    },
    clearCart: (state) => {
      state.cart.items = [];
      state.cart.deliveryPreview = null;
    },
    setDeliveryMethod: (state, action: PayloadAction<DeliveryMethod>) => {
      state.cart.delivery_method = action.payload;
      if (action.payload === 'home') {
        state.cart.pickup_location = undefined;
      }
      state.cart.deliveryPreview = null;
    },
    setPickupLocation: (state, action: PayloadAction<PickupLocation | undefined>) => {
      state.cart.pickup_location = action.payload;
    },
    resetSuggestions: (state) => {
      state.suggestions.data = null;
      state.suggestions.error = null;
    },
    resetSimulation: (state) => {
      state.simulation.result = null;
      state.simulation.error = null;
    },
  },
  extraReducers: (builder) => {
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
        const existingIndex = state.orders.items.findIndex((order) => order.id === action.payload.id);
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
        state.orders.items.unshift(action.payload);
      })
      .addCase(createOrder.rejected, (state, action) => {
        state.orders.loading = false;
        state.orders.error = action.payload as string;
      });

    builder
      .addCase(confirmOrderReceipt.pending, (state) => {
        state.orders.loading = true;
        state.orders.error = null;
      })
      .addCase(confirmOrderReceipt.fulfilled, (state, action) => {
        state.orders.loading = false;
        const existingIndex = state.orders.items.findIndex((order) => order.id === action.payload.id);
        if (existingIndex >= 0) {
          state.orders.items[existingIndex] = action.payload;
        } else {
          state.orders.items.unshift(action.payload);
        }
      })
      .addCase(confirmOrderReceipt.rejected, (state, action) => {
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
