import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store/store';
import {
  fetchNotifications,
  markNotificationAsRead,
  deleteNotification,
  deleteAllReadNotifications,
} from '@/store/slices/notificationSlice';
import { Notification } from '@/types/aquaculture';
import { MAVECAM_COLORS } from '@/constants/colors';

const NOTIFICATION_COLORS = {
  feeding_reminder: MAVECAM_COLORS.INFO,
  sampling_reminder: MAVECAM_COLORS.WARNING,
  treatment_reminder: MAVECAM_COLORS.ERROR,
  cycle_milestone: MAVECAM_COLORS.SUCCESS,
  alert: MAVECAM_COLORS.ERROR,
};

export default function NotificationsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  const [selectedFilter, setSelectedFilter] = useState<'all' | 'unread' | 'read'>('all');

  const { notifications, loading, error, unreadCount } = useSelector((state: RootState) => state.notifications);

  useEffect(() => {
    dispatch(fetchNotifications());
  }, [dispatch]);

  const onRefresh = React.useCallback(() => {
    dispatch(fetchNotifications());
  }, [dispatch]);

  const filteredNotifications = notifications.filter((notification) => {
    if (selectedFilter === 'unread') return !notification.is_read;
    if (selectedFilter === 'read') return notification.is_read;
    return true;
  });

  const sortedNotifications = [...filteredNotifications].sort(
    (a, b) => new Date(b.scheduled_for).getTime() - new Date(a.scheduled_for).getTime()
  );

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffHours < 1) return t('justNow');
    if (diffHours < 24) return `${Math.floor(diffHours)}h`;
    if (diffHours < 48) return t('yesterday');

    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
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
    return NOTIFICATION_COLORS[type as keyof typeof NOTIFICATION_COLORS] || MAVECAM_COLORS.INFO;
  };

  const handleMarkAsRead = async (notification: Notification) => {
    if (notification.is_read) return;

    try {
      await dispatch(markNotificationAsRead(notification.id)).unwrap();
    } catch (markError: any) {
      Alert.alert(t('error'), markError || t('markReadError'));
    }
  };

  const handleMarkAllAsRead = () => {
    const unreadNotifications = notifications.filter((n) => !n.is_read);

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
            await Promise.all(unreadNotifications.map((notification) => dispatch(markNotificationAsRead(notification.id))));
          } catch (markAllError: any) {
            Alert.alert(t('error'), t('markAllReadError'));
          }
        },
      },
    ]);
  };

  const handleDeleteNotification = (notification: Notification) => {
    const warningMessage = !notification.is_read
      ? `${t('deleteNotificationConfirm')} Cette notification n'est pas encore lue.`
      : t('deleteNotificationConfirm');

    Alert.alert(t('deleteNotification'), warningMessage, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await dispatch(deleteNotification(notification.id)).unwrap();
          } catch (deleteError: any) {
            Alert.alert(t('error'), deleteError || t('deleteError'));
          }
        },
      },
    ]);
  };

  const handleDeleteAllRead = () => {
    const readNotifications = notifications.filter((n) => n.is_read);

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
            await dispatch(deleteAllReadNotifications()).unwrap();
          } catch (deleteAllError: any) {
            Alert.alert(t('error'), deleteAllError || t('deleteAllReadError'));
          }
        },
      },
    ]);
  };

  const totalNotifications = notifications.length;

  const renderHeader = () => (
    <View className="bg-mavecam-primary flex-row items-center pt-14 pb-4 px-4">
      <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
      </TouchableOpacity>
      <View className="flex-1 flex-row items-center">
        <Text className="text-xl font-bold text-white mr-2">{t('notifications')}</Text>
        {unreadCount > 0 && (
          <View className="bg-error rounded-full px-2 py-0.5 min-w-[24px] items-center">
            <Text className="text-white text-xs font-bold">{unreadCount}</Text>
          </View>
        )}
      </View>
      <View className="flex-row items-center gap-2">
        {unreadCount > 0 && (
          <TouchableOpacity className="p-2 bg-white/20 rounded-md" onPress={handleMarkAllAsRead}>
            <Ionicons name="checkmark-done" size={20} color={MAVECAM_COLORS.WHITE} />
          </TouchableOpacity>
        )}
        {notifications.filter((n) => n.is_read).length > 0 && (
          <TouchableOpacity className="p-2 bg-white/20 rounded-md" onPress={handleDeleteAllRead}>
            <Ionicons name="trash" size={20} color={MAVECAM_COLORS.WHITE} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (error) {
    return (
      <View className="flex-1 bg-cream">
        {renderHeader()}
        <View className="flex-1 items-center justify-center p-6">
          <Ionicons name="alert-circle" size={48} color={MAVECAM_COLORS.ERROR} />
          <Text className="text-lg text-error text-center mt-3">{error}</Text>
          <TouchableOpacity className="mt-4 bg-mavecam-primary px-5 py-3 rounded-lg" onPress={() => dispatch(fetchNotifications())}>
            <Text className="text-white text-base font-semibold">{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      {renderHeader()}

      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}>
        <View className="bg-white mx-4 mt-4 mb-4 p-4 rounded-xl shadow flex-row justify-around">
          <View className="items-center">
            <Text className="text-2xl font-bold text-mavecam-primary">{totalNotifications}</Text>
            <Text className="text-xs text-gray-light text-center">{t('totalNotifications')}</Text>
          </View>
          <View className="items-center">
            <Text className="text-2xl font-bold text-warning">{unreadCount}</Text>
            <Text className="text-xs text-gray-light text-center">{t('unreadNotifications')}</Text>
          </View>
        </View>

        <View className="bg-white mx-4 mb-4 p-4 rounded-xl shadow">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('filterNotifications')}</Text>
          <View className="flex-row justify-around">
            {(['all', 'unread', 'read'] as const).map((filter) => (
              <TouchableOpacity
                key={filter}
                className={`px-4 py-2 rounded-full border ${
                  selectedFilter === filter ? 'bg-mavecam-primary border-mavecam-primary' : 'bg-cream border-gray-light'
                }`}
                onPress={() => setSelectedFilter(filter)}
              >
                <Text
                  className={`text-sm font-medium ${
                    selectedFilter === filter ? 'text-white' : 'text-gray-dark'
                  }`}
                >
                  {filter === 'all' ? t('allNotifications') : filter === 'unread' ? t('unread') : t('read')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="px-4">
          <Text className="text-lg font-bold text-gray-dark mb-4">
            {t('notificationsList')} ({sortedNotifications.length})
          </Text>

          {loading && sortedNotifications.length === 0 ? (
            <View className="items-center py-10">
              <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
              <Text className="text-sm text-gray-light mt-3">{t('loading')}...</Text>
            </View>
          ) : sortedNotifications.length === 0 ? (
            <View className="items-center py-10">
              <Ionicons name="notifications-outline" size={64} color={MAVECAM_COLORS.GRAY_LIGHT} />
              <Text className="text-lg font-bold text-gray-dark mt-3">
                {selectedFilter === 'unread'
                  ? t('noUnreadNotifications')
                  : selectedFilter === 'read'
                  ? t('noReadNotifications')
                  : t('noNotifications')}
              </Text>
              <Text className="text-sm text-gray-light text-center mt-1">{t('notificationsWillAppear')}</Text>
            </View>
          ) : (
            sortedNotifications.map((notification) => {
              const iconName = getNotificationIcon(notification.notification_type);
              const color = getNotificationColor(notification.notification_type);

              return (
                <View
                  key={notification.id}
                  className={`bg-white rounded-xl p-4 mb-3 shadow ${!notification.is_read ? 'border-l-4 border-l-mavecam-primary bg-[#f0fdf4]' : ''}`}
                >
                  <View className="flex-row">
                    <View className="w-12 h-12 rounded-full items-center justify-center mr-3" style={{ backgroundColor: `${color}20` }}>
                      <Ionicons name={iconName as any} size={24} color={color} />
                    </View>

                    <View className="flex-1">
                      <View className="flex-row items-center mb-1">
                        <Text className={`text-base font-semibold flex-1 ${!notification.is_read ? 'text-mavecam-primary' : 'text-gray-dark'}`}>
                          {notification.title}
                        </Text>
                      </View>

                      <Text className="text-sm text-gray-light mb-2 leading-5">{notification.message}</Text>

                      <View className="flex-row justify-between items-center">
                        <Text className="text-xs text-gray-light">{formatRelativeDate(notification.scheduled_for)}</Text>
                        <Text className="text-xs font-semibold" style={{ color }}>
                          {t(`notificationType_${notification.notification_type}`) || notification.notification_type}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className="flex-row justify-between items-center pt-3 mt-2 border-t border-slate-100">
                    <TouchableOpacity
                      className="px-3 py-2 rounded-md bg-success/10"
                      onPress={() => handleMarkAsRead(notification)}
                    >
                      <Text className="text-xs font-semibold text-success">
                        {notification.is_read ? t('read') : t('markAllAsRead').replace(' Toutes', '')}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className="px-3 py-2 rounded-md bg-error/10 flex-row items-center"
                      onPress={() => handleDeleteNotification(notification)}
                    >
                      <Ionicons name="trash-outline" size={16} color={MAVECAM_COLORS.ERROR} />
                      <Text className="ml-2 text-xs font-semibold text-error">{t('deleteNotification')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
