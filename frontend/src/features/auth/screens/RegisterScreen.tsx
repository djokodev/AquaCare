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
import { RegisterRequest } from "@/features/auth/types/auth";
import SelectField from "@/components/SelectField";
import logger from "@/utils/logger";
import PhoneInputField from "@/components/common/PhoneInputField";
import AuthErrorBlock from "@/components/common/AuthErrorBlock";
import {
  AppText,
  Button,
  Card,
  FormField,
  SegmentedControl,
  TextField,
} from "@/components/ui";
import { spacing } from "@/theme";
import {
  REGIONS,
  AGE_GROUPS,
  LEGAL_STATUS_OPTIONS,
} from "@/constants/registration";
import {
  hasValidationErrors,
  validateRegisterForm,
  type RegisterValidationErrors,
} from "@/features/auth/domain/accountValidation";

type RegisterScreenNavigationProp = StackNavigationProp<
  AuthStackParamList,
  "Register"
>;

interface Props {
  navigation: RegisterScreenNavigationProp;
}

export default function RegisterScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { register, isLoading, error, fieldErrors, clearAuthError } = useAuth();

  const [formData, setFormData] = useState<RegisterRequest>({
    phone_number: "",
    email: "",
    first_name: "",
    last_name: "",
    business_name: "",
    account_type: "individual",
    age_group: "",
    activity_type: "poisson_table",
    region: "",
    language_preference: "fr",
    password: "",
    password_confirm: "",
    legal_status: "",
    promoter_name: "",
  });

  const [errors, setErrors] = useState<RegisterValidationErrors>({});

  const validateForm = (): boolean => {
    const newErrors = validateRegisterForm(formData);
    setErrors(newErrors);
    return !hasValidationErrors(newErrors);
  };

  const handleRegister = async () => {
    if (!validateForm()) return;
    clearAuthError();
    try {
      await register(formData);
    } catch (err) {
      logger.error("Registration error:", err);
    }
  };

  const updateField = <K extends keyof RegisterRequest>(
    field: K,
    value: RegisterRequest[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
    if (error) clearAuthError();
  };

  const phoneFieldError = errors.phone_number || fieldErrors.phone_number;

  const getFieldError = (field: keyof RegisterValidationErrors) => {
    const message = errors[field] || fieldErrors[field];
    return message ? t(message, { defaultValue: message }) : undefined;
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-cream"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <AppText variant="screenTitle" color="link">
            {t("register")}
          </AppText>
          <AppText variant="body" color="muted" style={styles.centered}>
            {t("createAccount")}
          </AppText>
        </View>

        <Card variant="elevated" style={styles.card}>
          <FormField label={t("accountType")}>
            <SegmentedControl
              value={formData.account_type}
              options={[
                { value: "individual", label: t("individual") },
                { value: "company", label: t("company") },
              ]}
              onChange={(accountType) =>
                updateField("account_type", accountType)
              }
            />
          </FormField>

          <PhoneInputField
            value={formData.phone_number}
            onChange={(formatted) => updateField("phone_number", formatted)}
            error={phoneFieldError}
            hint={t("whatsAppHint")}
            required
          />

          <TextField
            label={t("email")}
            value={formData.email}
            onChangeText={(value) => updateField("email", value)}
            placeholder={t("placeholderEmail")}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={getFieldError("email")}
          />

          {formData.account_type === "individual" && (
            <>
              <TextField
                label={t("firstName")}
                required
                value={formData.first_name}
                onChangeText={(value) => updateField("first_name", value)}
                placeholder={t("placeholderFirstName")}
                autoCapitalize="words"
                autoComplete="name-given"
                error={getFieldError("first_name")}
              />
              <TextField
                label={t("lastName")}
                required
                value={formData.last_name}
                onChangeText={(value) => updateField("last_name", value)}
                placeholder={t("placeholderLastName")}
                autoCapitalize="words"
                autoComplete="name-family"
                error={getFieldError("last_name")}
              />

              <SelectField
                label={t("ageGroup")}
                value={formData.age_group}
                onChange={(value) => updateField("age_group", value)}
                options={AGE_GROUPS}
                placeholder={t("selectOption")}
                error={getFieldError("age_group")}
                required
              />
            </>
          )}

          {formData.account_type === "company" && (
            <>
              <TextField
                label={t("businessName")}
                required
                value={formData.business_name}
                onChangeText={(value) => updateField("business_name", value)}
                placeholder={t("placeholderBusinessName")}
                autoCapitalize="words"
                error={getFieldError("business_name")}
              />

              <SelectField
                label={t("legalStatus")}
                value={formData.legal_status}
                onChange={(value) => updateField("legal_status", value)}
                options={LEGAL_STATUS_OPTIONS}
                placeholder={t("selectLegalStatus")}
                error={getFieldError("legal_status")}
                required
              />

              <TextField
                label={t("promoterName")}
                required
                value={formData.promoter_name}
                onChangeText={(value) => updateField("promoter_name", value)}
                placeholder={t("placeholderPromoterName")}
                autoCapitalize="words"
                error={getFieldError("promoter_name")}
              />
            </>
          )}

          <SelectField
            label={t("region")}
            value={formData.region}
            onChange={(value) => updateField("region", value)}
            options={REGIONS}
            placeholder={t("selectRegion")}
            error={getFieldError("region")}
          />

          <TextField
            label={t("password")}
            required
            value={formData.password}
            onChangeText={(value) => updateField("password", value)}
            placeholder="********"
            secureTextEntry
            autoComplete="new-password"
            error={getFieldError("password")}
          />
          <TextField
            label={t("confirmPassword")}
            required
            value={formData.password_confirm}
            onChangeText={(value) => updateField("password_confirm", value)}
            placeholder="********"
            secureTextEntry
            autoComplete="new-password"
            error={getFieldError("password_confirm")}
          />

          <AuthErrorBlock error={error} />

          <Button
            label={t("signUp")}
            onPress={handleRegister}
            loading={isLoading}
          />

          <View style={styles.footer}>
            <AppText variant="helper" color="muted">
              {t("haveAccount")}
            </AppText>
            <Button
              label={t("signIn")}
              onPress={() => navigation.navigate("Login")}
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
  content: { padding: spacing[5], paddingTop: spacing[10] + spacing[2] },
  hero: { alignItems: "center", gap: spacing[2], marginBottom: spacing[8] },
  centered: { textAlign: "center" },
  card: { gap: spacing[4] },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing[1],
  },
});
