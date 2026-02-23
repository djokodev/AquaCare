import {
  parseApiError,
  formatErrorForDisplay,
  logApiError,
  hasFieldError,
  getFieldErrorMessage,
} from '../errorParser';
import logger from '../logger';

jest.mock('../logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('utils/errorParser', () => {
  const mockLogger = logger as jest.Mocked<typeof logger>;
  const originalDev = (global as any).__DEV__;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    (global as any).__DEV__ = originalDev;
  });

  it('parseApiError gere une erreur reseau sans response', () => {
    const parsed = parseApiError({ message: 'Network Error' });

    expect(parsed.status).toBe(0);
    expect(parsed.message).toContain('connexion');
    expect(parsed.details).toEqual([]);
  });

  it('parseApiError parse les details de validation 400 (array + string)', () => {
    const parsed = parseApiError({
      response: {
        status: 400,
        data: {
          initial_count: ['Trop élevé'],
          non_field_errors: 'Erreur générale',
        },
      },
    });

    expect(parsed.status).toBe(400);
    expect(parsed.message).toBe('Erreur de validation des données');
    expect(parsed.details).toEqual([
      { field: 'initial_count', messages: ['Trop élevé'] },
      { field: 'non_field_errors', messages: ['Erreur générale'] },
    ]);
  });

  it('parseApiError couvre les statuts 401/403/404/500+/default', () => {
    expect(parseApiError({ response: { status: 401, data: {} } }).message).toContain('Session expirée');
    expect(parseApiError({ response: { status: 403, data: {} } }).message).toContain('permissions');
    expect(parseApiError({ response: { status: 404, data: {} } }).message).toContain('Ressource non trouvée');
    expect(parseApiError({ response: { status: 503, data: {} } }).message).toContain('Erreur serveur');

    const defaultError = parseApiError({ response: { status: 418, data: { detail: 'Teapot' } } });
    expect(defaultError.message).toBe('Teapot');
  });

  it('formatErrorForDisplay formate avec labels lisibles et fallback', () => {
    const formatted = formatErrorForDisplay({
      status: 400,
      message: 'Erreur de validation des données',
      details: [
        { field: 'initial_count', messages: ['Invalide'] },
        { field: 'unknown_field', messages: ['X'] },
      ],
      rawError: {},
    });

    expect(formatted).toContain('Nombre initial de poissons');
    expect(formatted).toContain('unknown field');

    const plain = formatErrorForDisplay({
      status: 500,
      message: 'Erreur serveur',
      details: [],
      rawError: {},
    });
    expect(plain).toBe('Erreur serveur');
  });

  it('hasFieldError et getFieldErrorMessage trouvent les champs attendus', () => {
    const parsed = {
      status: 400,
      message: 'Erreur',
      details: [
        { field: 'initial_count', messages: ['Trop élevé'] },
        { field: 'event_type', messages: ['Requis'] },
      ],
      rawError: {},
    };

    expect(hasFieldError(parsed, 'initial_count')).toBe(true);
    expect(hasFieldError(parsed, 'notes')).toBe(false);

    expect(getFieldErrorMessage(parsed, 'event_type')).toBe('Requis');
    expect(getFieldErrorMessage(parsed, 'notes')).toBeUndefined();
  });

  it('logApiError log en mode dev avec details', () => {
    (global as any).__DEV__ = true;

    logApiError(
      {
        response: {
          status: 400,
          data: { initial_count: ['Densité trop élevée'] },
        },
      },
      'Création cycle'
    );

    expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('API Error - Création cycle'));
    expect(mockLogger.log).toHaveBeenCalledWith('Status:', 400);
    expect(mockLogger.log).toHaveBeenCalledWith('Validation Errors:');
  });

  it('logApiError ne log pas hors mode dev', () => {
    (global as any).__DEV__ = false;

    logApiError({ response: { status: 500, data: {} } }, 'Test');

    expect(mockLogger.log).not.toHaveBeenCalled();
  });
});
