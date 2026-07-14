import { getDashboardGreetingKey } from '../dashboardGreeting';

describe('getDashboardGreetingKey', () => {
  it.each([
    [0, 'dashboardGreetingLate'],
    [4, 'dashboardGreetingLate'],
    [5, 'goodMorning'],
    [10, 'goodMorning'],
    [11, 'dashboardGreetingCasual'],
    [13, 'dashboardGreetingCasual'],
    [14, 'goodAfternoon'],
    [17, 'goodAfternoon'],
    [18, 'goodEvening'],
    [23, 'goodEvening'],
  ] as const)('retourne le message adapté à %dh', (hour, expectedKey) => {
    expect(getDashboardGreetingKey(hour)).toBe(expectedKey);
  });
});
