import { useCallback, useEffect, useState } from 'react';

import type { User } from '@/features/auth/types/auth';
import type { UpdateUserProfilePayload } from '@/features/profile/types/profile';

export interface ProfileLocationData {
  region?: string;
  department?: string;
  arrondissement?: string;
  city?: string;
  neighborhood?: string;
}

interface UseProfileEditorOptions {
  user: User | null;
  updateProfile: (profileData: UpdateUserProfilePayload) => Promise<User>;
}

export const useProfileEditor = ({ user, updateProfile }: UseProfileEditorOptions) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editData, setEditData] = useState<UpdateUserProfilePayload>({});
  const [locationData, setLocationData] = useState<ProfileLocationData>({});

  useEffect(() => {
    if (!user) return;

    setEditData({
      email: user.email || '',
      intervention_zone: user.intervention_zone || '',
      legal_status: user.legal_status || '',
      promoter_name: user.promoter_name || '',
    });
    setLocationData({
      region: user.region || '',
      department: user.department || '',
      arrondissement: user.district || '',
      city: user.city || '',
      neighborhood: user.neighborhood || '',
    });
  }, [user]);

  const updateEditField = useCallback(
    <K extends keyof UpdateUserProfilePayload>(field: K, value: UpdateUserProfilePayload[K]) => {
      setEditData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const save = useCallback(async () => {
    if (isSaving) return;

    const payload: UpdateUserProfilePayload = {
      ...editData,
      region: locationData.region,
      department: locationData.department,
      district: locationData.arrondissement,
      city: locationData.city,
      neighborhood: locationData.neighborhood,
    };

    setIsSaving(true);
    try {
      await updateProfile(payload);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }, [editData, isSaving, locationData, updateProfile]);

  return {
    isEditing,
    setIsEditing,
    isSaving,
    editData,
    updateEditField,
    locationData,
    setLocationData,
    save,
  };
};
