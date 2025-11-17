/**
 * OrdersHistoryScreen - Historique Commandes MAVECAM
 *
 * Écran d'affichage de l'historique des commandes avec :
 * - Liste commandes triées par date (plus récentes en premier)
 * - Filtrage par période et statut
 * - Détails commande (items, montants, livraison)
 * - Statistiques globales (total dépensé, nb commandes)
 * - Pull-to-refresh
 * - États vide/erreur/loading gérés
 *
 * @screen commerce/OrdersHistoryScreen
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchOrders, fetchOrderStatistics } from '@/store/slices/commerceSlice';
import { Order } from '@/types/commerce';
import { MAVECAM_COLORS } from '@/constants/colors';

export default function OrdersHistoryScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const dispatch = useDispatch<AppDispatch>();

  // Redux state
  const { orders } = useSelector((state: RootState) => state.commerce);
  const { items: ordersList, statistics, loading, error } = orders;

  // Local state
  const [refreshing, setRefreshing] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Fetch orders au mount
  useEffect(() => {
    dispatch(fetchOrders());
    dispatch(fetchOrderStatistics());
  }, []);

  // Pull-to-refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([dispatch(fetchOrders()), dispatch(fetchOrderStatistics())]);
    setRefreshing(false);
  };

  // Toggle expansion détails commande
  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Format heure
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Render order card
  const renderOrderCard = ({ item: order }: { item: Order }) => {
    const isExpanded = expandedOrderId === order.id;
    const subtotal = parseFloat(order.subtotal);
    const deliveryFee = parseFloat(order.delivery_fee);
    const total = parseFloat(order.total);

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => toggleOrderExpansion(order.id)}
        activeOpacity={0.7}
      >
        {/* Header commande */}
        <View style={styles.orderHeader}>
          <View style={styles.orderHeaderLeft}>
            <Ionicons name="receipt-outline" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <View style={styles.orderHeaderInfo}>
              <Text style={styles.orderNumber}>{order.order_number}</Text>
              <Text style={styles.orderDate}>
                {formatDate(order.created_at)} • {formatTime(order.created_at)}
              </Text>
            </View>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color={MAVECAM_COLORS.GRAY_LIGHT}
          />
        </View>

        {/* Badge statut + montant */}
        <View style={styles.orderSummaryRow}>
          <View style={[styles.statusBadge, styles.statusConfirmed]}>
            <Ionicons name="checkmark-circle" size={16} color={MAVECAM_COLORS.SUCCESS} />
            <Text style={styles.statusText}>{t('confirmed')}</Text>
          </View>
          <Text style={styles.orderTotal}>{total.toLocaleString()} FCFA</Text>
        </View>

        {/* Info rapide */}
        <View style={styles.quickInfo}>
          <View style={styles.quickInfoItem}>
            <Ionicons name="cube-outline" size={16} color={MAVECAM_COLORS.GRAY_LIGHT} />
            <Text style={styles.quickInfoText}>
              {order.total_bags} {t(order.total_bags > 1 ? 'bags' : 'bag')}
            </Text>
          </View>
          <View style={styles.quickInfoItem}>
            <Ionicons
              name={order.delivery_method === 'home' ? 'home-outline' : 'storefront-outline'}
              size={16}
              color={MAVECAM_COLORS.GRAY_LIGHT}
            />
            <Text style={styles.quickInfoText}>
              {t(order.delivery_method === 'home' ? 'homeDelivery' : 'pickupStore')}
            </Text>
          </View>
          {order.is_free_delivery && (
            <View style={[styles.quickInfoItem, styles.freeDeliveryBadge]}>
              <Ionicons name="gift-outline" size={16} color={MAVECAM_COLORS.SUCCESS} />
              <Text style={styles.freeDeliveryText}>{t('free')}</Text>
            </View>
          )}
        </View>

        {/* Détails expandable */}
        {isExpanded && (
          <View style={styles.orderDetails}>
            <View style={styles.divider} />

            {/* Items commande */}
            <Text style={styles.detailsTitle}>{t('orderItems')}</Text>
            {order.items.map((item, index) => (
              <View key={index} style={styles.orderItem}>
                <View style={styles.orderItemLeft}>
                  <Text style={styles.orderItemBrand}>{item.product_brand.toUpperCase()}</Text>
                  <Text style={styles.orderItemName} numberOfLines={2}>
                    {item.product_name}
                  </Text>
                  <Text style={styles.orderItemSpecs}>
                    {item.product_package_weight}kg • {item.quantity}x
                  </Text>
                </View>
                <View style={styles.orderItemRight}>
                  <Text style={styles.orderItemPrice}>
                    {parseFloat(item.unit_price).toLocaleString()} FCFA
                  </Text>
                  <Text style={styles.orderItemTotal}>
                    {parseFloat(item.line_total).toLocaleString()} FCFA
                  </Text>
                </View>
              </View>
            ))}

            <View style={styles.divider} />

            {/* Montants détaillés */}
            <View style={styles.amountsSection}>
              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>{t('subtotal')}</Text>
                <Text style={styles.amountValue}>{subtotal.toLocaleString()} FCFA</Text>
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>{t('deliveryFee')}</Text>
                {deliveryFee === 0 ? (
                  <Text style={[styles.amountValue, styles.freeText]}>{t('free')}</Text>
                ) : (
                  <Text style={styles.amountValue}>{deliveryFee.toLocaleString()} FCFA</Text>
                )}
              </View>
              <View style={[styles.amountRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>{t('total')}</Text>
                <Text style={styles.totalValue}>{total.toLocaleString()} FCFA</Text>
              </View>
            </View>

            {/* Adresse livraison */}
            {order.delivery_method === 'home' && (
              <>
                <View style={styles.divider} />
                <Text style={styles.detailsTitle}>{t('deliveryAddress')}</Text>
                <View style={styles.addressSection}>
                  <Text style={styles.addressName}>{order.delivery_name}</Text>
                  <Text style={styles.addressPhone}>{order.delivery_phone}</Text>
                  <Text style={styles.addressText}>
                    {order.delivery_full_address}, {order.delivery_city}
                  </Text>
                  <Text style={styles.addressText}>{order.delivery_region}</Text>
                </View>
              </>
            )}

            {/* Point retrait */}
            {order.delivery_method === 'pickup' && order.pickup_location && (
              <>
                <View style={styles.divider} />
                <Text style={styles.detailsTitle}>{t('pickupPoint')}</Text>
                <View style={styles.pickupSection}>
                  <Ionicons name="location" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                  <Text style={styles.pickupLocation}>
                    MAVECAM {order.pickup_location === 'ndokoti' ? 'Ndokoti' : 'Ndogpasi'}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Render statistics header
  const renderStatisticsHeader = () => {
    if (!statistics) return null;

    const totalSpent = parseFloat(statistics.total_spent);
    const avgOrderValue = parseFloat(statistics.average_order_value);

    return (
      <View style={styles.statisticsContainer}>
        <Text style={styles.statisticsTitle}>{t('orderStatistics')}</Text>
        <View style={styles.statisticsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="receipt-outline" size={32} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text style={styles.statValue}>{statistics.total_orders}</Text>
            <Text style={styles.statLabel}>{t('totalOrders')}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="wallet-outline" size={32} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text style={styles.statValue}>{totalSpent.toLocaleString()}</Text>
            <Text style={styles.statLabel}>{t('totalSpent')}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="cube-outline" size={32} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text style={styles.statValue}>{statistics.total_bags_ordered}</Text>
            <Text style={styles.statLabel}>{t('totalBags')}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trending-up-outline" size={32} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text style={styles.statValue}>{avgOrderValue.toLocaleString()}</Text>
            <Text style={styles.statLabel}>{t('averageOrder')}</Text>
          </View>
        </View>
      </View>
    );
  };

  // Empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="receipt-outline" size={100} color={MAVECAM_COLORS.GRAY_LIGHT} />
      <Text style={styles.emptyTitle}>{t('noOrdersYet')}</Text>
      <Text style={styles.emptyDescription}>{t('noOrdersDescription')}</Text>
      <TouchableOpacity
        style={styles.browseCatalogButton}
        onPress={() => navigation.navigate('ProductCatalog' as never)}
      >
        <Ionicons name="albums-outline" size={20} color={MAVECAM_COLORS.WHITE} />
        <Text style={styles.browseCatalogButtonText}>{t('browseCatalog')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.GRAY_DARK} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('ordersHistory')}</Text>
          <Text style={styles.headerSubtitle}>
            {ordersList.length} {t(ordersList.length > 1 ? 'orders' : 'order')}
          </Text>
        </View>
        <View style={styles.backButton} />
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text style={styles.loadingText}>{t('loading')}</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={MAVECAM_COLORS.ERROR} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              dispatch(fetchOrders());
              dispatch(fetchOrderStatistics());
            }}
          >
            <Text style={styles.retryButtonText}>{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={ordersList}
          renderItem={renderOrderCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderStatisticsHeader}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[MAVECAM_COLORS.GREEN_PRIMARY]}
              tintColor={MAVECAM_COLORS.GREEN_PRIMARY}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  header: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  backButton: {
    width: 40,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  headerSubtitle: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: MAVECAM_COLORS.ERROR,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  statisticsContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statisticsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 16,
  },
  statisticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 4,
    textAlign: 'center',
  },
  orderCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  orderHeaderInfo: {
    marginLeft: 12,
    flex: 1,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  orderDate: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 2,
  },
  orderSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statusConfirmed: {
    backgroundColor: '#d1fae5',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: MAVECAM_COLORS.SUCCESS,
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  quickInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickInfoText: {
    fontSize: 13,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  freeDeliveryBadge: {
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  freeDeliveryText: {
    fontSize: 12,
    fontWeight: '600',
    color: MAVECAM_COLORS.SUCCESS,
  },
  orderDetails: {
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 16,
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 12,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  orderItemLeft: {
    flex: 1,
    marginRight: 12,
  },
  orderItemBrand: {
    fontSize: 10,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    fontWeight: '600',
    marginBottom: 2,
  },
  orderItemName: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 4,
  },
  orderItemSpecs: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  orderItemRight: {
    alignItems: 'flex-end',
  },
  orderItemPrice: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 4,
  },
  orderItemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  amountsSection: {
    gap: 8,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  freeText: {
    color: MAVECAM_COLORS.SUCCESS,
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  addressSection: {
    backgroundColor: MAVECAM_COLORS.CREAM,
    padding: 12,
    borderRadius: 8,
  },
  addressName: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 4,
  },
  addressPhone: {
    fontSize: 13,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 8,
  },
  addressText: {
    fontSize: 13,
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 2,
  },
  pickupSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MAVECAM_COLORS.CREAM,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  pickupLocation: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 20,
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  emptyDescription: {
    marginTop: 12,
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  browseCatalogButton: {
    marginTop: 24,
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  browseCatalogButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
});
