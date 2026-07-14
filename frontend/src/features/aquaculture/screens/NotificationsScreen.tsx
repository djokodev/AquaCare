import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View, FlatList, RefreshControl, Alert, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import { AppDispatch, RootState } from '@/store/store';
import {
  fetchNotifications,
  fetchNotificationsSilent,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllReadNotifications,
} from '@/features/notifications/store/notificationSlice';
import { Notification } from '@/types/notifications';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AppHeader, AppText, Badge, Button, Card, EmptyState, ErrorState, IconButton, LoadingState, SegmentedControl } from '@/components/ui';
import { colors, spacing } from '@/theme';

const NOTIFICATION_COLORS = {
  feeding_reminder: colors.status.info,
  sampling_reminder: colors.status.warning,
  treatment_reminder: colors.status.error,
  cycle_milestone: colors.status.success,
  alert: colors.status.error,
  new_message: colors.status.success,
};

const NOTIFICATION_SURFACES = {
  feeding_reminder: colors.status.infoSurface,
  sampling_reminder: colors.status.warningSurface,
  treatment_reminder: colors.status.errorSurface,
  cycle_milestone: colors.status.successSurface,
  alert: colors.status.errorSurface,
  new_message: colors.status.successSurface,
};

type NotificationsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Notifications'>;
type NotificationsScreenRouteProp = RouteProp<RootStackParamList, 'Notifications'>;

interface NotificationsScreenProps {
  navigation: NotificationsScreenNavigationProp;
}

interface ErrorWithMessage {
  message?: string;
}

type NotificationCycleContext =
  | {
      kind: 'name';
      value: string;
    }
  | {
      kind: 'tag';
      value: string;
    }
  | null;

const getNotificationMetadataString = (
  metadata: Record<string, unknown>,
  keys: string[]
): string | null => {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const resolveNotificationCycleContext = (metadata: Record<string, unknown>): NotificationCycleContext => {
  const cycleName = getNotificationMetadataString(metadata, [
    'cycle_name',
    'cycleName',
    'cycle_label',
    'cycleLabel',
    'production_cycle_name',
    'productionCycleName',
  ]);
  if (cycleName) {
    return { kind: 'name', value: cycleName };
  }

  const cycleId = getNotificationMetadataString(metadata, [
    'cycle_id',
    'cycleId',
    'production_cycle_id',
    'productionCycleId',
  ]);
  if (cycleId) {
    return { kind: 'tag', value: cycleId.slice(0, 8) };
  }

  return null;
};

export default function NotificationsScreen({ navigation }: NotificationsScreenProps) {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const route = useRoute<NotificationsScreenRouteProp>();
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const [selectedFilter, setSelectedFilter] = useState<'all' | 'unread' | 'read'>('all');

  const { notifications, loading, error, unreadCount } = useSelector((state: RootState) => state.notifications);
  const currentCycleId = useSelector((state: RootState) => state.aquaculture.currentCycle?.id);
  const effectiveCycleId = route.params?.cycleId ?? currentCycleId;

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current) {
      return;
    }

    pollingRef.current = setInterval(() => {
      dispatch(fetchNotificationsSilent({ cycleId: effectiveCycleId }));
    }, 4000);
  }, [dispatch, effectiveCycleId]);

  useEffect(() => {
    dispatch(fetchNotifications({ cycleId: effectiveCycleId }));
  }, [dispatch, effectiveCycleId]);

  useFocusEffect(
    useCallback(() => {
      dispatch(fetchNotificationsSilent({ cycleId: effectiveCycleId }));
      startPolling();

      return () => {
        stopPolling();
      };
    }, [dispatch, effectiveCycleId, startPolling, stopPolling])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        dispatch(fetchNotificationsSilent({ cycleId: effectiveCycleId }));
      }
    });

    return () => subscription.remove();
  }, [dispatch, effectiveCycleId]);

  const onRefresh = React.useCallback(() => {
    dispatch(fetchNotifications({ cycleId: effectiveCycleId }));
  }, [dispatch, effectiveCycleId]);

  const sortedNotifications = useMemo(
    () =>
      [...notifications]
        .filter((notification) => {
          if (selectedFilter === 'unread') return !notification.is_read;
          if (selectedFilter === 'read') return notification.is_read;
          return true;
        })
        .sort(
          (a, b) => new Date(b.scheduled_for).getTime() - new Date(a.scheduled_for).getTime()
        ),
    [notifications, selectedFilter]
  );
  const readNotificationsCount = useMemo(
    () => notifications.filter((notification) => notification.is_read).length,
    [notifications]
  );

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffHours < 1) return t('justNow');
    if (diffHours < 24) return `${Math.floor(diffHours)}h`;
    if (diffHours < 48) return t('yesterday');

    return date.toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getNotificationIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'new_message':
        return 'chatbubbles-outline';
      case 'feeding_reminder':
        return 'restaurant-outline';
      case 'sampling_reminder':
        return 'scale-outline';
      case 'treatment_reminder':
        return 'medical-outline';
      case 'cycle_milestone':
        return 'trophy-outline';
      case 'alert':
        return 'alert-circle-outline';
      default:
        return 'notifications-outline';
    }
  };

  const getNotificationColor = (type: string) => {
    return NOTIFICATION_COLORS[type as keyof typeof NOTIFICATION_COLORS] || colors.status.info;
  };

  const getNotificationSurface = (type: string) => {
    return NOTIFICATION_SURFACES[type as keyof typeof NOTIFICATION_SURFACES] || colors.status.infoSurface;
  };

  const handleMarkAsRead = async (notification: Notification) => {
    if (notification.is_read) return;

    try {
      await dispatch(markNotificationAsRead(notification.id)).unwrap();
    } catch (markError: unknown) {
      const errorWithMessage = markError as ErrorWithMessage;
      Alert.alert(t('error'), errorWithMessage.message || t('markReadError'));
    }
  };

  const handleMarkAllAsRead = () => {
    const unreadNotifications = notifications.filter((notification) => !notification.is_read);

    if (unreadNotifications.length === 0) {
      Alert.alert(t('info'), t('noUnreadNotifications'));
      return;
    }

    Alert.alert(t('markAllAsRead'), t('markAllAsReadConfirm', { count: unreadNotifications.length }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        onPress: async () => {
          try {
            await dispatch(markAllNotificationsAsRead({ cycleId: effectiveCycleId })).unwrap();
          } catch {
            Alert.alert(t('error'), t('markAllReadError'));
          }
        },
      },
    ]);
  };

  const handleDeleteNotification = (notification: Notification) => {
    const warningMessage = !notification.is_read
      ? `${t('deleteNotificationConfirm')} ${t('notificationNotReadWarning')}`
      : t('deleteNotificationConfirm');

    Alert.alert(t('deleteNotification'), warningMessage, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await dispatch(deleteNotification(notification.id)).unwrap();
          } catch (deleteError: unknown) {
            const errorWithMessage = deleteError as ErrorWithMessage;
            Alert.alert(t('error'), errorWithMessage.message || t('deleteError'));
          }
        },
      },
    ]);
  };

  const handleDeleteAllRead = () => {
    const readNotifications = notifications.filter((notification) => notification.is_read);

    if (readNotifications.length === 0) {
      Alert.alert(t('info'), t('noReadNotifications'));
      return;
    }

    Alert.alert(t('deleteAllRead'), t('deleteAllReadConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await dispatch(deleteAllReadNotifications({ cycleId: effectiveCycleId })).unwrap();
          } catch (deleteAllError: unknown) {
            const errorWithMessage = deleteAllError as ErrorWithMessage;
            Alert.alert(t('error'), errorWithMessage.message || t('deleteAllReadError'));
          }
        },
      },
    ]);
  };

  const totalNotifications = notifications.length;

  const renderNotificationItem = useCallback(
    ({ item: notification }: { item: Notification }) => {
      const iconName = getNotificationIcon(notification.notification_type);
      const color = getNotificationColor(notification.notification_type);
      const surfaceColor = getNotificationSurface(notification.notification_type);
      const cycleContext = resolveNotificationCycleContext(notification.metadata || {});

      return (
        <Card variant={notification.is_read ? 'outlined' : 'selected'} style={styles.notificationCard}>
          <View style={styles.notificationRow}>
            <View style={[styles.iconSurface, { backgroundColor: surfaceColor }]}>
              <Ionicons name={iconName} size={24} color={color} />
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong" color={notification.is_read ? 'primary' : 'link'}>{notification.title}</AppText>
              <AppText variant="body" color="muted" style={styles.message}>{notification.message}</AppText>

              {cycleContext ? (
                <Badge tone="brand" label={cycleContext.kind === 'name' ? t('notificationCycleContext', { cycleName: cycleContext.value }) : t('notificationCycleTag', { cycleTag: cycleContext.value })} />
              ) : null}
              <View style={styles.metaRow}>
                <AppText variant="caption" color="muted">{formatRelativeDate(notification.scheduled_for)}</AppText>
                <AppText variant="caption" style={{ color }}>{t(`notificationType_${notification.notification_type}`, notification.notification_type)}</AppText>
              </View>
            </View>
          </View>
          <View style={styles.actions}>
            <Button label={notification.is_read ? t('read') : t('markAsRead')} variant="ghost" size="small" fullWidth={false} disabled={notification.is_read} onPress={() => handleMarkAsRead(notification)} />
            <Button label={t('deleteNotification')} variant="ghost" size="small" fullWidth={false} iconLeft="trash-outline" onPress={() => handleDeleteNotification(notification)} />
          </View>
        </Card>
      );
    },
    [t, i18n.language]
  );

  const renderListHeader = useCallback(
    () => (
      <View style={styles.listHeader}>
        <Card variant="outlined" style={styles.metrics}>
          <View style={styles.metric}>
            <AppText variant="metric" color="link">{totalNotifications}</AppText>
            <AppText variant="caption" color="muted" style={styles.center}>{t('totalNotifications')}</AppText>
          </View>
          <View style={styles.metric}>
            <AppText variant="metric" color="warning">{unreadCount}</AppText>
            <AppText variant="caption" color="muted" style={styles.center}>{t('unreadNotifications')}</AppText>
          </View>
        </Card>
        <AppText variant="label">{t('filterNotifications')}</AppText>
        <SegmentedControl value={selectedFilter} options={[
          { value: 'all', label: t('allNotifications') },
          { value: 'unread', label: t('unread') },
          { value: 'read', label: t('read') },
        ]} onChange={(value) => setSelectedFilter(value as typeof selectedFilter)} />
        <AppText variant="sectionTitle">{t('notificationsList')} ({sortedNotifications.length})</AppText>
      </View>
    ),
    [selectedFilter, sortedNotifications.length, t, totalNotifications, unreadCount]
  );

  const renderEmptyList = useCallback(
    () => {
      if (loading) return <LoadingState message={t('loading')} />;
      return <EmptyState title={selectedFilter === 'unread' ? t('noUnreadNotifications') : selectedFilter === 'read' ? t('noReadNotifications') : t('noNotifications')} message={t('notificationsWillAppear')} />;
    },
    [loading, selectedFilter, t]
  );

  const renderHeader = () => <AppHeader title={t('notifications')} subtitle={unreadCount > 0 ? `${unreadCount} ${t('unread')}` : undefined} onBack={() => navigation.goBack()} backLabel={t('back')} rightAction={<View style={styles.headerActions}>{unreadCount > 0 ? <IconButton icon="checkmark-done" tone="inverse" variant="ghost" accessibilityLabel={t('markAllAsRead')} onPress={handleMarkAllAsRead} /> : null}{readNotificationsCount > 0 ? <IconButton icon="trash" tone="inverse" variant="ghost" accessibilityLabel={t('deleteAllRead')} onPress={handleDeleteAllRead} /> : null}</View>} />;

  if (error) {
    return (
      <View className="flex-1 bg-cream">
        {renderHeader()}
        <ErrorState title={error ? t(error) : t('error')} actionLabel={t('retry')} onAction={() => dispatch(fetchNotifications({ cycleId: effectiveCycleId }))} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      {renderHeader()}

      <FlatList
        data={sortedNotifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotificationItem}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmptyList}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.brand.primary} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing[4], paddingBottom: spacing[6], gap: spacing[3] },
  listHeader: { gap: spacing[3], marginBottom: spacing[1] },
  metrics: { flexDirection: 'row', justifyContent: 'space-around' },
  metric: { flex: 1, alignItems: 'center', gap: spacing[1] },
  center: { textAlign: 'center' },
  notificationCard: { gap: spacing[3], marginBottom: spacing[3] },
  notificationRow: { flexDirection: 'row', gap: spacing[3] },
  iconSurface: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  message: { marginVertical: spacing[2] },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing[2], marginTop: spacing[2] },
  actions: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.subtle, paddingTop: spacing[2] },
  headerActions: { flexDirection: 'row' },
});
