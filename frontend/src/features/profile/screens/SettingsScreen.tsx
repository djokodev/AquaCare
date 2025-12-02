import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";

import { useAuth } from "@/hooks/useAuth";
import { STORAGE_KEYS } from "@/constants/api";
import { MAVECAM_COLORS } from "@/constants/colors";

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile, logout } = useAuth();
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
    try {
      setSettings((prev) => ({ ...prev, language: newLanguage }));
      await i18n.changeLanguage(newLanguage);
      await SecureStore.setItemAsync(STORAGE_KEYS.LANGUAGE, newLanguage);
      updateProfile({ language_preference: newLanguage }).catch((err) => console.warn("Profile lang update:", err));
      Alert.alert(
        newLanguage === "fr" ? "Langue mise à jour" : "Language Updated",
        newLanguage === "fr" ? "La langue a été changée vers Français" : "Language changed to English",
      );
    } catch (error) {
      console.error("Erreur changement langue:", error);
      Alert.alert("Erreur", "Impossible de changer la langue. Veuillez réessayer.");
      setSettings((prev) => ({ ...prev, language: i18n.language }));
    }
  };

  const handleAccountDeletion = () => {
    Alert.alert(
      "Supprimer le compte",
      "Êtes-vous sûr de vouloir supprimer définitivement votre compte ? Cette action est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            Alert.alert("Fonctionnalité à venir", "La suppression de compte sera disponible dans une prochaine version.");
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert("Déconnexion", "Êtes-vous sûr de vouloir vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Déconnexion", style: "destructive", onPress: () => logout() },
    ]);
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
        <Text className="text-lg font-bold text-gray-dark mb-3">{t("accountManagement")}</Text>
        <TouchableOpacity className="flex-row items-center p-4 rounded-lg mb-2 bg-[#fef2f2] border border-[#fecaca]" onPress={handleAccountDeletion}>
          <Ionicons name="trash" size={24} color={MAVECAM_COLORS.ERROR} />
          <View className="ml-3 flex-1">
            <Text className="text-base font-semibold" style={{ color: MAVECAM_COLORS.ERROR }}>
              {t("deleteAccount")}
            </Text>
            <Text className="text-xs text-gray-light">{t("deleteAccountDesc")}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View className="px-5 py-4">
        <Text className="text-lg font-bold text-gray-dark mb-3">{t("about")}</Text>
        <View className="bg-white p-4 rounded-xl shadow">
          <View className="flex-row items-center mb-3">
            <View className="flex-1">
              <Text className="text-lg font-bold text-gray-dark">MAVECAM AquaCare</Text>
            </View>
          </View>
          <Text className="text-sm text-gray-light leading-5">{t("appDescription")}</Text>
        </View>
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
