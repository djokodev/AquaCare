import React, { useState } from "react";
import {
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { StackNavigationProp } from "@react-navigation/stack";
import { AuthStackParamList } from "@/navigation/AuthNavigator";
import { authService, AuthRequestError } from "@/features/auth/services/authService";
import logger from "@/utils/logger";
import PhoneInputField from "@/components/common/PhoneInputField";
import AuthErrorBlock from "@/components/common/AuthErrorBlock";
import { AppText, Button, Card, InlineAlert } from "@/components/ui";
import { PHONE_REGEX } from "@/utils/phoneFormatter";
import { spacing } from "@/theme";

type ForgotPasswordNavigationProp = StackNavigationProp<
  AuthStackParamList,
  "ForgotPassword"
>;

interface Props {
  navigation: ForgotPasswordNavigationProp;
}

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { t } = useTranslation();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async () => {
    const trimmed = phoneNumber.trim();
    if (!trimmed) {
      setFieldError("required");
      return;
    }
    if (!PHONE_REGEX.test(trimmed)) {
      setFieldError("invalidPhone");
      return;
    }

    setFieldError(null);
    setError(null);
    setIsSubmitting(true);

    try {
      await authService.requestPasswordReset(trimmed);
      setIsSent(true);
    } catch (err) {
      if (err instanceof AuthRequestError) {
        const fieldMessage = err.fieldErrors.phone_number || null;
        setFieldError(fieldMessage);
        setError(fieldMessage ? null : err.message || "AUTH_UNKNOWN_ERROR");
        if (!fieldMessage) {
          logger.error("Forgot password error:", err);
        }
      } else {
        logger.error("Forgot password error:", err);
        setError("AUTH_UNKNOWN_ERROR");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePhone = (formatted: string) => {
    setPhoneNumber(formatted);
    if (fieldError) setFieldError(null);
    if (error) setError(null);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-cream"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.content} className="px-5">
        <Card variant="elevated" style={styles.card}>
          <AppText variant="screenTitle">{t("forgotPasswordTitle")}</AppText>
          {!isSent && (
            <AppText variant="body" color="muted">
              {t("forgotPasswordIntro")}
            </AppText>
          )}

          {isSent ? (
            <InlineAlert tone="success" message={t("forgotPasswordSentMessage")} />
          ) : (
            <>
              <PhoneInputField
                value={phoneNumber}
                onChange={handleChangePhone}
                error={fieldError ? t(fieldError, { defaultValue: fieldError }) : undefined}
              />

              <AuthErrorBlock error={error} />

              <Button
                label={t("forgotPasswordSubmit")}
                onPress={handleSubmit}
                loading={isSubmitting}
              />
            </>
          )}

          <Button
            label={t("backToLogin")}
            onPress={() => navigation.navigate("Login")}
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
