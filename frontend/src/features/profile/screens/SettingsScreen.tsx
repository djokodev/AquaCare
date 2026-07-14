import React, { useState, useEffect } from "react";
import { View, ScrollView, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";

import { useAuth } from "@/hooks/useAuth";
import { STORAGE_KEYS } from "@/constants/api";
import { AQUACARE_COLORS } from "@/constants/colors";
import logger from "@/utils/logger";
import OnboardingService from "@/features/onboarding/services/onboardingService";
import { AppText, Button, Card, SelectableCard } from '@/components/ui';
import { spacing } from '@/theme';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile, logout, deleteAccount } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingLanguage, setIsUpdatingLanguage] = useState(false);
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
    if (isUpdatingLanguage || settings.language === newLanguage) return;

    const previousLanguage = settings.language as "fr" | "en";
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
    <ScrollView className="flex-1 bg-cream">
      <View className="bg-aquacare-primary items-center pt-14 pb-6 px-5">
        <AppText variant="screenTitle" color="inverse">{user?.display_name}</AppText>
        <AppText variant="caption" color="inverse">{user?.phone_number}</AppText>
      </View>

      <View className="px-5 py-4">
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
              <Ionicons name="checkmark" size={20} color={AQUACARE_COLORS.GREEN_PRIMARY} />
            )}
          </SelectableCard>
        ))}            
      </View>

      <View className="px-5 py-4">
        <AppText variant="sectionTitle" style={styles.sectionTitle}>{t("about")}</AppText>
        <Card><AppText>{t("aboutSummary")}</AppText></Card>
      </View>

      <View className="px-5 py-4">
        <AppText variant="sectionTitle" style={styles.sectionTitle}>{t("accountManagement")}</AppText>
        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl border border-gray-200 opacity-100"
          onPress={handleDeleteAccount}
          disabled={isDeleting}
          style={{ opacity: isDeleting ? 0.5 : 1 }}
        >
          <Ionicons name="trash-outline" size={20} color={AQUACARE_COLORS.ERROR} />
          <View className="ml-3 flex-1">
            <AppText variant="bodyStrong" color="error">{t("deleteAccount")}</AppText>
            <AppText variant="caption" color="muted">{t("deleteAccountDesc")}</AppText>
          </View>
        </TouchableOpacity>

        {__DEV__ && (
          <TouchableOpacity
            className="bg-white flex-row items-center p-4 rounded-xl border border-gray-200 mt-3"
            onPress={handleResetOnboarding}
            disabled={isResettingOnboarding}
            style={{ opacity: isResettingOnboarding ? 0.5 : 1 }}
          >
            <Ionicons name="refresh-circle-outline" size={20} color={AQUACARE_COLORS.GREEN_PRIMARY} />
            <View className="ml-3 flex-1">
              <AppText variant="bodyStrong" color="link">{t("onboardingResetAction")}</AppText>
              <AppText variant="caption" color="muted">{t("onboardingResetHint")}</AppText>
            </View>
          </TouchableOpacity>
        )}
      </View>

      <View className="px-5 pb-6">
        <Button label={t('disconnect')} variant="danger" iconLeft="log-out" onPress={handleLogout} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { marginBottom: spacing[3] },
  languageCard: { marginBottom: spacing[2] },
});
