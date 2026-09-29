import { getDashboardGreetingKey } from '../dashboardGreeting';

describe('getDashboardGreetingKey', () => {
  it.each([
    [0, 'goodEvening'],
    [4, 'goodEvening'],
    [5, 'goodMorning'],
    [11, 'goodMorning'],
    [12, 'goodAfternoon'],
    [17, 'goodAfternoon'],
    [18, 'goodEvening'],
    [23, 'goodEvening'],
  ])('returns the expected key at %i h', (hour, expectedKey) => {
    expect(getDashboardGreetingKey(hour)).toBe(expectedKey);
  });
});
