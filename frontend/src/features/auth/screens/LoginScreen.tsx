import React, { useState } from "react";
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { StackNavigationProp } from "@react-navigation/stack";
import { AuthStackParamList } from "@/navigation/AuthNavigator";
import { useAuth } from "@/hooks/useAuth";
import { LoginRequest } from "@/features/auth/types/auth";
import logger from "@/utils/logger";
import PhoneInputField from "@/components/common/PhoneInputField";
import AuthErrorBlock from "@/components/common/AuthErrorBlock";
import {
  AppText,
  Button,
  Card,
  SegmentedControl,
  TextField,
} from "@/components/ui";
import { spacing } from "@/theme";
import {
  hasValidationErrors,
  validateLoginForm,
  type LoginValidationErrors,
} from "@/features/auth/domain/accountValidation";

type LoginScreenNavigationProp = StackNavigationProp<
  AuthStackParamList,
  "Login"
>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

export default function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { login, isLoading, error, fieldErrors, clearAuthError } = useAuth();

  const [formData, setFormData] = useState({
    loginName: "",
    phoneNumber: "",
    password: "",
  });
  const [isPhoneMode, setIsPhoneMode] = useState(false);
  const [errors, setErrors] = useState<LoginValidationErrors>({});

  const validateForm = (): boolean => {
    const newErrors = validateLoginForm(formData, isPhoneMode);
    setErrors(newErrors);
    return !hasValidationErrors(newErrors);
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    clearAuthError();

    try {
      const credentials: LoginRequest = {
        password: formData.password,
      };

      if (isPhoneMode) {
        credentials.phone_number = formData.phoneNumber.trim();
      } else {
        credentials.login_name = formData.loginName.trim();
      }

      await login(credentials);
      // Navigation is handled by AppNavigator after auth state changes
    } catch (err) {
      logger.error("Login error:", err);
    }
  };

  const toggleMode = () => {
    setIsPhoneMode(!isPhoneMode);
    setFormData({ loginName: "", phoneNumber: "", password: "" });
    setErrors({});
    clearAuthError();
  };

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
    if (error) {
      clearAuthError();
    }
  };

  const backendFieldErrors: Partial<Record<keyof typeof formData, string>> = {
    loginName: fieldErrors.login_name,
    phoneNumber: fieldErrors.phone_number,
    password: fieldErrors.password,
  };
  const phoneFieldError = errors.phoneNumber || backendFieldErrors.phoneNumber;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-cream"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.content} className="px-5">
        <View style={styles.hero}>
          <AppText variant="screenTitle" color="link" style={styles.centered}>
            {t("welcomeMessage")}
          </AppText>
        </View>

        <Card variant="elevated" style={styles.card}>
          <AppText variant="sectionTitle" style={styles.centered}>
            {t("login")}
          </AppText>

          <SegmentedControl
            value={isPhoneMode ? "phone" : "login"}
            options={[
              { value: "login", label: t("loginName") },
              { value: "phone", label: t("phoneNumber") },
            ]}
            onChange={(next) => {
              if ((next === "phone") !== isPhoneMode) toggleMode();
            }}
          />

          {!isPhoneMode ? (
            <TextField
              label={t("loginName")}
              value={formData.loginName}
              onChangeText={(value) => updateField("loginName", value)}
              placeholder={t("placeholderLoginName")}
              autoCapitalize="words"
              autoComplete="name"
              error={errors.loginName || backendFieldErrors.loginName}
            />
          ) : (
            <PhoneInputField
              value={formData.phoneNumber}
              onChange={(formatted) => updateField("phoneNumber", formatted)}
              error={phoneFieldError}
            />
          )}

          <TextField
            label={t("password")}
            value={formData.password}
            onChangeText={(value) => updateField("password", value)}
            placeholder="********"
            secureTextEntry
            autoComplete="password"
            error={errors.password || backendFieldErrors.password}
          />

          <AuthErrorBlock error={error} />

          <Button
            label={t("signIn")}
            onPress={handleLogin}
            loading={isLoading}
          />

          <View style={styles.footer}>
            <AppText variant="helper" color="muted">
              {t("noAccount")}
            </AppText>
            <Button
              label={t("signUp")}
              onPress={() => navigation.navigate("Register")}
              variant="ghost"
              size="small"
              fullWidth={false}
            />
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "center" },
  hero: { alignItems: "center", marginBottom: spacing[10] },
  card: { gap: spacing[4] },
  centered: { textAlign: "center" },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing[1],
  },
});
