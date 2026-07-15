import React, { useState, useEffect, useRef } from "react";
import { View, ScrollView, Alert, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";

import { useAuth } from "@/hooks/useAuth";
import { STORAGE_KEYS } from "@/constants/api";
import logger from "@/utils/logger";
import OnboardingService from "@/features/onboarding/services/onboardingService";
import { AppText, Button, Card, InteractiveCard, SelectableCard } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile, logout, deleteAccount } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingLanguage, setIsUpdatingLanguage] = useState(false);
  const languageUpdateInProgressRef = useRef(false);
  const [isResettingOnboarding, setIsResettingOnboarding] = useState(false);
  const [settings, setSettings] = useState({ language: i18n.language });

  useEffect(() => {
    const currentLang = i18n.language;
    if (currentLang !== settings.language) {
      setSettings((prev) => ({ ...prev, language: currentLang }));
    }
    const handleLanguageChanged = (lng: string) => setSettings((prev) => ({ ...prev, language: lng }));
    i18n.on("languageChanged", handleLanguageChanged);
    return () => i18n.off("languageChanged", handleLanguageChanged);
  }, [i18n, settings.language]);

  const handleLanguageChange = async (newLanguage: "fr" | "en") => {
    if (languageUpdateInProgressRef.current || settings.language === newLanguage) return;

    const previousLanguage = settings.language as "fr" | "en";
    languageUpdateInProgressRef.current = true;
    setIsUpdatingLanguage(true);
    try {
      setSettings((prev) => ({ ...prev, language: newLanguage }));
      await i18n.changeLanguage(newLanguage);
      await SecureStore.setItemAsync(STORAGE_KEYS.LANGUAGE, newLanguage);
      await updateProfile({ language_preference: newLanguage });
      Alert.alert(
        t('languageUpdatedTitle'),
        newLanguage === "fr" ? t('languageUpdatedToFrench') : t('languageUpdatedToEnglish'),
      );
    } catch (error) {
      logger.error("Erreur changement langue:", error);
      Alert.alert(t('error'), t('languageChangeError'));
      setSettings((prev) => ({ ...prev, language: previousLanguage }));
      try {
        await i18n.changeLanguage(previousLanguage);
        await SecureStore.setItemAsync(STORAGE_KEYS.LANGUAGE, previousLanguage);
      } catch (rollbackError) {
        logger.warn("Erreur rollback langue:", rollbackError);
      }
    } finally {
      languageUpdateInProgressRef.current = false;
      setIsUpdatingLanguage(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(t("logoutConfirm"), t("logoutMessage"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("logoutConfirm"), style: "destructive", onPress: () => logout() },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('deleteAccountConfirmTitle'),
      t('deleteAccountConfirmMessage'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('deleteAccountConfirm'),
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteAccount();
              // Redux state cleared → navigation auto-redirects to login
            } catch (error) {
              logger.error('Delete account error:', error);
              Alert.alert(t('deleteAccountError'));
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleResetOnboarding = () => {
    if (isResettingOnboarding) return;

    Alert.alert(
      t("onboardingResetConfirmTitle"),
      t("onboardingResetConfirmMessage"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("onboardingResetAction"),
          style: "destructive",
          onPress: async () => {
            setIsResettingOnboarding(true);
            try {
              await OnboardingService.reset();
              await logout();
            } catch (error) {
              logger.error("Onboarding reset error:", error);
              Alert.alert(t("error"), t("onboardingResetError"));
            } finally {
              setIsResettingOnboarding(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <AppText variant="screenTitle" color="inverse">{user?.display_name}</AppText>
        <AppText variant="caption" color="inverse">{user?.phone_number}</AppText>
      </View>

      <View style={styles.section}>
        <AppText variant="sectionTitle" style={styles.sectionTitle}>{t("language")}</AppText>
        {[
          { code: "fr", label: t('languageFrench') },
          { code: "en", label: t('languageEnglish') },
        ].map((lang) => (
          <SelectableCard
            key={lang.code}
            accessibilityLabel={lang.label}
            selected={settings.language === lang.code}
            layout="row"
            style={styles.languageCard}
            onPress={() => handleLanguageChange(lang.code as "fr" | "en")}
            disabled={isUpdatingLanguage}
          >
            <AppText variant="bodyStrong" color={settings.language === lang.code ? 'link' : 'primary'}>{lang.label}</AppText>
            {settings.language === lang.code && (
              <Ionicons name="checkmark" size={20} color={colors.brand.primary} />
            )}
          </SelectableCard>
        ))}            
      </View>

      <View style={styles.section}>
        <AppText variant="sectionTitle" style={styles.sectionTitle}>{t("about")}</AppText>
        <Card>
          <AppText>{t("aboutSummaryParagraph1")}</AppText>
          <AppText style={styles.aboutParagraph}>{t("aboutSummaryParagraph2")}</AppText>
        </Card>
      </View>

      <View style={styles.section}>
        <AppText variant="sectionTitle" style={styles.sectionTitle}>{t("accountManagement")}</AppText>
        <InteractiveCard
          accessibilityLabel={t('deleteAccount')}
          onPress={handleDeleteAccount}
          disabled={isDeleting}
          style={styles.actionCard}
        >
          <View style={styles.actionContent}>
            <Ionicons name="trash-outline" size={20} color={colors.status.error} />
            <View style={styles.actionText}>
            <AppText variant="bodyStrong" color="error">{t("deleteAccount")}</AppText>
            <AppText variant="caption" color="muted">{t("deleteAccountDesc")}</AppText>
            </View>
          </View>
        </InteractiveCard>

        {__DEV__ && (
          <InteractiveCard
            accessibilityLabel={t('onboardingResetAction')}
            onPress={handleResetOnboarding}
            disabled={isResettingOnboarding}
            style={styles.resetCard}
          >
            <View style={styles.actionContent}>
              <Ionicons name="refresh-circle-outline" size={20} color={colors.brand.primary} />
              <View style={styles.actionText}>
              <AppText variant="bodyStrong" color="link">{t("onboardingResetAction")}</AppText>
              <AppText variant="caption" color="muted">{t("onboardingResetHint")}</AppText>
              </View>
            </View>
          </InteractiveCard>
        )}
      </View>

      <View style={styles.section}>
        <Button label={t('disconnect')} variant="danger" iconLeft="log-out" onPress={handleLogout} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  content: { gap: spacing[4], paddingBottom: spacing[6] },
  hero: { alignItems: 'center', gap: spacing[1], backgroundColor: colors.brand.primary, padding: spacing[5] },
  section: { paddingHorizontal: spacing[4] },
  sectionTitle: { marginBottom: spacing[3] },
  languageCard: { marginBottom: spacing[2] },
  actionCard: { justifyContent: 'flex-start' },
  resetCard: { justifyContent: 'flex-start', marginTop: spacing[3] },
  actionContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  actionText: { flex: 1, gap: spacing[1] },
  aboutParagraph: { marginTop: spacing[3] },
});
