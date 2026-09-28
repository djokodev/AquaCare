import React, { useState } from "react";
import {
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { StackNavigationProp } from "@react-navigation/stack";
import { ProfileStackParamList } from "@/navigation/MainNavigator";
import { authService, AuthRequestError } from "@/features/auth/services/authService";
import logger from "@/utils/logger";
import AuthErrorBlock from "@/components/common/AuthErrorBlock";
import { AppText, Button, Card, TextField } from "@/components/ui";
import { spacing } from "@/theme";

type ChangePasswordNavigationProp = StackNavigationProp<
  ProfileStackParamList,
  "ChangePassword"
>;

interface Props {
  navigation: ChangePasswordNavigationProp;
}

export default function ChangePasswordScreen({ navigation }: Props) {
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: "" }));
    }
    if (error) setError(null);
  };

  const validateForm = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!formData.currentPassword.trim()) {
      nextErrors.currentPassword = "required";
    }
    if (!formData.newPassword.trim()) {
      nextErrors.newPassword = "required";
    } else if (formData.newPassword.length < 8) {
      nextErrors.newPassword = "passwordTooShort";
    }
    if (formData.newPassword !== formData.confirmPassword) {
      nextErrors.confirmPassword = "passwordMismatch";
    }

    setFieldErrors(nextErrors);
    return Object.values(nextErrors).every((value) => !value);
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setError(null);
    setIsSubmitting(true);

    try {
      await authService.changePassword({
        current_password: formData.currentPassword,
        password: formData.newPassword,
        password_confirm: formData.confirmPassword,
      });
      Alert.alert(
        t("changePasswordSuccessTitle"),
        t("changePasswordSuccessMessage"),
        [{ text: t("ok"), onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      logger.error("Change password error:", err);
      if (err instanceof AuthRequestError) {
        setError(err.message || "AUTH_UNKNOWN_ERROR");
        setFieldErrors({
          currentPassword: err.fieldErrors.current_password || "",
          newPassword: err.fieldErrors.password || "",
          confirmPassword: err.fieldErrors.password_confirm || "",
        });
      } else {
        setError("AUTH_UNKNOWN_ERROR");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-cream"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.content} className="px-5">
        <Card variant="elevated" style={styles.card}>
          <AppText variant="screenTitle">{t("changePasswordTitle")}</AppText>
          <AppText variant="body" color="muted">
            {t("changePasswordIntro")}
          </AppText>

          <TextField
            label={t("currentPassword")}
            value={formData.currentPassword}
            onChangeText={(value) => updateField("currentPassword", value)}
            placeholder="********"
            secureTextEntry
            autoComplete="password"
            error={fieldErrors.currentPassword}
          />

          <TextField
            label={t("newPassword")}
            value={formData.newPassword}
            onChangeText={(value) => updateField("newPassword", value)}
            placeholder="********"
            secureTextEntry
            autoComplete="new-password"
            error={fieldErrors.newPassword}
          />

          <TextField
            label={t("confirmNewPassword")}
            value={formData.confirmPassword}
            onChangeText={(value) => updateField("confirmPassword", value)}
            placeholder="********"
            secureTextEntry
            autoComplete="new-password"
            error={fieldErrors.confirmPassword}
          />

          <AuthErrorBlock error={error} />

          <Button
            label={t("changePasswordSubmit")}
            onPress={handleSubmit}
            loading={isSubmitting}
          />

          <Button
            label={t("cancel")}
            onPress={() => navigation.goBack()}
            variant="ghost"
            size="small"
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "center" },
  card: { gap: spacing[4] },
});
