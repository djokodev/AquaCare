import {
  hasValidationErrors,
  validateLoginForm,
  validateRegisterForm,
} from '@/features/auth/domain/accountValidation';
import type { RegisterRequest } from '@/features/auth/types/auth';

const baseRegisterData: RegisterRequest = {
  phone_number: '+237670000000',
  email: '',
  first_name: 'Jean',
  last_name: 'Dupont',
  business_name: '',
  account_type: 'individual',
  age_group: '26_35',
  activity_type: 'poisson_table',
  region: '',
  language_preference: 'fr',
  password: 'password123',
  password_confirm: 'password123',
  legal_status: '',
  promoter_name: '',
};

describe('accountValidation', () => {
  describe('validateLoginForm', () => {
    it('valide le login par nom', () => {
      const errors = validateLoginForm(
        { loginName: 'Jean Dupont', phoneNumber: '', password: 'password123' },
        false
      );

      expect(errors).toEqual({});
      expect(hasValidationErrors(errors)).toBe(false);
    });

    it('retourne les erreurs du login par telephone', () => {
      const errors = validateLoginForm(
        { loginName: '', phoneNumber: '670', password: 'short' },
        true
      );

      expect(errors).toEqual({
        phoneNumber: 'invalidPhone',
        password: 'passwordTooShort',
      });
    });
  });

  describe('validateRegisterForm', () => {
    it('valide un compte individuel complet', () => {
      expect(validateRegisterForm(baseRegisterData)).toEqual({});
    });

    it('exige les champs individuels', () => {
      const errors = validateRegisterForm({
        ...baseRegisterData,
        first_name: '',
        last_name: '',
        age_group: '',
      });

      expect(errors).toEqual({
        first_name: 'required',
        last_name: 'required',
        age_group: 'required',
      });
    });

    it('exige les champs entreprise', () => {
      const errors = validateRegisterForm({
        ...baseRegisterData,
        account_type: 'company',
        first_name: '',
        last_name: '',
        age_group: '',
        business_name: '',
        legal_status: '',
        promoter_name: '',
      });

      expect(errors).toEqual({
        business_name: 'required',
        legal_status: 'required',
        promoter_name: 'required',
      });
    });

    it('valide email, telephone et confirmation de mot de passe', () => {
      const errors = validateRegisterForm({
        ...baseRegisterData,
        phone_number: '+237123',
        email: 'bad-email',
        password_confirm: 'different',
      });

      expect(errors).toMatchObject({
        phone_number: 'invalidPhone',
        email: 'invalidEmail',
        password_confirm: 'passwordMismatch',
      });
    });
  });
});
