import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import { useAuth } from '@/hooks/useAuth';
import { STORAGE_KEYS } from '@/constants/api';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile, logout } = useAuth();

  const [settings, setSettings] = useState({
    language: i18n.language,
    notifications: true,
    darkMode: false,
    autoSync: true,
  });

  const handleLanguageChange = async (newLanguage: 'fr' | 'en') => {
    try {
      // Update in Redux store and API
      await updateProfile({ language_preference: newLanguage });
      
      // Update i18n
      i18n.changeLanguage(newLanguage);
      
      // Save to secure storage
      await SecureStore.setItemAsync(STORAGE_KEYS.LANGUAGE, newLanguage);
      
      setSettings(prev => ({ ...prev, language: newLanguage }));
      
      Alert.alert(
        'Langue mise à jour',
        `La langue a été changée vers ${newLanguage === 'fr' ? 'Français' : 'English'}`
      );
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de changer la langue');
    }
  };

  const toggleSetting = (key: keyof typeof settings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    // Here you could also save to AsyncStorage for persistence
  };

  const handleDataExport = () => {
    Alert.alert(
      'Export des données',
      'Cette fonctionnalité sera disponible dans une prochaine version.',
      [{ text: 'OK' }]
    );
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
            <Ionicons name="checkmark" size={20} color="#2563eb" />
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
            <Ionicons name="checkmark" size={20} color="#2563eb" />
          )}
        </TouchableOpacity>
      </View>

      {/* App Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Préférences de l'application</Text>
        
        <View style={styles.preferenceItem}>
          <View style={styles.preferenceLeft}>
            <Ionicons name="notifications" size={24} color="#64748b" />
            <View style={styles.preferenceText}>
              <Text style={styles.preferenceTitle}>Notifications</Text>
              <Text style={styles.preferenceSubtitle}>
                Recevoir des rappels et alertes
              </Text>
            </View>
          </View>
          <Switch
            value={settings.notifications}
            onValueChange={(value) => toggleSetting('notifications', value)}
            trackColor={{ false: '#d1d5db', true: '#3b82f6' }}
            thumbColor={settings.notifications ? '#ffffff' : '#f3f4f6'}
          />
        </View>

        <View style={styles.preferenceItem}>
          <View style={styles.preferenceLeft}>
            <Ionicons name="moon" size={24} color="#64748b" />
            <View style={styles.preferenceText}>
              <Text style={styles.preferenceTitle}>Mode sombre</Text>
              <Text style={styles.preferenceSubtitle}>
                Activer le thème sombre (bientôt disponible)
              </Text>
            </View>
          </View>
          <Switch
            value={settings.darkMode}
            onValueChange={(value) => toggleSetting('darkMode', value)}
            disabled={true}
            trackColor={{ false: '#d1d5db', true: '#3b82f6' }}
            thumbColor={settings.darkMode ? '#ffffff' : '#f3f4f6'}
          />
        </View>

        <View style={styles.preferenceItem}>
          <View style={styles.preferenceLeft}>
            <Ionicons name="sync" size={24} color="#64748b" />
            <View style={styles.preferenceText}>
              <Text style={styles.preferenceTitle}>Synchronisation automatique</Text>
              <Text style={styles.preferenceSubtitle}>
                Synchroniser les données en arrière-plan
              </Text>
            </View>
          </View>
          <Switch
            value={settings.autoSync}
            onValueChange={(value) => toggleSetting('autoSync', value)}
            trackColor={{ false: '#d1d5db', true: '#3b82f6' }}
            thumbColor={settings.autoSync ? '#ffffff' : '#f3f4f6'}
          />
        </View>
      </View>

      {/* Data & Privacy */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Données et confidentialité</Text>
        
        <TouchableOpacity style={styles.actionItem} onPress={handleDataExport}>
          <Ionicons name="download" size={24} color="#2563eb" />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Exporter mes données</Text>
            <Text style={styles.actionSubtitle}>
              Télécharger une copie de vos données
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem}>
          <Ionicons name="shield-checkmark" size={24} color="#059669" />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Politique de confidentialité</Text>
            <Text style={styles.actionSubtitle}>
              Consulter notre politique de protection des données
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem}>
          <Ionicons name="document-text" size={24} color="#059669" />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Conditions d'utilisation</Text>
            <Text style={styles.actionSubtitle}>
              Lire les termes et conditions
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Support */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        
        <TouchableOpacity style={styles.actionItem}>
          <Ionicons name="help-circle" size={24} color="#7c3aed" />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Centre d'aide</Text>
            <Text style={styles.actionSubtitle}>
              FAQ et guides d'utilisation
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem}>
          <Ionicons name="mail" size={24} color="#7c3aed" />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Contacter le support</Text>
            <Text style={styles.actionSubtitle}>
              support@mavecam.com
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem}>
          <Ionicons name="star" size={24} color="#f59e0b" />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Noter l'application</Text>
            <Text style={styles.actionSubtitle}>
              Donnez-nous votre avis sur les stores
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Account Management */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Gestion du compte</Text>
        
        <TouchableOpacity 
          style={styles.dangerActionItem} 
          onPress={handleAccountDeletion}
        >
          <Ionicons name="trash" size={24} color="#dc2626" />
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, { color: '#dc2626' }]}>
              Supprimer mon compte
            </Text>
            <Text style={styles.actionSubtitle}>
              Suppression définitive de toutes vos données
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>À propos</Text>
        
        <View style={styles.appInfo}>
          <Text style={styles.appName}>MAVECAM AquaCare</Text>
          <Text style={styles.appVersion}>Version 1.0.0 MVP</Text>
          <Text style={styles.appDescription}>
            Application de gestion aquacole pour les pisciculteurs camerounais.
            Développée par MAVECAM en partenariat avec l'expertise technique locale.
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
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  userSection: {
    backgroundColor: '#2563eb',
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
    borderColor: '#2563eb',
    backgroundColor: '#f0f9ff',
  },
  languageText: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '500',
  },
  languageTextSelected: {
    color: '#2563eb',
  },
  preferenceItem: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  preferenceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  preferenceText: {
    marginLeft: 12,
    flex: 1,
  },
  preferenceTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
    marginBottom: 2,
  },
  preferenceSubtitle: {
    fontSize: 12,
    color: '#64748b',
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
  appInfo: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  appName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2563eb',
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
  },
  appDescription: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  buttonContainer: {
    padding: 20,
  },
  logoutButton: {
    backgroundColor: '#dc2626',
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