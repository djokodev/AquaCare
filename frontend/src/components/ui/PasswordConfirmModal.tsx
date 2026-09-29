import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { TextField } from "./TextField";
import { colors, radii, shadows, spacing } from "@/theme";

interface PasswordConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  passwordLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Message d'erreur affiché sous le champ (ex: mot de passe incorrect). */
  error?: string | null;
  loading?: boolean;
  destructive?: boolean;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}

/**
 * Demande le mot de passe actuel avant une action sensible (changement
 * d'email, suppression de compte). Fonctionne sur iOS et Android, contrairement
 * à Alert.prompt qui n'existe que sur iOS.
 */
export function PasswordConfirmModal({
  visible,
  title,
  message,
  passwordLabel,
  confirmLabel,
  cancelLabel,
  error,
  loading = false,
  destructive = false,
  onConfirm,
  onCancel,
}: PasswordConfirmModalProps) {
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!visible) setPassword("");
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.dialog}>
          <AppText variant="cardTitle">{title}</AppText>
          <AppText color="muted">{message}</AppText>
          <TextField
            label={passwordLabel}
            value={password}
            onChangeText={setPassword}
            placeholder="********"
            secureTextEntry
            autoComplete="password"
            autoFocus
            error={error ?? undefined}
          />
          <Button
            label={confirmLabel}
            variant={destructive ? "danger" : "primary"}
            loading={loading}
            disabled={!password || loading}
            onPress={() => onConfirm(password)}
          />
          <Button label={cancelLabel} variant="ghost" disabled={loading} onPress={onCancel} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: spacing[5],
    backgroundColor: colors.overlay.default,
  },
  dialog: {
    gap: spacing[3],
    padding: spacing[5],
    borderRadius: radii.xl,
    backgroundColor: colors.surface.card,
    ...shadows.large,
  },
});
