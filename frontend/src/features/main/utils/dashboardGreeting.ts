export type DashboardGreetingKey = 'goodMorning' | 'goodAfternoon' | 'goodEvening';

/** Salutation du tableau de bord selon l'heure locale de l'appareil. */
export const getDashboardGreetingKey = (hour: number): DashboardGreetingKey => {
  if (hour >= 5 && hour < 12) return 'goodMorning';
  if (hour >= 12 && hour < 18) return 'goodAfternoon';
  return 'goodEvening';
};
