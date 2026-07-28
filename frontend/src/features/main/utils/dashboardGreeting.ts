export type DashboardGreetingKey =
  | 'dashboardGreetingLate'
  | 'goodMorning'
  | 'dashboardGreetingCasual'
  | 'goodAfternoon'
  | 'goodEvening';

export const getDashboardGreetingKey = (hour: number): DashboardGreetingKey => {
  if (hour >= 5 && hour < 11) return 'goodMorning';
  if (hour >= 11 && hour < 14) return 'dashboardGreetingCasual';
  if (hour >= 14 && hour < 18) return 'goodAfternoon';
  if (hour >= 18) return 'goodEvening';
  return 'dashboardGreetingLate';
};
