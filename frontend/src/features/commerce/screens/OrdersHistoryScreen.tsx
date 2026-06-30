import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import {
  confirmOrderReceipt,
  fetchOrders,
  fetchOrderStatistics,
} from '@/features/commerce/store/commerceSlice';
import { Order } from '@/types/commerce';
import { AQUACARE_COLORS } from '@/constants/colors';
import { RootStackParamList } from '@/navigation/MainNavigator';

type NavigationProp = StackNavigationProp<RootStackParamList, 'OrdersHistory'>;

export default function OrdersHistoryScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch<AppDispatch>();

  const { orders } = useSelector((state: RootState) => state.commerce);
  const { items: ordersList, statistics, loading, error } = orders;
  const sacksToReceive = ordersList.reduce(
    (sum, order) => (order.status === 'received' ? sum : sum + order.total_bags),
    0
  );

  const [refreshing, setRefreshing] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchOrders());
    dispatch(fetchOrderStatistics());
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([dispatch(fetchOrders()), dispatch(fetchOrderStatistics())]);
    setRefreshing(false);
  };

  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  const handleConfirmReceipt = (order: Order) => {
    Alert.alert(
      t('confirmReceiptTitle'),
      t('confirmReceiptMessage', { orderNumber: order.order_number }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            try {
              setConfirmingOrderId(order.id);
              await dispatch(confirmOrderReceipt(order.id)).unwrap();
              await Promise.all([dispatch(fetchOrders()), dispatch(fetchOrderStatistics())]);
              Alert.alert(t('success'), t('confirmReceiptSuccess'));
            } catch {
              Alert.alert(t('error'), t('confirmReceiptError'));
            } finally {
              setConfirmingOrderId(null);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
    return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  };

  const renderOrderCard = ({ item: order }: { item: Order }) => {
    const isExpanded = expandedOrderId === order.id;
    const subtotal = parseFloat(order.subtotal);
    const deliveryFee = parseFloat(order.delivery_fee);
    const total = parseFloat(order.total);
    const isConfirming = confirmingOrderId === order.id;

    return (
      <TouchableOpacity
        className="bg-white rounded-xl p-4 mb-3"
        onPress={() => toggleOrderExpansion(order.id)}
        activeOpacity={0.8}
      >
        <View className="flex-row justify-between items-start mb-3">
          <View className="flex-1">
            <Text className="text-base font-bold text-gray-dark">{order.order_number}</Text>
            <Text className="text-xs text-gray-light mt-1">
              {formatDate(order.created_at)} - {formatTime(order.created_at)}
            </Text>
          </View>
          <Text className="text-xs font-semibold text-aquacare-primary">
            {t(isExpanded ? 'collapseActions' : 'details')}
          </Text>
        </View>

        <View className="flex-row justify-between items-center mb-3">
          <View className="px-3 py-2 rounded-full bg-cream">
            <Text className="text-xs font-semibold text-aquacare-primary">
              {order.status === 'received'
                ? t('orderStatusReceived')
                : order.status === 'delivered'
                  ? t('orderStatusDelivered')
                  : t('orderStatusConfirmed')}
            </Text>
          </View>
          <Text className="text-lg font-bold text-aquacare-primary">{total.toLocaleString()} FCFA</Text>
        </View>

        {order.status === 'delivered' && (
          <TouchableOpacity
            className={`mb-3 py-2 rounded-lg items-center ${isConfirming ? 'bg-gray-300' : 'bg-aquacare-primary'}`}
            disabled={isConfirming}
            onPress={() => handleConfirmReceipt(order)}
          >
            {isConfirming ? (
              <ActivityIndicator size="small" color={AQUACARE_COLORS.WHITE} />
            ) : (
              <Text className="text-white text-sm font-semibold">{t('confirmReceiptAction')}</Text>
            )}
          </TouchableOpacity>
        )}

        <View className="flex-row flex-wrap gap-3">
          <View className="px-3 py-2 rounded-full bg-cream">
            <Text className="text-sm text-gray-light">
              {order.total_bags} {t(order.total_bags > 1 ? 'bags' : 'bag')}
            </Text>
          </View>
          <View className="px-3 py-2 rounded-full bg-cream">
            <Text className="text-sm text-gray-light">
              {t(order.delivery_method === 'home' ? 'homeDelivery' : 'pickupStore')}
            </Text>
          </View>
          {order.is_free_delivery && (
            <View className="bg-cream px-2 py-1 rounded-full">
              <Text className="text-xs font-semibold text-aquacare-primary">{t('free')}</Text>
            </View>
          )}
        </View>

        {isExpanded && (
          <View className="mt-3">
            <View className="h-px bg-[#f1f5f9] my-4" />

            <Text className="text-sm font-semibold text-gray-dark mb-3">{t('orderItems')}</Text>
            {order.items.map((item, index) => (
              <View key={index} className="flex-row justify-between mb-3">
                <View className="flex-1 mr-3">
                  <Text className="text-xs text-gray-light font-semibold mb-1">
                    {item.product_brand.toUpperCase()}
                  </Text>
                  <Text className="text-sm text-gray-dark mb-1" numberOfLines={2}>
                    {item.product_name}
                  </Text>
                  <Text className="text-xs text-gray-light">
                    {item.product_package_weight}kg - {item.quantity}x
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs text-gray-light mb-1">
                    {parseFloat(item.unit_price).toLocaleString()} FCFA
                  </Text>
                  <Text className="text-sm font-semibold text-aquacare-primary">
                    {parseFloat(item.line_total).toLocaleString()} FCFA
                  </Text>
                </View>
              </View>
            ))}

            <View className="h-px bg-[#f1f5f9] my-4" />

            <View className="gap-2">
              <View className="flex-row justify-between items-center">
                <Text className="text-sm text-gray-dark">{t('subtotal')}</Text>
                <Text className="text-sm font-semibold text-gray-dark">{subtotal.toLocaleString()} FCFA</Text>
              </View>
              <View className="flex-row justify-between items-center">
                <Text className="text-sm text-gray-dark">{t('deliveryFee')}</Text>
                {deliveryFee === 0 ? (
                  <Text className="text-sm font-semibold text-aquacare-primary">{t('free')}</Text>
                ) : (
                  <Text className="text-sm font-semibold text-gray-dark">{deliveryFee.toLocaleString()} FCFA</Text>
                )}
              </View>
              <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-[#f1f5f9]">
                <Text className="text-base font-bold text-gray-dark">{t('total')}</Text>
                <Text className="text-lg font-bold text-aquacare-primary">{total.toLocaleString()} FCFA</Text>
              </View>
            </View>

            {order.delivery_method === 'home' && (
              <View className="mt-4">
                <View className="h-px bg-[#f1f5f9] my-3" />
                <Text className="text-sm font-semibold text-gray-dark mb-2">{t('deliveryAddress')}</Text>
                <View className="bg-cream p-3 rounded-lg">
                  <Text className="text-sm font-semibold text-gray-dark mb-1">{order.delivery_name}</Text>
                  <Text className="text-xs text-gray-light mb-2">{order.delivery_phone}</Text>
                  <Text className="text-xs text-gray-dark">{order.delivery_full_address}, {order.delivery_city}</Text>
                  <Text className="text-xs text-gray-dark">{order.delivery_region}</Text>
                </View>
              </View>
            )}

            {order.delivery_method === 'pickup' && order.pickup_location && (
              <View className="mt-4">
                <View className="h-px bg-[#f1f5f9] my-3" />
                <Text className="text-sm font-semibold text-gray-dark mb-2">{t('pickupPoint')}</Text>
                <View className="bg-cream p-3 rounded-lg">
                  <Text className="text-sm font-semibold text-aquacare-primary">
                    {t('pickupLocationPrefix')} {order.pickup_location === 'ndokoti' ? 'Ndokoti' : 'Ndogpasi'}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderStatisticsHeader = () => {
    if (!statistics) return null;

    const totalSpent = parseFloat(statistics.total_spent);

    return (
      <View className="bg-white rounded-xl p-4 mb-4">
        <Text className="text-lg font-bold text-gray-dark mb-3">{t('orderStatistics')}</Text>
        <View className="flex-row flex-wrap gap-3">
          <View className="flex-1 min-w-[45%] bg-cream rounded-lg p-4">
            <Text className="text-xl font-bold text-aquacare-primary">{statistics.total_orders}</Text>
            <Text className="text-xs text-gray-light mt-1">{t('totalOrders')}</Text>
          </View>
          <View className="flex-1 min-w-[45%] bg-cream rounded-lg p-4">
            <Text className="text-xl font-bold text-aquacare-primary">{totalSpent.toLocaleString()}</Text>
            <Text className="text-xs text-gray-light mt-1">{t('totalSpent')}</Text>
          </View>
          <View className="flex-1 min-w-[45%] bg-cream rounded-lg p-4">
            <Text className="text-xl font-bold text-aquacare-primary">{sacksToReceive}</Text>
            <Text className="text-xs text-gray-light mt-1">{t('sacksToReceive')}</Text>
          </View>
          <View className="flex-1 min-w-[45%] bg-cream rounded-lg p-4">
            <Text className="text-xl font-bold text-aquacare-primary">{statistics.total_bags_ordered}</Text>
            <Text className="text-xs text-gray-light mt-1">{t('totalBags')}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View className="py-16 items-center">
      <Text className="mt-5 text-2xl font-bold text-gray-dark">{t('noOrdersYet')}</Text>
      <Text className="mt-3 text-base text-gray-light text-center px-10">{t('noOrdersDescription')}</Text>
      <TouchableOpacity
        className="mt-6 bg-aquacare-primary px-6 py-3 rounded-lg"
        onPress={() => navigation.navigate('ProductCatalog')}
      >
        <Text className="text-white text-base font-semibold">{t('browseCatalog')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View className="flex-1 bg-cream">
      <View className="bg-white px-5 pt-16 pb-5 flex-row items-center justify-between shadow">
        <TouchableOpacity onPress={() => navigation.goBack()} className="w-10">
          <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.GRAY_DARK} />
        </TouchableOpacity>
        <View className="flex-1 items-center">
          <Text className="text-2xl font-bold text-gray-dark">{t('ordersHistory')}</Text>
          <Text className="text-sm text-gray-light mt-1">
            {ordersList.length} {t(ordersList.length > 1 ? 'orders' : 'order')}
          </Text>
        </View>
        <View className="w-10" />
      </View>

      {loading && !refreshing ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} />
          <Text className="mt-3 text-base text-gray-light">{t('loading')}</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-10 py-10">
          <Text className="mt-3 text-base text-[#dc2626] text-center">{error}</Text>
          <TouchableOpacity
            className="mt-5 bg-aquacare-primary px-6 py-3 rounded-lg"
            onPress={() => {
              dispatch(fetchOrders());
              dispatch(fetchOrderStatistics());
            }}
          >
            <Text className="text-white text-base font-semibold">{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={ordersList}
          renderItem={renderOrderCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
          ListHeaderComponent={renderStatisticsHeader}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[AQUACARE_COLORS.GREEN_PRIMARY]}
              tintColor={AQUACARE_COLORS.GREEN_PRIMARY}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
