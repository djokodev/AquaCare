/**
 * MessageBubble Component
 *
 * Displays a single message in chat conversation
 * Different styles for user/admin/system messages
 */

import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Message, MessageSenderType } from '../types/chat';
import { AppText } from '@/components/ui';
import { colors, radii, shadows, spacing, typography } from '@/theme';

interface MessageBubbleProps {
  message: Message;
  onImagePress?: (imageUrl: string) => void;
}

export function MessageBubble({ message, onImagePress }: MessageBubbleProps) {
  const { t, i18n } = useTranslation();

  /**
   * Get bubble style based on sender type
   */
  const getBubbleStyle = (senderType: MessageSenderType) => {
    switch (senderType) {
      case 'user':
        return styles.bubbleUser;
      case 'admin':
        return styles.bubbleAdmin;
      case 'system':
        return styles.bubbleSystem;
    }
  };

  /**
   * Get text color based on sender type
   */
  const getTextColor = (senderType: MessageSenderType) => {
    switch (senderType) {
      case 'user':
        return colors.text.inverse;
      case 'admin':
      case 'system':
        return colors.text.primary;
    }
  };

  /**
   * Format message timestamp
   */
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';

    // Today: just time
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    // This week: day + time
    const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff < 7) {
      const weekdayShort = date.toLocaleDateString(locale, { weekday: 'short' });
      const time = date.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${weekdayShort} ${time}`;
    }

    // Older: date + time
    const dateShort = date.toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
    });
    const time = date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${dateShort} ${time}`;
  };

  /**
   * Render media attachment (image or video)
   */
  const renderMedia = () => {
    if (message.media_type === 'none' || !message.media_url) {
      return null;
    }

    if (message.media_type === 'image') {
      return (
        <TouchableOpacity
          onPress={() => onImagePress && onImagePress(message.media_url!)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('chatOpenImage')}
          accessibilityHint={t('chatOpenImageHint')}
          hitSlop={spacing[2]}
        >
          <Image
            source={{ uri: message.media_url }}
            style={styles.mediaImage}
            resizeMode="cover"
          />
        </TouchableOpacity>
      );
    }

    if (message.media_type === 'video') {
      return (
        <View style={styles.videoPlaceholder}>
          <Ionicons name="play-circle-outline" size={48} color={colors.text.inverse} />
          <AppText variant="caption" color="inverse" style={styles.videoLabel}>{t('chatVideoMessage')}</AppText>
        </View>
      );
    }

    return null;
  };

  const textColor = getTextColor(message.sender_type);
  const timestampColor = message.sender_type === 'user'
    ? colors.text.inverse
    : colors.text.muted;

  return (
    <View
      style={[
        styles.container,
        message.sender_type === 'user' ? styles.containerUser : styles.containerOther,
      ]}
    >
      {/* Message bubble */}
      <View style={[styles.bubble, getBubbleStyle(message.sender_type)]}>
        {/* Media attachment */}
        {renderMedia()}

        {/* Text content */}
        <AppText style={[styles.messageText, { color: textColor }]}>
          {message.content}
        </AppText>

        {/* Timestamp + status */}
        <View style={styles.footer}>
          <AppText variant="caption" style={[styles.timestamp, { color: timestampColor }]}>
            {formatTimestamp(message.created_at)}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing[1],
    marginHorizontal: spacing[3],
  },
  containerUser: {
    alignItems: 'flex-end',
  },
  containerOther: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: radii.xl,
    padding: spacing[3],
    ...shadows.small,
  },
  bubbleUser: {
    backgroundColor: colors.brand.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAdmin: {
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderBottomLeftRadius: 4,
  },
  bubbleSystem: {
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    ...typography.body,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[1],
    gap: 4,
  },
  timestamp: {
    color: colors.text.muted,
  },
  statusIcon: {
    marginLeft: 2,
  },
  mediaImage: {
    width: 200,
    height: 150,
    borderRadius: radii.lg,
    marginBottom: spacing[2],
  },
  videoPlaceholder: {
    width: 200,
    height: 150,
    borderRadius: radii.lg,
    backgroundColor: colors.text.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  videoLabel: {
    marginTop: spacing[2],
    fontWeight: '600',
  },
});
