import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import { useAuth } from '@/hooks/useAuth';
import { STORAGE_KEYS } from '@/constants/api';

// Couleurs MAVECAM selon spécifications
const MAVECAM_COLORS = {
  GREEN_PRIMARY: '#059669',
  GREEN_LIGHT: '#10b981',
  GREEN_DARK: '#047857',
  WHITE: '#ffffff',
  CREAM: '#f8fafc',
  SUCCESS: '#059669',
  WARNING: '#f59e0b',
  ERROR: '#dc2626',
  INFO: '#0ea5e9',
  GRAY_LIGHT: '#64748b',
  GRAY_DARK: '#1e293b',
};

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile, logout } = useAuth();

  const [settings, setSettings] = useState({
    language: i18n.language,
  });

  // Synchroniser avec i18n au montage et aux changements
  React.useEffect(() => {
    const currentLang = i18n.language;
    if (currentLang !== settings.language) {
      setSettings(prev => ({ ...prev, language: currentLang }));
    }

    // Écouter les changements de langue
    const handleLanguageChanged = (lng: string) => {
      setSettings(prev => ({ ...prev, language: lng }));
    };

    i18n.on('languageChanged', handleLanguageChanged);

    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [settings.language]);

  const handleLanguageChange = async (newLanguage: 'fr' | 'en') => {
    try {
      // 1. Update local state first
      setSettings(prev => ({ ...prev, language: newLanguage }));

      // 2. Change i18n language immediately
      await i18n.changeLanguage(newLanguage);

      // 3. Save to secure storage for persistence
      await SecureStore.setItemAsync(STORAGE_KEYS.LANGUAGE, newLanguage);

      // 4. Update profile (non-blocking)
      updateProfile({ language_preference: newLanguage }).catch(error => {
        console.warn('Erreur lors de la mise à jour du profil:', error);
      });
      
      Alert.alert(
        newLanguage === 'fr' ? 'Langue mise à jour' : 'Language Updated',
        newLanguage === 'fr' 
          ? 'La langue a été changée vers Français' 
          : 'Language changed to English'
      );
    } catch (error) {
      console.error('Erreur changement langue:', error);
      Alert.alert(
        'Erreur', 
        'Impossible de changer la langue. Veuillez réessayer.'
      );
      // Revert local state on error
      setSettings(prev => ({ ...prev, language: i18n.language }));
    }
  };



  const handleAccountDeletion = () => {
    Alert.alert(
      'Supprimer le compte',
      'Êtes-vous sûr de vouloir supprimer définitivement votre compte ? Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Fonctionnalité à venir',
              'La suppression de compte sera disponible dans une prochaine version.'
            );
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* User Info Header */}
      <View style={styles.userSection}>
        <Text style={styles.userName}>
          {user?.display_name}
        </Text>
        <Text style={styles.userPhone}>
          {user?.phone_number}
        </Text>
      </View>

      {/* Language Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('language')}</Text>
        
        <TouchableOpacity
          style={[
            styles.languageOption,
            settings.language === 'fr' && styles.languageOptionSelected
          ]}
          onPress={() => handleLanguageChange('fr')}
        >
          <Text style={[
            styles.languageText,
            settings.language === 'fr' && styles.languageTextSelected
          ]}>
            🇫🇷 Français
          </Text>
          {settings.language === 'fr' && (
            <Ionicons name="checkmark" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.languageOption,
            settings.language === 'en' && styles.languageOptionSelected
          ]}
          onPress={() => handleLanguageChange('en')}
        >
          <Text style={[
            styles.languageText,
            settings.language === 'en' && styles.languageTextSelected
          ]}>
            🇺🇸 English
          </Text>
          {settings.language === 'en' && (
            <Ionicons name="checkmark" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          )}
        </TouchableOpacity>
      </View>



      {/* Account Management */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('accountManagement')}</Text>
        
        <TouchableOpacity 
          style={styles.dangerActionItem} 
          onPress={handleAccountDeletion}
        >
          <Ionicons name="trash" size={24} color={MAVECAM_COLORS.ERROR} />
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, { color: MAVECAM_COLORS.ERROR }]}>
              {t('deleteAccount')}
            </Text>
            <Text style={styles.actionSubtitle}>
              {t('deleteAccountDesc')}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('about')}</Text>
        
        {/* App Info Card */}
        <View style={styles.aboutCard}>
          {/* Header */}
          <View style={styles.aboutHeader}>
            <View style={styles.appInfoText}>
              <Text style={styles.appName}>MAVECAM AquaCare</Text>
            </View>
          </View>
          
          {/* Description */}
          <Text style={styles.appDescription}>
            {t('appDescription')}
          </Text>
        </View>
      </View>

      {/* Logout Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => {
            Alert.alert(
              'Déconnexion',
              'Êtes-vous sûr de vouloir vous déconnecter ?',
              [
                { text: 'Annuler', style: 'cancel' },
                { 
                  text: 'Déconnexion', 
                  style: 'destructive',
                  onPress: () => logout()
                },
              ]
            );
          }}
        >
          <Ionicons name="log-out" size={20} color="#ffffff" />
          <Text style={styles.logoutText}>{t('disconnect')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  userSection: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    padding: 20,
    paddingTop: 60,
    alignItems: 'center',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  userPhone: {
    fontSize: 14,
    color: '#bfdbfe',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 16,
  },
  languageOption: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  languageOptionSelected: {
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
    backgroundColor: '#f0fdf4',
  },
  languageText: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '500',
  },
  languageTextSelected: {
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  actionItem: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  dangerActionItem: {
    backgroundColor: '#fef2f2',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  actionText: {
    marginLeft: 12,
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  aboutCard: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  aboutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  appInfoText: {
    flex: 1,
  },
  appName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 6,
  },
  appDescription: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    lineHeight: 20,
  },
  buttonContainer: {
    padding: 20,
  },
  logoutButton: {
    backgroundColor: MAVECAM_COLORS.ERROR,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 8,
  },
  logoutText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});