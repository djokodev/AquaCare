import React from 'react';
import {
  View,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/ui';
import { colors, sizing, spacing } from '@/theme';

export default function LoadingScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image source={require('../../../../assets/icon.png')} style={styles.logo} accessibilityLabel={t('appName')} />
        
        <ActivityIndicator size="large" color={colors.brand.primary} style={styles.spinner} />
        <AppText color="muted">{t('loading')}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: sizing.avatarLarge * 2, height: sizing.avatarLarge * 2, borderRadius: sizing.avatarLarge / 2, marginBottom: spacing[10] },
  spinner: {
    marginBottom: spacing[5],
  },
});

