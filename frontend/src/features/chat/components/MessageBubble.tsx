/**
 * MessageBubble Component
 *
 * Displays a single message in chat conversation
 * Different styles for user/admin/system messages
 */

import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Message, MessageSenderType } from '../types/chat';

/**
 * MAVECAM Design System Colors
 */
const COLORS = {
  GREEN_PRIMARY: '#059669',
  WHITE: '#ffffff',
  CREAM: '#f8fafc',
  GRAY_LIGHT: '#64748b',
  GRAY_DARK: '#1e293b',
  BORDER_GRAY: '#e2e8f0',
};

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
        return COLORS.WHITE;
      case 'admin':
      case 'system':
        return COLORS.GRAY_DARK;
    }
  };

  /**
   * Get sender label for admin/system messages
   */
  const getSenderLabel = (senderType: MessageSenderType) => {
    switch (senderType) {
      case 'admin':
        return t('chatAdminLabel');
      case 'system':
        return t('chatAdminLabel');
      default:
        return null;
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
          <Ionicons name="play-circle-outline" size={48} color={COLORS.WHITE} />
          <Text style={styles.videoLabel}>{t('chatVideoMessage')}</Text>
        </View>
      );
    }

    return null;
  };

  const senderLabel = getSenderLabel(message.sender_type);
  const textColor = getTextColor(message.sender_type);
  const timestampColor = message.sender_type === 'user' ? COLORS.WHITE : COLORS.GRAY_LIGHT;

  return (
    <View
      style={[
        styles.container,
        message.sender_type === 'user' ? styles.containerUser : styles.containerOther,
      ]}
    >
      {/* Sender label (admin/system) */}
      {senderLabel && (
        <Text style={styles.senderLabel}>{senderLabel}</Text>
      )}

      {/* Message bubble */}
      <View style={[styles.bubble, getBubbleStyle(message.sender_type)]}>
        {/* Media attachment */}
        {renderMedia()}

        {/* Text content */}
        <Text style={[styles.messageText, { color: textColor }]}>
          {message.content}
        </Text>

        {/* Timestamp + status */}
        <View style={styles.footer}>
          <Text style={[styles.timestamp, { color: timestampColor }]}>
            {formatTimestamp(message.created_at)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    marginHorizontal: 12,
  },
  containerUser: {
    alignItems: 'flex-end',
  },
  containerOther: {
    alignItems: 'flex-start',
  },
  senderLabel: {
    fontSize: 11,
    color: COLORS.GRAY_LIGHT,
    marginBottom: 4,
    marginHorizontal: 8,
    fontWeight: '600',
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  bubbleUser: {
    backgroundColor: COLORS.GREEN_PRIMARY,
    borderBottomRightRadius: 4,
  },
  bubbleAdmin: {
    backgroundColor: COLORS.WHITE,
    borderWidth: 1,
    borderColor: COLORS.BORDER_GRAY,
    borderBottomLeftRadius: 4,
  },
  bubbleSystem: {
    backgroundColor: COLORS.WHITE,
    borderWidth: 1,
    borderColor: COLORS.BORDER_GRAY,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  timestamp: {
    fontSize: 11,
    color: COLORS.GRAY_LIGHT,
  },
  statusIcon: {
    marginLeft: 2,
  },
  mediaImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginBottom: 8,
  },
  videoPlaceholder: {
    width: 200,
    height: 150,
    borderRadius: 12,
    backgroundColor: COLORS.GRAY_DARK,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  videoLabel: {
    color: COLORS.WHITE,
    fontSize: 13,
    marginTop: 8,
    fontWeight: '600',
  },
});
