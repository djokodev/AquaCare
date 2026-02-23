import { CAMEROON_REGIONS } from './cameroon';

export interface SelectOption {
  value: string;
  label: string;
}

// Derived from CAMEROON_REGIONS — single source of truth
export const REGIONS: SelectOption[] = CAMEROON_REGIONS.map((r) => ({
  value: r.code,
  label: r.name,
}));

export const ACTIVITY_TYPES: SelectOption[] = [
  { value: 'alevins', label: "Producteur d'alevins" },
  { value: 'poisson_table', label: 'Producteur de poisson de table' },
  { value: 'mixte', label: 'Production mixte' },
  { value: 'commercant', label: 'Commercant de poisson' },
];

export const AGE_GROUPS: SelectOption[] = [
  { value: '18_25', label: '18-25 ans' },
  { value: '26_35', label: '26-35 ans' },
  { value: '36_45', label: '36-45 ans' },
  { value: '46_55', label: '46-55 ans' },
  { value: '56_65', label: '56-65 ans' },
  { value: '65_plus', label: '65 ans et plus' },
];

export const LEGAL_STATUS_OPTIONS: SelectOption[] = [
  { value: 'ei', label: 'Entreprise Individuelle (EI)' },
  { value: 'scoop', label: 'Cooperative Simplifiee (SCOOP)' },
  { value: 'coop_ca', label: 'Cooperative avec CA (Coop-CA)' },
  { value: 'sarl', label: 'SARL' },
  { value: 'sarlu', label: 'SARL Unipersonnelle (SARLU)' },
  { value: 'sa', label: 'Societe Anonyme (SA)' },
  { value: 'sas', label: 'SAS' },
  { value: 'sasu', label: 'SAS Unipersonnelle (SASU)' },
  { value: 'snc', label: 'Societe en Nom Collectif (SNC)' },
  { value: 'scs', label: 'Societe en Commandite Simple (SCS)' },
  { value: 'sci', label: 'Societe Civile Immobiliere (SCI)' },
  { value: 'autre', label: 'Autre statut juridique' },
];
