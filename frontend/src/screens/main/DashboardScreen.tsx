import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

// Couleurs MAVECAM selon spécifications
const MAVECAM_COLORS = {
  GREEN_PRIMARY: '#059669',
  GREEN_LIGHT: '#10b981',
  GREEN_DARK: '#047857',
  WHITE: '#ffffff',
  CREAM: '#f8fafc',
  BLUE: '#2563eb',
  SUCCESS: '#059669',
  WARNING: '#f59e0b',
  ERROR: '#dc2626',
  INFO: '#0ea5e9',
  GRAY_LIGHT: '#64748b',
  GRAY_DARK: '#1e293b',
};

import { useAuth } from '@/hooks/useAuth';

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { user, displayName } = useAuth();


  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>
          {t('hello')}, {displayName}! 👋
        </Text>
        <Text style={styles.subtitle}>
          {t('welcomeBoard')}
        </Text>
      </View>

      <View style={styles.quickStatsContainer}>
        <Text style={styles.sectionTitle}>{t('quickOverview')}</Text>
        
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="fish" size={32} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>{t('activeCycles')}</Text>
          </View>
          
          <View style={styles.statCard}>
            <Ionicons name="water" size={32} color={MAVECAM_COLORS.GREEN_LIGHT} />
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>{t('ponds')}</Text>
          </View>
          
          <View style={styles.statCard}>
            <Ionicons name="scale" size={32} color={MAVECAM_COLORS.GREEN_DARK} />
            <Text style={styles.statNumber}>0 kg</Text>
            <Text style={styles.statLabel}>Biomasse</Text>
          </View>
          
          <View style={styles.statCard}>
            <Ionicons name="trending-up" size={32} color={MAVECAM_COLORS.SUCCESS} />
            <Text style={styles.statNumber}>0%</Text>
            <Text style={styles.statLabel}>Survie</Text>
          </View>
        </View>
      </View>

      <View style={styles.actionContainer}>
        <Text style={styles.sectionTitle}>{t('quickActions')}</Text>
        
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="add-circle" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text style={styles.actionText}>{t('newCycle')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="create" size={24} color={MAVECAM_COLORS.GREEN_LIGHT} />
          <Text style={styles.actionText}>{t('dailyLog')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="medical" size={24} color={MAVECAM_COLORS.GREEN_DARK} />
          <Text style={styles.actionText}>{t('sanitaryLog')}</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  header: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    padding: 20,
    paddingTop: 60,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.WHITE,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  quickStatsContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    width: '48%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 4,
    textAlign: 'center',
  },
  actionContainer: {
    padding: 20,
  },
  actionButton: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '500',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginLeft: 12,
  },
});