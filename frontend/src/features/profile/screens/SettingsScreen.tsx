import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";

import { useAuth } from "@/hooks/useAuth";
import { STORAGE_KEYS } from "@/constants/api";
import { MAVECAM_COLORS } from "@/constants/colors";
import logger from "@/utils/logger";
import config from "@/config/environment";
import Constants from "expo-constants";

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile, logout, deleteAccount } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingLanguage, setIsUpdatingLanguage] = useState(false);
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

  return (
    <ScrollView className="flex-1 bg-cream">
      <View className="bg-mavecam-primary items-center pt-14 pb-6 px-5">
        <Text className="text-xl font-bold text-white mb-1">{user?.display_name}</Text>
        <Text className="text-sm text-white/80">{user?.phone_number}</Text>
      </View>

      <View className="px-5 py-4">
        <Text className="text-lg font-bold text-gray-dark mb-3">{t("language")}</Text>
        {[{ code: "fr", label: "Français" }, { code: "en", label: "English" }].map((lang) => (
          <TouchableOpacity
            key={lang.code}
            className={`bg-white flex-row items-center justify-between p-4 rounded-lg mb-2 border ${
              settings.language === lang.code ? "border-mavecam-primary bg-[#f0fdf4]" : "border-gray-200"
            }`}
            onPress={() => handleLanguageChange(lang.code as "fr" | "en")}
            disabled={isUpdatingLanguage}
            style={{ opacity: isUpdatingLanguage ? 0.6 : 1 }}
          >
            <Text
              className={`text-base font-semibold ${
                settings.language === lang.code ? "text-mavecam-primary" : "text-gray-dark"
              }`}
            >
              {lang.label}
            </Text>
            {settings.language === lang.code && (
              <Ionicons name="checkmark" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            )}
          </TouchableOpacity>
        ))}            
      </View>

      <View className="px-5 py-4">
        <Text className="text-lg font-bold text-gray-dark mb-3">{t("about")}</Text>
        <View className="bg-white p-4 rounded-xl">
          <Text className="text-sm text-gray-dark leading-6">
            {t("aboutSummary")}
          </Text>
        </View>
      </View>

      <View className="px-5 py-4">
        <Text className="text-lg font-bold text-gray-dark mb-3">{t("appInfoSection")}</Text>
        <View className="bg-white rounded-xl overflow-hidden">
          {[
            { label: t("appInfoEnvironment"), value: config.environment },
            { label: t("appInfoApiUrl"), value: config.apiUrl },
            { label: t("appInfoVersion"), value: Constants.expoConfig?.version ?? "1.0.0" },
          ].map((row, index, arr) => (
            <View
              key={row.label}
              className={`flex-row items-center justify-between px-4 py-3 ${index < arr.length - 1 ? "border-b border-gray-100" : ""}`}
            >
              <Text className="text-sm text-gray-500">{row.label}</Text>
              <Text className="text-sm font-medium text-gray-dark max-w-[60%] text-right" numberOfLines={1}>{row.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="px-5 py-4">
        <Text className="text-lg font-bold text-gray-dark mb-3">{t("accountManagement")}</Text>
        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl border border-gray-200 opacity-100"
          onPress={handleDeleteAccount}
          disabled={isDeleting}
          style={{ opacity: isDeleting ? 0.5 : 1 }}
        >
          <Ionicons name="trash-outline" size={20} color={MAVECAM_COLORS.ERROR} />
          <View className="ml-3 flex-1">
            <Text className="text-base font-semibold text-error">{t("deleteAccount")}</Text>
            <Text className="text-xs text-gray-500 mt-0.5">{t("deleteAccountDesc")}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View className="px-5 pb-6">
        <TouchableOpacity className="bg-error flex-row items-center justify-center p-4 rounded-lg" onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color={MAVECAM_COLORS.WHITE} />
          <Text className="text-white text-base font-semibold ml-2">{t("disconnect")}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
