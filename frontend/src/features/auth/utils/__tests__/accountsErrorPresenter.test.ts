import { getAccountErrorMessage } from '../accountsErrorPresenter';

const translations: Record<string, string> = {
  AUTH_NETWORK_ERROR: 'Connexion impossible.',
  AUTH_UNKNOWN_ERROR: 'Erreur inattendue.',
  UNKNOWN_ERROR: 'Erreur inattendue.',
  accountsErrorGeneric: 'Erreur générique.',
};

const t = (key: string, options?: Record<string, unknown>) => {
  return translations[key] ?? String(options?.defaultValue ?? key);
};

describe('getAccountErrorMessage', () => {
  it('traduit les codes erreur connus', () => {
    expect(getAccountErrorMessage('AUTH_NETWORK_ERROR', t)).toBe('Connexion impossible.');
  });

  it('masque les payloads techniques JSON', () => {
    expect(getAccountErrorMessage('{"field":["invalid"]}', t)).toBe('Erreur générique.');
  });

  it('masque les erreurs HTTP techniques', () => {
    expect(getAccountErrorMessage('HTTP_502', t)).toBe('Erreur générique.');
  });

  it('normalise les erreurs reseau et timeout', () => {
    expect(getAccountErrorMessage('Network Error', t)).toBe('Connexion impossible.');
    expect(getAccountErrorMessage('timeout of 10000ms exceeded', t)).toBe('Connexion impossible.');
  });

  it('conserve les messages backend lisibles', () => {
    expect(getAccountErrorMessage(new Error('Le nom de la ferme ne peut pas être vide.'), t)).toBe(
      'Le nom de la ferme ne peut pas être vide.'
    );
  });
});
