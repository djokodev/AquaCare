import type { TFunction } from 'i18next';
import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

import { AQUACARE_COLORS } from '@/constants/colors';
import type { FarmProfile } from '@/features/profile/types/profile';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface CertificationPresentation {
  color: string;
  icon: IoniconName;
  text: string;
}

export const formatFarmName = (farmName?: string): string => {
  if (!farmName) return '';
  if (farmName.startsWith('Ferme de ') && farmName.includes(' ')) {
    const parts = farmName.replace('Ferme de ', '').split(' ');
    if (parts.length > 1) return `Ferme de ${parts[parts.length - 1]}`;
  }
  return farmName;
};

export const getCertificationPresentation = (
  farmProfile: Pick<FarmProfile, 'certification_status'> | null | undefined,
  t: TFunction
): CertificationPresentation => {
  switch (farmProfile?.certification_status) {
    case 'certified':
      return {
        color: AQUACARE_COLORS.GREEN_PRIMARY,
        icon: 'checkmark-circle',
        text: t('farmCertified'),
      };
    case 'pending':
      return {
        color: AQUACARE_COLORS.WARNING,
        icon: 'time',
        text: t('certificationPending'),
      };
    case 'suspended':
      return {
        color: AQUACARE_COLORS.ERROR,
        icon: 'pause-circle',
        text: t('certificationSuspended'),
      };
    case 'rejected':
      return {
        color: AQUACARE_COLORS.GRAY_LIGHT,
        icon: 'close-circle',
        text: t('certificationRejected'),
      };
    default:
      return {
        color: AQUACARE_COLORS.GRAY_LIGHT,
        icon: 'help-circle',
        text: farmProfile ? t('statusUnknown') : t('noFarmProfile'),
      };
  }
};
