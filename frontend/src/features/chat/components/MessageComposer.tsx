/**
 * MessageComposer Component
 *
 * Input component for sending messages
 * Supports text + media (image/video) with validation
 */

import React, { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import {
  validateMessageContent,
  validateImageFile,
  validateVideoFile,
  bytesToMB,
} from '../domain/estimators';
import {
  MAX_MESSAGE_LENGTH,
} from '../domain/constants';
import type { MediaType } from '../types/chat';
import { AppText, IconButton, MultilineTextField } from '@/components/ui';
import { colors, radii, sizing, spacing } from '@/theme';

interface MediaFile {
  uri: string;
  type: string;
  name: string;
  size?: number;
}

interface MessageComposerProps {
  onSendMessage: (content: string, mediaFile?: MediaFile, mediaType?: MediaType) => void;
  disabled?: boolean;
  offlinePendingCount?: number;
}

export function MessageComposer({
  onSendMessage,
  disabled = false,
  offlinePendingCount = 0,
}: MessageComposerProps) {
  const { t } = useTranslation();

  const [content, setContent] = useState('');
  const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>('none');
  const [sending, setSending] = useState(false);

  /**
   * Request media library permissions
   */
  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('chatPermissionDenied'),
        t('chatPermissionMediaLibrary')
      );
      return false;
    }
    return true;
  };

  /**
   * Pick image from media library
   */
  const pickImage = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8, // Compression for Cameroon rural networks
      base64: false,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const fileSizeMB = asset.fileSize ? bytesToMB(asset.fileSize) : 0;

      // Validate image
      const validation = validateImageFile(fileSizeMB, asset.mimeType || 'image/jpeg');
      if (!validation.isValid) {
        const message = validation.errorKey
          ? t(validation.errorKey, validation.errorParams)
          : t('chatMediaInvalidFile');
        Alert.alert(t('chatMediaError'), message);
        return;
      }

      setMediaFile({
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: `image_${Date.now()}.jpg`,
        size: asset.fileSize,
      });
      setMediaType('image');
    }
  };

  /**
   * Pick video from media library
   */
  const pickVideo = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const fileSizeMB = asset.fileSize ? bytesToMB(asset.fileSize) : 0;

      // Validate video
      const validation = validateVideoFile(fileSizeMB, asset.mimeType || 'video/mp4');
      if (!validation.isValid) {
        const message = validation.errorKey
          ? t(validation.errorKey, validation.errorParams)
          : t('chatMediaInvalidFile');
        Alert.alert(t('chatMediaError'), message);
        return;
      }

      setMediaFile({
        uri: asset.uri,
        type: asset.mimeType || 'video/mp4',
        name: `video_${Date.now()}.mp4`,
        size: asset.fileSize,
      });
      setMediaType('video');
    }
  };

  /**
   * Show media picker options
   */
  const showMediaPicker = () => {
    Alert.alert(
      t('chatSelectMedia'),
      t('chatSelectMediaDescription'),
      [
        {
          text: t('chatImage'),
          onPress: pickImage,
        },
        {
          text: t('chatVideo'),
          onPress: pickVideo,
        },
        {
          text: t('cancel'),
          style: 'cancel',
        },
      ]
    );
  };

  /**
   * Remove selected media
   */
  const removeMedia = () => {
    setMediaFile(null);
    setMediaType('none');
  };

  /**
   * Send message
   */
  const handleSend = async () => {
    // Validate content
    const validation = validateMessageContent(content);
    if (!validation.isValid) {
      const message = validation.errorKey
        ? t(validation.errorKey, validation.errorParams)
        : t('chatMessageInvalid');
      Alert.alert(t('chatMessageError'), message);
      return;
    }

    setSending(true);

    try {
      await onSendMessage(content, mediaFile || undefined, mediaType);

      // Reset form
      setContent('');
      setMediaFile(null);
      setMediaType('none');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('chatSendErrorGeneric');
      Alert.alert(t('chatSendError'), message);
    } finally {
      setSending(false);
    }
  };

  const canSend = content.trim().length > 0 && !disabled && !sending;
  const characterCount = content.length;
  const isNearLimit = characterCount > MAX_MESSAGE_LENGTH * 0.8;

  return (
    <View style={styles.container}>
      {/* Offline indicator */}
      {offlinePendingCount > 0 && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.text.muted} />
          <AppText variant="caption" color="muted">
            {t('chatOfflinePending', { count: offlinePendingCount })}
          </AppText>
        </View>
      )}

      {/* Media preview */}
      {mediaFile && (
        <View style={styles.mediaPreview}>
          {mediaType === 'image' && (
            <Image source={{ uri: mediaFile.uri }} style={styles.previewImage} />
          )}
          {mediaType === 'video' && (
            <View style={styles.previewVideo}>
              <Ionicons name="play-circle-outline" size={48} color={colors.text.inverse} />
              <AppText variant="caption" color="inverse">{t('chatVideoSelected')}</AppText>
            </View>
          )}
          <IconButton
            onPress={removeMedia}
            icon="close-circle"
            variant="danger"
            accessibilityLabel={t('close')}
            style={styles.removeMediaButton}
          />
        </View>
      )}

      {/* Input area */}
      <View style={styles.inputContainer}>
        {/* Media button */}
        <IconButton
          onPress={showMediaPicker}
          icon="image-outline"
          accessibilityLabel={t('chatSelectMedia')}
          variant="ghost"
          disabled={disabled || sending}
        />

        {/* Text input */}
        <MultilineTextField
          value={content}
          onChangeText={setContent}
          placeholder={t('chatPlaceholder')}
          maxLength={MAX_MESSAGE_LENGTH}
          editable={!disabled && !sending}
          returnKeyType="default"
        />

        {/* Send button */}
        <IconButton
          onPress={handleSend}
          icon="send"
          accessibilityLabel={t('chatSendMessage')}
          tone="inverse"
          style={[styles.sendButton, canSend ? styles.sendButtonActive : styles.sendButtonDisabled]}
          disabled={!canSend}
        />
      </View>

      {/* Character count */}
      {isNearLimit && (
        <View style={styles.characterCountContainer}>
          <AppText variant="caption" style={characterCount >= MAX_MESSAGE_LENGTH ? styles.characterCountError : styles.characterCount}>
            {characterCount}/{MAX_MESSAGE_LENGTH}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface.card,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingBottom: spacing[2],
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: colors.surface.page,
  },
  mediaPreview: {
    marginHorizontal: spacing[3],
    marginTop: spacing[3],
    position: 'relative',
  },
  previewImage: {
    width: sizing.avatarLarge * 2,
    height: sizing.inputHeight * 2,
    borderRadius: radii.md,
  },
  previewVideo: {
    width: sizing.avatarLarge * 2,
    height: sizing.inputHeight * 2,
    borderRadius: radii.md,
    backgroundColor: colors.text.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeMediaButton: {
    position: 'absolute',
    top: -spacing[2],
    right: -spacing[2],
    backgroundColor: colors.surface.card,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
    gap: spacing[2],
  },
  sendButton: {
    width: sizing.touchTargetMinimum,
    height: sizing.touchTargetMinimum,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonActive: {
    backgroundColor: colors.brand.primary,
  },
  sendButtonDisabled: {
    backgroundColor: colors.surface.disabled,
  },
  characterCountContainer: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[1],
  },
  characterCount: {
    color: colors.text.muted,
  },
  characterCountError: {
    color: colors.status.error,
  },
});
