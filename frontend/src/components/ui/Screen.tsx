import React from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';
interface ScreenProps extends ViewProps { scroll?: boolean; scrollProps?: ScrollViewProps; children: React.ReactNode; }
export function Screen({ scroll = false, scrollProps, children, style, ...props }: ScreenProps) { const content = <View {...props} style={[styles.content, style]}>{children}</View>; return <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>{scroll ? <ScrollView contentContainerStyle={styles.scrollContent} {...scrollProps}>{content}</ScrollView> : content}</SafeAreaView>; }
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.surface.page }, content: { flex: 1, padding: spacing[4] }, scrollContent: { flexGrow: 1 } });
