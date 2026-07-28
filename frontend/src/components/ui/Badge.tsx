import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, radii, spacing } from '@/theme';

interface BadgeProps { label: string; tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'error' | 'info'; }
const tones = { neutral: [colors.surface.disabled, 'secondary'], brand: [colors.brand.subtle, 'link'], success: [colors.status.successSurface, 'success'], warning: [colors.status.warningSurface, 'warning'], error: [colors.status.errorSurface, 'error'], info: [colors.status.infoSurface, 'info'] } as const;
export function Badge({ label, tone = 'neutral' }: BadgeProps) { const [backgroundColor, color] = tones[tone]; return <View style={[styles.badge, { backgroundColor }]}><AppText variant="caption" color={color}>{label}</AppText></View>; }
const styles = StyleSheet.create({ badge: { alignSelf: 'flex-start', borderRadius: radii.full, paddingHorizontal: spacing[2], paddingVertical: spacing[1] } });
