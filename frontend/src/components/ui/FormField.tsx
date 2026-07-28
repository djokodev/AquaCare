import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { spacing } from '@/theme';
interface FormFieldProps { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode; }
export function FormField({ label, required = false, hint, error, children }: FormFieldProps) { return <View style={styles.container}><AppText variant="label">{label}{required ? <AppText variant="label" color="error"> *</AppText> : null}</AppText>{children}{error ? <AppText variant="helper" color="error" accessibilityLiveRegion="polite">{error}</AppText> : hint ? <AppText variant="caption" color="muted">{hint}</AppText> : null}</View>; }
const styles = StyleSheet.create({ container: { gap: spacing[2], marginBottom: spacing[4] } });
