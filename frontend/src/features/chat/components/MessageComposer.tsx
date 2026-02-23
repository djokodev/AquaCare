/**
 * MessageComposer Component
 *
 * Input component for sending messages
 * Supports text + media (image/video) with validation
 */

import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Image,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
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
  ERROR: '#dc2626',
};

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
          <Ionicons name="cloud-offline-outline" size={16} color={COLORS.GRAY_LIGHT} />
          <Text style={styles.offlineText}>
            {t('chatOfflinePending', { count: offlinePendingCount })}
          </Text>
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
              <Ionicons name="play-circle-outline" size={48} color={COLORS.WHITE} />
              <Text style={styles.videoText}>{t('chatVideoSelected')}</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={removeMedia}
            style={styles.removeMediaButton}
            activeOpacity={0.7}
          >
            <Ionicons name="close-circle" size={24} color={COLORS.ERROR} />
          </TouchableOpacity>
        </View>
      )}

      {/* Input area */}
      <View style={styles.inputContainer}>
        {/* Media button */}
        <TouchableOpacity
          onPress={showMediaPicker}
          style={styles.mediaButton}
          disabled={disabled || sending}
          activeOpacity={0.7}
        >
          <Ionicons
            name="image-outline"
            size={24}
            color={disabled ? COLORS.GRAY_LIGHT : COLORS.GREEN_PRIMARY}
          />
        </TouchableOpacity>

        {/* Text input */}
        <TextInput
          style={styles.textInput}
          value={content}
          onChangeText={setContent}
          placeholder={t('chatPlaceholder')}
          placeholderTextColor={COLORS.GRAY_LIGHT}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          editable={!disabled && !sending}
          returnKeyType="default"
        />

        {/* Send button */}
        <TouchableOpacity
          onPress={handleSend}
          style={[
            styles.sendButton,
            canSend ? styles.sendButtonActive : styles.sendButtonDisabled,
          ]}
          disabled={!canSend}
          activeOpacity={0.7}
        >
          {sending ? (
            <ActivityIndicator size="small" color={COLORS.WHITE} />
          ) : (
            <Ionicons name="send" size={20} color={COLORS.WHITE} />
          )}
        </TouchableOpacity>
      </View>

      {/* Character count */}
      {isNearLimit && (
        <View style={styles.characterCountContainer}>
          <Text
            style={[
              styles.characterCount,
              characterCount >= MAX_MESSAGE_LENGTH && styles.characterCountError,
            ]}
          >
            {characterCount}/{MAX_MESSAGE_LENGTH}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.WHITE,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER_GRAY,
    paddingBottom: 8,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.CREAM,
  },
  offlineText: {
    fontSize: 12,
    color: COLORS.GRAY_LIGHT,
  },
  mediaPreview: {
    marginHorizontal: 12,
    marginTop: 12,
    position: 'relative',
  },
  previewImage: {
    width: 120,
    height: 90,
    borderRadius: 8,
  },
  previewVideo: {
    width: 120,
    height: 90,
    borderRadius: 8,
    backgroundColor: COLORS.GRAY_DARK,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoText: {
    color: COLORS.WHITE,
    fontSize: 11,
    marginTop: 4,
  },
  removeMediaButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
  },
  mediaButton: {
    padding: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: COLORS.CREAM,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.GRAY_DARK,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonActive: {
    backgroundColor: COLORS.GREEN_PRIMARY,
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.GRAY_LIGHT,
  },
  characterCountContainer: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  characterCount: {
    fontSize: 11,
    color: COLORS.GRAY_LIGHT,
  },
  characterCountError: {
    color: COLORS.ERROR,
  },
});
