import type { LoginRequest, RegisterRequest } from '@/features/auth/types/auth';
import { PHONE_REGEX } from '@/utils/phoneFormatter';

type LoginForm = {
  loginName: string;
  phoneNumber: string;
  password: string;
};

export type LoginValidationErrors = Partial<Record<keyof LoginForm, string>>;
export type RegisterValidationErrors = Partial<Record<keyof RegisterRequest, string>>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateLoginForm = (
  formData: LoginForm,
  isPhoneMode: boolean
): LoginValidationErrors => {
  const errors: LoginValidationErrors = {};

  if (isPhoneMode) {
    if (!formData.phoneNumber.trim()) {
      errors.phoneNumber = 'required';
    } else if (!PHONE_REGEX.test(formData.phoneNumber.trim())) {
      errors.phoneNumber = 'invalidPhone';
    }
  } else if (!formData.loginName.trim()) {
    errors.loginName = 'required';
  }

  if (!formData.password.trim()) {
    errors.password = 'required';
  } else if (formData.password.length < 8) {
    errors.password = 'passwordTooShort';
  }

  return errors;
};

export const validateRegisterForm = (
  formData: RegisterRequest
): RegisterValidationErrors => {
  const errors: RegisterValidationErrors = {};

  if (!formData.phone_number.trim()) {
    errors.phone_number = 'required';
  } else if (!PHONE_REGEX.test(formData.phone_number.trim())) {
    errors.phone_number = 'invalidPhone';
  }

  if (formData.email && !EMAIL_REGEX.test(formData.email.trim())) {
    errors.email = 'invalidEmail';
  }

  if (!formData.password.trim()) {
    errors.password = 'required';
  } else if (formData.password.length < 8) {
    errors.password = 'passwordTooShort';
  }

  if (formData.password !== formData.password_confirm) {
    errors.password_confirm = 'passwordMismatch';
  }

  if (formData.account_type === 'individual') {
    if (!formData.first_name?.trim()) errors.first_name = 'required';
    if (!formData.last_name?.trim()) errors.last_name = 'required';
    if (!formData.age_group) errors.age_group = 'required';
  }

  if (formData.account_type === 'company') {
    if (!formData.business_name?.trim()) errors.business_name = 'required';
    if (!formData.legal_status) errors.legal_status = 'required';
    if (!formData.promoter_name?.trim()) errors.promoter_name = 'required';
  }

  return errors;
};

export const hasValidationErrors = (
  errors: Record<string, string | undefined>
): boolean => Object.values(errors).some(Boolean);
