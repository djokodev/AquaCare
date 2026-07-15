import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { confirmOrderReceipt, fetchOrders, fetchOrderStatistics } from '@/features/commerce/store/commerceSlice';
import { getOrderStatusLabelKey } from '@/features/commerce/utils/orderStatus';
import { Order } from '@/types/commerce';
import { RootStackParamList } from '@/navigation/MainNavigator';
import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  DashboardHeroCard,
  DashboardMetricCard,
  DashboardSection,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  InlineAlert,
  LoadingState,
  formatDashboardCurrency,
  formatDashboardNumber,
} from '@/components/ui';
import { colors, spacing } from '@/theme';
import { getProductDisplayName } from '@/features/commerce/utils/productPresentation';
import { useDashboardSyncStatus } from '@/hooks/useDashboardSyncStatus';

type NavigationProp = StackNavigationProp<RootStackParamList, 'OrdersHistory'>;

export default function OrdersHistoryScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch<AppDispatch>();
  const { items, statistics, loading, error } = useSelector((state: RootState) => state.commerce.orders);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const confirmingOrderRef = useRef<string | null>(null);
  const { lastSyncedAt, refreshLastSyncedAt } = useDashboardSyncStatus('orders');
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';

  const loadOrders = useCallback(async () => {
    await Promise.all([dispatch(fetchOrders()), dispatch(fetchOrderStatistics())]);
    await refreshLastSyncedAt();
  }, [dispatch, refreshLastSyncedAt]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadOrders(); } finally { setRefreshing(false); }
  }, [loadOrders]);

  const sacksToReceive = useMemo(
    () => items.reduce((sum, order) => order.status === 'received' ? sum : sum + order.total_bags, 0),
    [items]
  );

  const formatDateTime = useCallback((value: string) => {
    const date = new Date(value);
    const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
    return `${date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })} · ${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
  }, [i18n.language]);

  const handleConfirmReceipt = useCallback((order: Order) => {
    Alert.alert(t('confirmReceiptTitle'), t('confirmReceiptMessage', { orderNumber: order.order_number }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('confirm'), onPress: async () => {
        if (confirmingOrderRef.current) return;
        try {
          confirmingOrderRef.current = order.id;
          setConfirmingOrderId(order.id);
          await dispatch(confirmOrderReceipt(order.id)).unwrap();
          await loadOrders();
          Alert.alert(t('success'), t('confirmReceiptSuccess'));
        } catch { Alert.alert(t('error'), t('confirmReceiptError')); }
        finally {
          confirmingOrderRef.current = null;
          setConfirmingOrderId(null);
        }
      } },
    ]);
  }, [dispatch, loadOrders, t]);

  const renderOrder = useCallback(({ item: order }: { item: Order }) => {
    const expanded = expandedOrderId === order.id;
    const deliveryFee = Number(order.delivery_fee);
    return (
      <Card variant="outlined" style={styles.orderCard}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <AppText variant="cardTitle">{order.order_number}</AppText>
            <AppText variant="caption" color="muted">{formatDateTime(order.created_at)}</AppText>
          </View>
          <IconButton
            icon={expanded ? 'chevron-up' : 'chevron-down'}
            accessibilityLabel={t(expanded ? 'collapseActions' : 'details')}
            accessibilityState={{ expanded }}
            onPress={() => setExpandedOrderId(expanded ? null : order.id)}
            variant="ghost"
          />
        </View>
        <View style={styles.rowBetween}>
          <Badge label={t(getOrderStatusLabelKey(order.status))} tone={order.status === 'received' ? 'success' : 'info'} />
          <AppText variant="sectionTitle" color="link">{Number(order.total).toLocaleString()} FCFA</AppText>
        </View>
        <View style={styles.badges}>
          <Badge label={`${order.total_bags} ${t(order.total_bags > 1 ? 'bags' : 'bag')}`} />
          <Badge label={t(order.delivery_method === 'home' ? 'homeDelivery' : 'pickupStore')} />
          {order.is_free_delivery ? <Badge label={t('free')} tone="success" /> : null}
        </View>
        {order.status === 'delivered' ? (
          <Button label={t('confirmReceiptAction')} loading={confirmingOrderId === order.id} onPress={() => handleConfirmReceipt(order)} />
        ) : null}

        {expanded ? (
          <View style={styles.details}>
            <Divider />
            <AppText variant="bodyStrong">{t('orderItems')}</AppText>
            {order.items.map((line) => (
              <View key={`${line.product_name}-${line.quantity}`} style={styles.rowBetween}>
                <View style={styles.flex}>
                  <AppText variant="caption" color="muted">{line.product_brand.toUpperCase()}</AppText>
                  <AppText numberOfLines={2}>{getProductDisplayName(line.product_name, t('catfish'))}</AppText>
                  <AppText variant="caption" color="muted">{line.product_package_weight}kg · {line.quantity}x</AppText>
                </View>
                <AppText variant="bodyStrong" color="link">{Number(line.line_total).toLocaleString()} FCFA</AppText>
              </View>
            ))}
            <Divider />
            <AmountRow label={t('subtotal')} value={`${Number(order.subtotal).toLocaleString()} FCFA`} />
            <AmountRow label={t('deliveryFee')} value={deliveryFee === 0 ? t('free') : `${deliveryFee.toLocaleString()} FCFA`} />
            <AmountRow label={t('total')} value={`${Number(order.total).toLocaleString()} FCFA`} strong />
            {order.delivery_method === 'home' ? (
              <Card style={styles.address}>
                <AppText variant="bodyStrong">{t('deliveryAddress')}</AppText>
                <AppText>{order.delivery_name}</AppText>
                <AppText variant="caption" color="muted">{order.delivery_phone}</AppText>
                <AppText variant="caption">{order.delivery_full_address}, {order.delivery_city}</AppText>
                <AppText variant="caption">{order.delivery_region}</AppText>
              </Card>
            ) : order.pickup_location ? (
              <Card style={styles.address}>
                <AppText variant="bodyStrong">{t('pickupPoint')}</AppText>
                <AppText color="link">{t('pickupLocationPrefix')} {order.pickup_location === 'ndokoti' ? 'Ndokoti' : 'Ndogpasi'}</AppText>
              </Card>
            ) : null}
          </View>
        ) : null}
      </Card>
    );
  }, [expandedOrderId, confirmingOrderId, formatDateTime, handleConfirmReceipt, t]);

  const listHeader = (
    <View style={styles.listHeader}>
      {error && items.length > 0 ? <InlineAlert tone="error" message={error} /> : null}
      {statistics ? (
        <DashboardSection title={t('orderStatistics')} lastSyncedAt={lastSyncedAt}>
          <DashboardHeroCard
            icon="wallet-outline"
            label={t('totalSpent')}
            value={formatDashboardCurrency(statistics.total_spent, locale)}
            unit={t('dashboardDirectProductionCostUnit')}
            helper={`${t('orderCount', { count: statistics.total_orders })} · ${t('orderedBagCount', { count: statistics.total_bags_ordered })}`}
            unavailableLabel={t('dashboardDataUnavailable')}
          />
          <View style={styles.metricGrid}>
            <DashboardMetricCard
              icon="receipt-outline"
              value={formatDashboardNumber(statistics.total_orders, locale, { maximumFractionDigits: 0 })}
              label={t('totalOrders')}
              unavailableLabel={t('dashboardDataUnavailable')}
            />
            <DashboardMetricCard
              icon="time-outline"
              value={formatDashboardNumber(sacksToReceive, locale, { maximumFractionDigits: 0 })}
              label={t('sacksToReceive')}
              tone="warning"
              unavailableLabel={t('dashboardDataUnavailable')}
            />
            <DashboardMetricCard
              icon="bag-handle-outline"
              value={formatDashboardNumber(statistics.total_bags_ordered, locale, { maximumFractionDigits: 0 })}
              label={t('totalBags')}
              tone="info"
              unavailableLabel={t('dashboardDataUnavailable')}
            />
          </View>
        </DashboardSection>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <AppHeader title={t('ordersHistory')} subtitle={t('orderCount', { count: items.length })} onBack={() => navigation.goBack()} backLabel={t('back')} />
      {loading && !refreshing && items.length === 0 ? <LoadingState message={t('loading')} /> : error && items.length === 0 ? (
        <ErrorState title={error} actionLabel={t('retry')} onAction={loadOrders} />
      ) : (
        <FlatList
          data={items}
          renderItem={renderOrder}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={<EmptyState title={t('noOrdersYet')} message={t('noOrdersDescription')} actionLabel={t('browseCatalog')} onAction={() => navigation.navigate('ProductCatalog')} />}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.brand.primary]} tintColor={colors.brand.primary} />}
        />
      )}
    </View>
  );
}

function AmountRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <View style={styles.rowBetween}><AppText variant={strong ? 'bodyStrong' : 'body'}>{label}</AppText><AppText variant={strong ? 'cardTitle' : 'bodyStrong'} color={strong ? 'link' : 'primary'}>{value}</AppText></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.dashboard },
  content: { padding: spacing[4], gap: spacing[3] },
  flex: { flex: 1 },
  orderCard: { marginBottom: spacing[3], gap: spacing[3] },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  details: { gap: spacing[3] },
  address: { backgroundColor: colors.surface.selected, gap: spacing[1] },
  listHeader: { gap: spacing[3], marginBottom: spacing[4] },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
});
