import { useCallback, useEffect, useState } from 'react';

import type { FarmProfile, UpdateFarmProfilePayload } from '@/features/profile/types/profile';

interface UseFarmProfileEditorOptions {
  farmProfile: FarmProfile | null;
  updateFarm: (farmData: UpdateFarmProfilePayload) => Promise<FarmProfile>;
}

export const useFarmProfileEditor = ({ farmProfile, updateFarm }: UseFarmProfileEditorOptions) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editData, setEditData] = useState<UpdateFarmProfilePayload>({});

  useEffect(() => {
    if (!farmProfile) return;

    setEditData({
      farm_name: farmProfile.farm_name || '',
      total_ponds: farmProfile.total_ponds || 0,
      total_area_m2: farmProfile.total_area_m2 || 0,
      water_source: farmProfile.water_source || '',
      main_species: farmProfile.main_species || '',
      annual_production_kg: farmProfile.annual_production_kg || 0,
      latitude: farmProfile.latitude ?? null,
      longitude: farmProfile.longitude ?? null,
      location_address: farmProfile.location_address || '',
    });
  }, [farmProfile]);

  const updateEditField = useCallback(
    <K extends keyof UpdateFarmProfilePayload>(field: K, value: UpdateFarmProfilePayload[K]) => {
      setEditData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const save = useCallback(async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      await updateFarm(editData);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }, [editData, isSaving, updateFarm]);

  const saveLocation = useCallback(
    async (location: Pick<UpdateFarmProfilePayload, 'latitude' | 'longitude' | 'location_address'>) => {
      if (isSaving) return;

      setIsSaving(true);
      setEditData((prev) => ({ ...prev, ...location }));
      try {
        await updateFarm(location);
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, updateFarm]
  );

  return {
    isEditing,
    setIsEditing,
    isSaving,
    editData,
    updateEditField,
    save,
    saveLocation,
  };
};
