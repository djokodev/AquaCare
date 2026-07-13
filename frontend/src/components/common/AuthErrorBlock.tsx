import React from "react";
import { useTranslation } from "react-i18next";
import { getAccountErrorMessage } from "@/features/auth/utils/accountsErrorPresenter";
import { InlineAlert } from "@/components/ui";

interface AuthErrorBlockProps {
  error: string | null;
}

/**
 * Bloc d'erreur API (erreurs globales, pas les erreurs de champ).
 * Partagé entre LoginScreen et RegisterScreen.
 * La couleur bg-red-50 correspond au token design #fef2f2.
 */
export default function AuthErrorBlock({ error }: AuthErrorBlockProps) {
  const { t } = useTranslation();

  if (!error) return null;

  return (
    <InlineAlert tone="error" message={getAccountErrorMessage(error, t)} />
  );
}
