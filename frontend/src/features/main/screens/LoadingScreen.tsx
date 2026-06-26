import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { AQUACARE_COLORS } from '@/constants/colors';
import { AQUACARE_TYPOGRAPHY } from '@/constants/typography';

export default function LoadingScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Logo placeholder */}
        <View style={styles.logo}>
          <Text style={styles.logoText}>AquaCare</Text>
          <Text style={styles.logoSubText}>AquaCare</Text>
        </View>
        
        <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} style={styles.spinner} />
        <Text style={styles.loadingText}>{t('loading')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AQUACARE_COLORS.WHITE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    ...AQUACARE_TYPOGRAPHY.h1,
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    letterSpacing: 1,
  },
  logoSubText: {
    ...AQUACARE_TYPOGRAPHY.h4,
    fontWeight: '500',
    color: AQUACARE_COLORS.GRAY_LIGHT,
    marginTop: 4,
  },
  spinner: {
    marginBottom: 20,
  },
  loadingText: {
    ...AQUACARE_TYPOGRAPHY.body,
    color: AQUACARE_COLORS.GRAY_LIGHT,
  },
});


