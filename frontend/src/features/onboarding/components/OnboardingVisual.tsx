/**
 * Aperçus d'écrans AquaCare pour l'introduction (valeurs d'exemple).
 * Cartes blanches posées sur le fond vert, comme dans l'app réelle.
 * @module features/onboarding/components
 */

import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { OnboardingVisualType } from '../types/onboarding';
import { AppText } from '@/components/ui';
import { colors, radii, shadows, spacing, typography } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function Metric({ icon, label, value, tone = 'brand' }: { icon: IconName; label: string; value: string; tone?: 'brand' | 'warning' }) {
  const color = tone === 'warning' ? colors.status.warning : colors.brand.primary;
  return (
    <View style={styles.metricRow}>
      <View style={[styles.metricIcon, tone === 'warning' && styles.metricIconWarning]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <AppText style={styles.metricLabel}>{label}</AppText>
      <AppText style={styles.metricValue}>{value}</AppText>
    </View>
  );
}

function WelcomeVisual() {
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <AppText style={styles.tagline}>{t('onboardingWelcomeTagline')}</AppText>
    </View>
  );
}

function TrackVisual() {
  const { t } = useTranslation();
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <AppText style={styles.cardTitle}>{t('onboardingTrackMockTitle')}</AppText>
        <View style={styles.liveDot} />
      </View>
      <Metric icon="water-outline" label={t('onboardingTrackMockAlive')} value="1 180" />
      <Metric icon="trending-down-outline" label={t('onboardingTrackMockDeaths')} value="3" tone="warning" />
      <Metric icon="nutrition-outline" label={t('onboardingTrackMockFeed')} value="4,2 kg" />
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: '38%' }]} />
      </View>
    </View>
  );
}

function FeedVisual() {
  const { t } = useTranslation();
  return (
    <View style={styles.stack}>
      <View style={styles.alarmBanner}>
        <View style={styles.alarmIcon}>
          <Ionicons name="alarm" size={18} color={colors.text.inverse} />
        </View>
        <View style={styles.flex}>
          <AppText style={styles.alarmApp}>AquaCare · 08:30</AppText>
          <AppText style={styles.alarmText} numberOfLines={2}>{t('onboardingFeedMockAlarm')}</AppText>
        </View>
      </View>
      <View style={styles.card}>
        <AppText style={styles.cardTitle}>{t('onboardingFeedMockTitle')}</AppText>
        {[
          { time: '08:30', qty: '2,1 kg', done: true },
          { time: '16:30', qty: '2,1 kg', done: false },
        ].map((meal) => (
          <View key={meal.time} style={styles.mealRow}>
            <Ionicons
              name={meal.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={meal.done ? colors.brand.primary : colors.text.disabled}
            />
            <AppText style={styles.mealTime}>{meal.time}</AppText>
            <AppText style={styles.metricValue}>{meal.qty}</AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

function ShopVisual() {
  const { t } = useTranslation();
  return (
    <View style={styles.stack}>
      <View style={styles.card}>
        <View style={styles.orderRow}>
          <View style={styles.bagIcon}>
            <Image
              source={require('../../../../assets/products/DIBAQ.png')}
              style={styles.bagImage}
              accessibilityIgnoresInvertColors
            />
          </View>
          <View style={styles.flex}>
            <AppText style={styles.cardTitle}>{t('onboardingShopMockProduct')}</AppText>
            <View style={styles.statusBadge}>
              <AppText style={styles.statusText}>{t('onboardingShopMockStatus')}</AppText>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.chatBubble}>
        <AppText style={styles.chatAuthor}>{t('onboardingShopMockSupport')}</AppText>
        <AppText style={styles.chatText}>{t('onboardingShopMockChat')}</AppText>
      </View>
    </View>
  );
}

export default function OnboardingVisual({ type }: { type: OnboardingVisualType }) {
  switch (type) {
    case 'welcome':
      return <WelcomeVisual />;
    case 'track':
      return <TrackVisual />;
    case 'feed':
      return <FeedVisual />;
    case 'shop':
      return <ShopVisual />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center' },
  stack: { width: '100%', maxWidth: 320, gap: spacing[3] },
  tagline: { ...typography.display, color: colors.text.inverse, textAlign: 'center' },
  card: {
    width: '100%',
    maxWidth: 320,
    padding: spacing[4],
    borderRadius: radii.xxl,
    backgroundColor: colors.surface.card,
    ...shadows.large,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[2] },
  cardTitle: { ...typography.bodyStrong, color: colors.text.primary },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand.light },
  metricRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing[3] },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: radii.full,
    backgroundColor: colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  metricIconWarning: { backgroundColor: colors.surface.metricAttention },
  metricLabel: { ...typography.helper, flex: 1, color: colors.text.secondary },
  metricValue: { ...typography.bodyStrong, color: colors.text.primary },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surface.disabled, marginTop: spacing[4], overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.brand.primary },
  alarmBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: radii.xl,
    backgroundColor: 'rgba(255,255,255,0.95)',
    ...shadows.medium,
  },
  alarmIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  alarmApp: { ...typography.caption, color: colors.text.muted },
  alarmText: { ...typography.label, color: colors.text.primary },
  mealRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing[3], gap: spacing[3] },
  mealTime: { ...typography.body, flex: 1, color: colors.text.primary },
  orderRow: { flexDirection: 'row', alignItems: 'center' },
  bagIcon: {
    width: 52,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.page,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  bagImage: { width: 36, height: 44, resizeMode: 'contain' },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radii.full,
    backgroundColor: colors.brand.subtle,
  },
  statusText: { ...typography.caption, color: colors.brand.dark },
  chatBubble: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    padding: spacing[3],
    borderRadius: radii.xl,
    borderBottomLeftRadius: radii.sm,
    backgroundColor: colors.surface.card,
    ...shadows.medium,
  },
  chatAuthor: { ...typography.caption, color: colors.brand.primary, marginBottom: 2 },
  chatText: { ...typography.helper, color: colors.text.primary },
});
