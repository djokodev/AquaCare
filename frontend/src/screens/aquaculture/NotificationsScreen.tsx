import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store/store';
import {
  fetchNotifications,
  markNotificationAsRead,
  deleteNotification,
  deleteAllReadNotifications
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

  // États locaux
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'unread' | 'read'>('all');

  // Sélecteurs Redux
  const {
    notifications,
    loading,
    error,
    unreadCount
  } = useSelector((state: RootState) => state.notifications);

  // Chargement initial
  useEffect(() => {
    dispatch(fetchNotifications());
  }, [dispatch]);

  // Fonction de rafraîchissement
  const onRefresh = React.useCallback(() => {
    dispatch(fetchNotifications());
  }, [dispatch]);

  // Filtrer les notifications
  const filteredNotifications = notifications.filter(notification => {
    if (selectedFilter === 'unread') return !notification.is_read;
    if (selectedFilter === 'read') return notification.is_read;
    return true; // 'all'
  });

  // Trier par date (plus récent en premier)
  const sortedNotifications = [...filteredNotifications].sort((a, b) => {
    return new Date(b.scheduled_for).getTime() - new Date(a.scheduled_for).getTime();
  });

  /**
   * ✅ Format de date RELATIF (spécifique aux notifications)
   * Différent de formatDate() générique dans utils.
   * Affiche: "À l'instant", "3h", "Hier", ou date complète.
   */
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
      year: 'numeric'
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
    } catch (error: any) {
      Alert.alert(t('error'), error || t('markReadError'));
    }
  };

  const handleMarkAllAsRead = () => {
    const unreadNotifications = notifications.filter(n => !n.is_read);

    if (unreadNotifications.length === 0) {
      Alert.alert(t('info'), t('noUnreadNotifications'));
      return;
    }

    Alert.alert(
      t('markAllAsRead'),
      t('markAllAsReadConfirm', { count: unreadNotifications.length }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            try {
              // Marquer toutes les notifications non lues
              await Promise.all(
                unreadNotifications.map(notification =>
                  dispatch(markNotificationAsRead(notification.id))
                )
              );
            } catch (error: any) {
              Alert.alert(t('error'), t('markAllReadError'));
            }
          }
        }
      ]
    );
  };

  const handleDeleteNotification = (notification: Notification) => {
    const warningMessage = !notification.is_read
      ? `${t('deleteNotificationConfirm')} ⚠️ Cette notification n'est pas encore lue.`
      : t('deleteNotificationConfirm');

    Alert.alert(
      t('deleteNotification'),
      warningMessage,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(deleteNotification(notification.id)).unwrap();
            } catch (error: any) {
              Alert.alert(t('error'), error || t('deleteError'));
            }
          }
        }
      ]
    );
  };

  const handleDeleteAllRead = () => {
    const readNotifications = notifications.filter(n => n.is_read);

    if (readNotifications.length === 0) {
      Alert.alert(t('info'), t('noReadNotifications'));
      return;
    }

    Alert.alert(
      t('deleteAllRead'),
      t('deleteAllReadConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(deleteAllReadNotifications()).unwrap();
            } catch (error: any) {
              Alert.alert(t('error'), error || t('deleteAllReadError'));
            }
          }
        }
      ]
    );
  };

  // Statistiques
  const totalNotifications = notifications.length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{t('notifications')}</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.headerActionButton}
              onPress={handleMarkAllAsRead}
            >
              <Ionicons name="checkmark-done" size={20} color={MAVECAM_COLORS.WHITE} />
            </TouchableOpacity>
          )}

          {notifications.filter(n => n.is_read).length > 0 && (
            <TouchableOpacity
              style={[styles.headerActionButton, { marginLeft: 8 }]}
              onPress={handleDeleteAllRead}
            >
              <Ionicons name="trash" size={20} color={MAVECAM_COLORS.WHITE} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} />
        }
      >
        {/* Statistiques résumées */}
        <View style={styles.summaryContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{totalNotifications}</Text>
            <Text style={styles.statLabel}>{t('totalNotifications')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: MAVECAM_COLORS.WARNING }]}>
              {unreadCount}
            </Text>
            <Text style={styles.statLabel}>{t('unreadNotifications')}</Text>
          </View>
        </View>

        {/* Filtres */}
        <View style={styles.filtersContainer}>
          <Text style={styles.filtersTitle}>{t('filterNotifications')}</Text>

          <View style={styles.filterButtons}>
            {(['all', 'unread', 'read'] as const).map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterButton,
                  selectedFilter === filter && styles.filterButtonActive
                ]}
                onPress={() => setSelectedFilter(filter)}
              >
                <Text style={[
                  styles.filterButtonText,
                  selectedFilter === filter && styles.filterButtonTextActive
                ]}>
                  {filter === 'all' ? t('allNotifications') :
                   filter === 'unread' ? t('unread') : t('read')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Liste des notifications */}
        <View style={styles.notificationsContainer}>
          <Text style={styles.notificationsTitle}>
            {t('notificationsList')} ({sortedNotifications.length})
          </Text>

          {loading && sortedNotifications.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
              <Text style={styles.loadingText}>{t('loading')}...</Text>
            </View>
          ) : sortedNotifications.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="notifications-outline" size={64} color={MAVECAM_COLORS.GRAY_LIGHT} />
              <Text style={styles.emptyText}>
                {selectedFilter === 'unread'
                  ? t('noUnreadNotifications')
                  : selectedFilter === 'read'
                  ? t('noReadNotifications')
                  : t('noNotifications')
                }
              </Text>
              <Text style={styles.emptySubtext}>
                {t('notificationsWillAppear')}
              </Text>
            </View>
          ) : (
            sortedNotifications.map((notification) => {
              const iconName = getNotificationIcon(notification.notification_type);
              const color = getNotificationColor(notification.notification_type);

              return (
                <View
                  key={notification.id}
                  style={[
                    styles.notificationCard,
                    !notification.is_read && styles.unreadCard
                  ]}
                >
                  <View style={styles.notificationHeader}>
                    <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
                      <Ionicons name={iconName as any} size={24} color={color} />
                    </View>

                    <View style={styles.notificationContent}>
                      <View style={styles.notificationTitleRow}>
                        <Text style={[
                          styles.notificationTitle,
                          !notification.is_read && styles.unreadTitle
                        ]}>
                          {notification.title}
                        </Text>
                      </View>

                      <Text style={styles.notificationMessage}>
                        {notification.message}
                      </Text>

                      <View style={styles.notificationFooter}>
                        <Text style={styles.notificationDate}>
                          {formatRelativeDate(notification.scheduled_for)}
                        </Text>
                        <Text style={[styles.notificationType, { color }]}>
                          {t(`notificationType_${notification.notification_type}`) || notification.notification_type}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Actions en bas de la notification */}
                  <View style={styles.notificationBottomActions}>
                    <TouchableOpacity
                      style={styles.markAsReadButton}
                      onPress={() => handleMarkAsRead(notification)}
                    >
                      <Text style={styles.markAsReadText}>
                        {notification.is_read ? t('read') : t('markAllAsRead').replace(' Toutes', '')}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteNotification(notification)}
                    >
                      <Ionicons name="trash-outline" size={16} color={MAVECAM_COLORS.ERROR} />
                      <Text style={styles.deleteButtonText}>{t('deleteNotification')}</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  header: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.WHITE,
    marginRight: 8,
  },
  unreadBadge: {
    backgroundColor: MAVECAM_COLORS.ERROR,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 12,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActionButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  summaryContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    margin: 16,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  filtersContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  filtersTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 12,
  },
  filterButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderWidth: 1,
    borderColor: MAVECAM_COLORS.GRAY_LIGHT,
  },
  filterButtonActive: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  filterButtonText: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: MAVECAM_COLORS.WHITE,
  },
  notificationsContainer: {
    paddingHorizontal: 16,
  },
  notificationsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 16,
  },
  notificationCard: {
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
  unreadCard: {
    borderLeftWidth: 4,
    borderLeftColor: MAVECAM_COLORS.GREEN_PRIMARY,
    backgroundColor: '#f0fdf4', // Très léger vert
  },
  notificationHeader: {
    flexDirection: 'row',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    flex: 1,
  },
  unreadTitle: {
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_DARK,
  },
  notificationMessage: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 8,
    lineHeight: 20,
  },
  notificationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notificationDate: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  notificationType: {
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  notificationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  notificationBottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  markAsReadButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: MAVECAM_COLORS.SUCCESS + '20',
  },
  markAsReadText: {
    fontSize: 12,
    color: MAVECAM_COLORS.SUCCESS,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: MAVECAM_COLORS.ERROR + '10',
  },
  deleteButtonText: {
    fontSize: 12,
    color: MAVECAM_COLORS.ERROR,
    fontWeight: '600',
    marginLeft: 4,
  },
});