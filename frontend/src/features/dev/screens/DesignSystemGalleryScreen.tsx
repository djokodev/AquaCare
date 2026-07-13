import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';
import { AppHeader, AppText, Badge, Button, Card, Divider, EmptyState, ErrorState, IconButton, InlineAlert, LoadingState, SelectableCard, SelectionModal, TextField } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import type { ProfileStackParamList } from '@/navigation/MainNavigator';

type Props = StackScreenProps<ProfileStackParamList, 'DesignSystemGallery'>;

export default function DesignSystemGalleryScreen({ navigation }: Props) {
  const { t } = useTranslation(); const [modalVisible, setModalVisible] = useState(false); const [selected, setSelected] = useState(false);
  return <View style={styles.page}><AppHeader title={t('designSystemGallery')} variant="brand" onBack={() => navigation.goBack()} backLabel={t('back')} /><ScrollView contentContainerStyle={styles.content}>
    <AppText variant="sectionTitle">{t('designSystemColors')}</AppText><View style={styles.swatches}>{Object.entries({ brand: colors.brand.primary, page: colors.surface.page, success: colors.status.success, warning: colors.status.warning, error: colors.status.error, info: colors.status.info }).map(([name, color]) => <View key={name} style={[styles.swatch, { backgroundColor: color }]} accessibilityLabel={name} />)}</View>
    <AppText variant="sectionTitle">{t('designSystemButtons')}</AppText><Button label={t('save')} onPress={() => undefined} /><Button label={t('cancel')} onPress={() => undefined} variant="outline" /><Button label={t('deleteAccount')} onPress={() => undefined} variant="danger" /><View style={styles.row}><IconButton icon="notifications-outline" accessibilityLabel={t('notificationsBell')} onPress={() => undefined} badge={3} /><IconButton icon="settings-outline" accessibilityLabel={t('settingsButton')} onPress={() => undefined} variant="ghost" /></View>
    <AppText variant="sectionTitle">{t('designSystemFields')}</AppText><TextField label={t('farmName')} placeholder={t('farmName')} /><TextField label={t('phoneNumber')} error={t('validationRequiredMessage')} />
    <AppText variant="sectionTitle">{t('designSystemCards')}</AppText><Card><AppText variant="cardTitle">{t('quickOverview')}</AppText><AppText color="muted">{t('designSystemCardDescription')}</AppText></Card><SelectableCard onPress={() => setSelected(!selected)} selected={selected} accessibilityLabel={t('designSystemSelectableCard')}><AppText variant="cardTitle">{t('designSystemSelectableCard')}</AppText></SelectableCard>
    <View style={styles.row}><Badge label={t('pending')} tone="warning" /><Badge label={t('certified')} tone="success" /><Badge label={t('error')} tone="error" /></View><Divider />
    <InlineAlert tone="info" title={t('designSystemAlertTitle')} message={t('designSystemAlertMessage')} /><LoadingState message={t('loading')} compact /><EmptyState compact title={t('noData')} message={t('designSystemEmptyMessage')} actionLabel={t('newCycle')} onAction={() => undefined} /><ErrorState compact title={t('error')} message={t('designSystemErrorMessage')} actionLabel={t('retry')} onAction={() => undefined} />
    <Button label={t('designSystemOpenSelection')} onPress={() => setModalVisible(true)} />
  </ScrollView><SelectionModal visible={modalVisible} title={t('selectOption')} options={[{ value: 'one', label: t('designSystemOptionOne') }, { value: 'two', label: t('designSystemOptionTwo') }]} onSelect={() => setModalVisible(false)} onClose={() => setModalVisible(false)} closeLabel={t('cancel')} emptyLabel={t('noOptionsAvailable')} /></View>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.surface.page }, content: { gap: spacing[4], padding: spacing[4] }, swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }, swatch: { width: 44, height: 44, borderRadius: radii.md }, row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[2] } });
