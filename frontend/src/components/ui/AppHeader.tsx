import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './IconButton';
import { AppText } from './AppText';
import { colors, sizing, spacing } from '@/theme';

interface AppHeaderProps { title: string; subtitle?: string; variant?: 'brand' | 'surface'; onBack?: () => void; backLabel?: string; rightAction?: React.ReactNode; }
export function AppHeader({ title, subtitle, variant = 'brand', onBack, backLabel, rightAction }: AppHeaderProps) {
  const insets = useSafeAreaInsets(); const brand = variant === 'brand'; const textColor = brand ? 'inverse' : 'primary';
  return <View style={[styles.header, { paddingTop: insets.top + spacing[2] }, brand ? styles.brand : styles.surface]}><View style={styles.row}>{onBack ? <IconButton icon="arrow-back" accessibilityLabel={backLabel ?? title} onPress={onBack} variant={brand ? 'ghost' : 'surface'} /> : <View style={styles.placeholder} />}<View style={styles.titleContainer}><AppText variant="cardTitle" color={textColor} numberOfLines={2} accessibilityRole="header">{title}</AppText>{subtitle ? <AppText variant="caption" color={brand ? 'inverse' : 'muted'} numberOfLines={1}>{subtitle}</AppText> : null}</View>{rightAction ?? <View style={styles.placeholder} />}</View></View>;
}
const styles = StyleSheet.create({ header: { paddingHorizontal: spacing[4], paddingBottom: spacing[3] }, brand: { backgroundColor: colors.brand.primary }, surface: { backgroundColor: colors.surface.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle }, row: { minHeight: sizing.controlMedium, flexDirection: 'row', alignItems: 'center' }, placeholder: { width: sizing.touchTargetMinimum }, titleContainer: { flex: 1, marginHorizontal: spacing[2] } });
