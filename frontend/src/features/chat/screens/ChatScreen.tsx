/**
 * ChatScreen
 *
 * Main chat conversation screen
 * Displays messages between user and administration
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  TouchableOpacity,
  Image,
  Platform,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch } from '@/store/store';
import {
  fetchConversation,
  fetchMessages,
  sendTextMessage,
  sendMediaMessage,
  markMessagesAsRead,
  syncOfflineQueue,
  loadOfflineQueue,
  selectConversation,
  selectMessages,
  selectConversationLoading,
  selectMessagesLoading,
  selectSendingMessage,
  selectConversationError,
  selectMessagesError,
  selectOfflineQueueCount,
  selectSyncingOffline,
} from '../store/chatSlice';
import { fetchNotificationsSilent } from '@/features/notifications/store/notificationSlice';
import { offlineService } from '@/services/offlineService';
import { MessageBubble } from '../components/MessageBubble';
import { MessageComposer } from '../components/MessageComposer';
import type { Conversation, Message, MediaType } from '../types/chat';
import { AUTO_REFRESH_INTERVAL_MS } from '../domain/constants';

/**
 * MAVECAM Design System Colors
 */
const COLORS = {
  GREEN_PRIMARY: '#059669',
  WHITE: '#ffffff',
  CREAM: '#f8fafc',
  GRAY_LIGHT: '#64748b',
  GRAY_DARK: '#1e293b',
  ERROR: '#dc2626',
};

export function ChatScreen() {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  // Redux state
  const conversation = useSelector(selectConversation);
  const messages = useSelector(selectMessages);
  const conversationLoading = useSelector(selectConversationLoading);
  const messagesLoading = useSelector(selectMessagesLoading);
  const sendingMessage = useSelector(selectSendingMessage);
  const conversationError = useSelector(selectConversationError);
  const messagesError = useSelector(selectMessagesError);
  const offlineQueueCount = useSelector(selectOfflineQueueCount);
  const syncingOffline = useSelector(selectSyncingOffline);

  // Local state
  const [refreshing, setRefreshing] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isScreenFocusedRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const syncOfflineMessagesIfOnline = useCallback(async (conversationId?: string) => {
    if (offlineQueueCount === 0 || syncingOffline) {
      return;
    }

    const isOnline = await offlineService.isOnline();
    if (!isOnline) {
      return;
    }

    const syncResult = await dispatch(syncOfflineQueue());
    if (syncOfflineQueue.fulfilled.match(syncResult)) {
      await dispatch(loadOfflineQueue());
      if (conversationId && syncResult.payload.successCount > 0) {
        await dispatch(fetchMessages({ conversationId, page: 1 }));
      }
    }
  }, [offlineQueueCount, syncingOffline, dispatch]);

  /**
   * Load conversation and messages on mount
   */
  useEffect(() => {
    const loadData = async () => {
      // Load offline queue first
      await dispatch(loadOfflineQueue());

      // Fetch conversation
      const convResult = await dispatch(fetchConversation());

      // If conversation exists, fetch messages
      if (convResult.meta.requestStatus === 'fulfilled' && convResult.payload) {
        const conversationId = (convResult.payload as Conversation).id;
        await dispatch(fetchMessages({ conversationId, page: 1 }));
      }

      await syncOfflineMessagesIfOnline(
        convResult.meta.requestStatus === 'fulfilled' && convResult.payload
          ? (convResult.payload as Conversation).id
          : undefined
      );
    };

    loadData();
  }, [dispatch, syncOfflineMessagesIfOnline]);

  /**
   * Auto-scroll to bottom when new messages arrive
   */
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 300);
    }
  }, [messages.length]);

  /**
   * Helpers to start/stop polling
   */
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const fetchLatestChatData = useCallback(() => {
    if (!conversation) {
      return;
    }

    dispatch(fetchMessages({ conversationId: conversation.id, page: 1 }));
    dispatch(fetchNotificationsSilent());
  }, [conversation, dispatch]);

  const startPolling = useCallback(() => {
    if (!conversation || pollingRef.current) {
      return;
    }

    pollingRef.current = setInterval(() => {
      fetchLatestChatData();
    }, AUTO_REFRESH_INTERVAL_MS);
  }, [conversation, fetchLatestChatData]);

  /**
   * Mark messages as read when screen is focused + manage polling lifecycle
   */
  useFocusEffect(
    useCallback(() => {
      isScreenFocusedRef.current = true;

      if (conversation && conversation.unread_count_user > 0) {
        dispatch(markMessagesAsRead(conversation.id));
      }

      fetchLatestChatData();
      void syncOfflineMessagesIfOnline(conversation?.id);
      startPolling();

      return () => {
        isScreenFocusedRef.current = false;
        stopPolling();
      };
    }, [
      dispatch,
      conversation,
      fetchLatestChatData,
      startPolling,
      stopPolling,
      syncOfflineMessagesIfOnline,
    ])
  );

  /**
   * Restart polling when conversation becomes available while screen is focused
   */
  useEffect(() => {
    if (conversation && isScreenFocusedRef.current) {
      fetchLatestChatData();
      stopPolling();
      startPolling();
    }
  }, [conversation, fetchLatestChatData, startPolling, stopPolling]);

  /**
   * Refetch when app returns to foreground (helps after backgrounded)
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active' && isScreenFocusedRef.current) {
        fetchLatestChatData();
        void syncOfflineMessagesIfOnline(conversation?.id);
      }
    });

    return () => subscription.remove();
  }, [fetchLatestChatData, syncOfflineMessagesIfOnline, conversation?.id]);

  /**
   * Pull to refresh
   */
  const handleRefresh = useCallback(async () => {
    if (!conversation) return;

    setRefreshing(true);
    try {
      await Promise.all([
        dispatch(fetchMessages({ conversationId: conversation.id, page: 1 })),
        dispatch(fetchNotificationsSilent()),
      ]);
      await syncOfflineMessagesIfOnline(conversation.id);
    } finally {
      setRefreshing(false);
    }
  }, [dispatch, conversation, syncOfflineMessagesIfOnline]);

  /**
   * Send text message
   */
  const handleSendMessage = useCallback(
    async (
      content: string,
      mediaFile?: { uri: string; type: string; name: string },
      mediaType?: MediaType
    ) => {
      let conversationId = conversation?.id;

      // If conversation is missing (initial network error), try to fetch it before sending
      if (!conversationId) {
        const convResult = await dispatch(fetchConversation());
        if (convResult.meta.requestStatus === 'fulfilled' && convResult.payload) {
          conversationId = (convResult.payload as Conversation).id;
        } else {
          Alert.alert(t('chatSendError'), t('chatSendErrorGeneric'));
          return;
        }
      }

      const isOnline = await offlineService.isOnline();

      if (mediaFile && mediaType && mediaType !== 'none') {
        // Send media message
        await dispatch(
          sendMediaMessage({
            conversationId,
            content,
            mediaFile,
            mediaType,
            isOnline,
          })
        ).unwrap();
      } else {
        // Send text message
        await dispatch(
          sendTextMessage({
            conversationId,
            content,
            isOnline,
          })
        ).unwrap();
      }

      await dispatch(loadOfflineQueue());
      await syncOfflineMessagesIfOnline(conversationId);

      // Reload messages to immediately get the system auto-response
      await dispatch(fetchMessages({ conversationId, page: 1 }));

      // Scroll to bottom after sending
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    },
    [dispatch, conversation, t, syncOfflineMessagesIfOnline]
  );

  const formatError = useCallback(
    (error: string | null) => {
      if (!error) {
        return null;
      }
      return t(error, { defaultValue: error });
    },
    [t]
  );

  /**
   * Render message item
   */
  const renderMessage = useCallback(({ item }: { item: Message }) => {
    return (
      <MessageBubble
        message={item}
        onImagePress={(url) => setImagePreviewUrl(url)}
      />
    );
  }, [setImagePreviewUrl]);

  /**
   * Get item key
   */
  const keyExtractor = useCallback((item: Message) => item.id, []);

  /**
   * Render empty state
   */
  const renderEmptyState = () => {
    if (conversationLoading || messagesLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={COLORS.GREEN_PRIMARY} />
          <Text style={styles.emptyText}>{t('loading')}</Text>
        </View>
      );
    }

    if (conversationError || messagesError) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.errorText}>
            {formatError(conversationError || messagesError)}
          </Text>
          <Text style={styles.emptySubtext}>{t('chatErrorRetry')}</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t('chatEmptyState')}</Text>
        <Text style={styles.emptySubtext}>{t('chatEmptyStateDescription')}</Text>
      </View>
    );
  };

  /**
   * Render list header (sync status)
   */
  const renderListHeader = () => {
    if (syncingOffline && offlineQueueCount > 0) {
      return (
        <View style={styles.syncBanner}>
          <ActivityIndicator size="small" color={COLORS.GREEN_PRIMARY} />
          <Text style={styles.syncText}>
            {t('chatSyncingOffline', { count: offlineQueueCount })}
          </Text>
        </View>
      );
    }
    return null;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Messages list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.messagesList}
        ListEmptyComponent={renderEmptyState}
        ListHeaderComponent={renderListHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.GREEN_PRIMARY}
            colors={[COLORS.GREEN_PRIMARY]}
          />
        }
        onContentSizeChange={() => {
          if (messages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: false });
          }
        }}
        onScroll={({ nativeEvent }) => {
          const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
          const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
          setShowScrollToBottom(distanceFromBottom > 160);
        }}
        scrollEventThrottle={200}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
      />

      {/* Message composer */}
      <MessageComposer
        onSendMessage={handleSendMessage}
        disabled={sendingMessage}
        offlinePendingCount={offlineQueueCount}
      />

      {showScrollToBottom && (
        <TouchableOpacity
          onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
          style={styles.scrollToBottomButton}
          accessibilityLabel={t('chatScrollToBottom')}
        >
          <Ionicons name="arrow-down" size={20} color={COLORS.WHITE} />
        </TouchableOpacity>
      )}

      {/* Fullscreen image preview */}
      <Modal
        visible={!!imagePreviewUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setImagePreviewUrl(null)}
      >
        <TouchableOpacity
          style={styles.previewOverlay}
          activeOpacity={1}
          onPress={() => setImagePreviewUrl(null)}
        >
          {imagePreviewUrl && (
            <Image
              source={{ uri: imagePreviewUrl }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.CREAM,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '90%',
    height: '90%',
  },
  messagesList: {
    flexGrow: 1,
    paddingVertical: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.GRAY_DARK,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: COLORS.ERROR,
    textAlign: 'center',
    marginBottom: 8,
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: COLORS.WHITE,
    marginBottom: 8,
  },
  syncText: {
    fontSize: 13,
    color: COLORS.GRAY_DARK,
    fontWeight: '500',
  },
  scrollToBottomButton: {
    position: 'absolute',
    right: 16,
    bottom: 96,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.GREEN_PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 4,
  },
});
