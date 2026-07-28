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
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Image,
  Platform,
  AppState,
} from 'react-native';
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
import { AppText, EmptyState, ErrorState, IconButton, InlineAlert, LoadingState } from '@/components/ui';
import { colors, shadows, spacing } from '@/theme';

/**
 * AquaCare Design System Colors
 */
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
  const autoScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }
      autoScrollTimeoutRef.current = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 300);
    }

    return () => {
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
        autoScrollTimeoutRef.current = null;
      }
    };
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
      if (sendScrollTimeoutRef.current) {
        clearTimeout(sendScrollTimeoutRef.current);
      }
      sendScrollTimeoutRef.current = setTimeout(() => {
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

  const handleRetryInitialLoad = useCallback(async () => {
    const conversationResult = await dispatch(fetchConversation());
    if (conversationResult.meta.requestStatus === 'fulfilled' && conversationResult.payload) {
      const conversationId = (conversationResult.payload as Conversation).id;
      await dispatch(fetchMessages({ conversationId, page: 1 }));
      await syncOfflineMessagesIfOnline(conversationId);
    }
  }, [dispatch, syncOfflineMessagesIfOnline]);

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
  const renderEmptyState = useCallback(() => {
    if (conversationLoading || messagesLoading) {
      return (
        <LoadingState message={t('loading')} />
      );
    }

    if (conversationError || messagesError) {
      return (
        <ErrorState title={formatError(conversationError || messagesError) ?? t('error')} message={t('chatErrorRetry')} actionLabel={t('retry')} onAction={() => void handleRetryInitialLoad()} />
      );
    }

    return (
      <EmptyState title={t('chatEmptyState')} message={t('chatEmptyStateDescription')} />
    );
  }, [
    conversationError,
    conversationLoading,
    formatError,
    handleRetryInitialLoad,
    messagesError,
    messagesLoading,
    t,
  ]);

  /**
   * Render list header (sync status)
   */
  const renderListHeader = useCallback(() => {
    const visibleError = messages.length > 0 ? formatError(messagesError || conversationError) : null;
    return (
      <View style={styles.listHeader}>
        {visibleError ? <InlineAlert tone="error" message={visibleError} /> : null}
        {syncingOffline && offlineQueueCount > 0 ? (
        <View style={styles.syncBanner}>
          <ActivityIndicator size="small" color={colors.brand.primary} />
          <AppText variant="caption">
            {t('chatSyncingOffline', { count: offlineQueueCount })}
          </AppText>
        </View>
        ) : null}
      </View>
    );
  }, [conversationError, formatError, messages.length, messagesError, offlineQueueCount, syncingOffline, t]);

  const handleScroll = useCallback(({ nativeEvent }: { nativeEvent: any }) => {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const shouldShowButton = distanceFromBottom > 160;
    setShowScrollToBottom((currentValue) =>
      currentValue === shouldShowButton ? currentValue : shouldShowButton
    );
  }, []);

  useEffect(() => {
    return () => {
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }
      if (sendScrollTimeoutRef.current) {
        clearTimeout(sendScrollTimeoutRef.current);
      }
    };
  }, []);

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
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand.primary}
            colors={[colors.brand.primary]}
          />
        }
        onContentSizeChange={() => {
          if (messages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: false });
          }
        }}
        onScroll={handleScroll}
        scrollEventThrottle={200}
        keyboardShouldPersistTaps="handled"
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
        <IconButton
          onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
          icon="arrow-down"
          variant="surface"
          tone="inverse"
          accessibilityLabel={t('chatScrollToBottom')}
          style={styles.scrollToBottomButton}
        />
      )}

      {/* Fullscreen image preview */}
      <Modal
        visible={!!imagePreviewUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setImagePreviewUrl(null)}
      >
        <View
          style={styles.previewOverlay}
        >
          {imagePreviewUrl && (
            <Image
              source={{ uri: imagePreviewUrl }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
          <IconButton icon="close" tone="inverse" variant="ghost" accessibilityLabel={t('close')} onPress={() => setImagePreviewUrl(null)} style={styles.previewClose} />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.page,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: colors.overlay.strong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '90%',
    height: '90%',
  },
  messagesList: {
    flexGrow: 1,
    paddingVertical: spacing[3],
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.surface.card,
    marginBottom: spacing[2],
  },
  listHeader: { gap: spacing[2] },
  scrollToBottomButton: {
    position: 'absolute',
    right: spacing[4],
    bottom: 96,
    backgroundColor: colors.brand.primary,
    ...shadows.medium,
  },
  previewClose: { position: 'absolute', top: spacing[6], right: spacing[4] },
});
