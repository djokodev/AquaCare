import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';

export default function LoadingScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Logo placeholder */}
        <View style={styles.logo}>
          <Text style={styles.logoText}>MAVECAM</Text>
          <Text style={styles.logoSubText}>AquaCare</Text>
        </View>
        
        <ActivityIndicator size="large" color="#2563eb" style={styles.spinner} />
        <Text style={styles.loadingText}>{t('loading')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2563eb',
    letterSpacing: 2,
  },
  logoSubText: {
    fontSize: 18,
    fontWeight: '300',
    color: '#64748b',
    marginTop: 4,
  },
  spinner: {
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#64748b',
  },
});