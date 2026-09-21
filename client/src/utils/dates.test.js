import { lagosToday, rangeFor, formatDate } from './dates';

test('lagosToday uses Lagos time', () => {
  expect(lagosToday(Date.parse('2026-09-20T23:30:00Z'))).toBe('2026-09-21');
});
test('rangeFor presets', () => {
  expect(rangeFor('today', '2026-09-23')).toEqual({ from: '2026-09-23', to: '2026-09-23' });
  expect(rangeFor('week', '2026-09-23')).toEqual({ from: '2026-09-21', to: '2026-09-23' }); // Monday start
  expect(rangeFor('week', '2026-09-27')).toEqual({ from: '2026-09-21', to: '2026-09-27' }); // Sunday
  expect(rangeFor('month', '2026-09-23')).toEqual({ from: '2026-09-01', to: '2026-09-23' });
});
test('formatDate is day-first in Lagos time', () => {
  expect(formatDate('2026-09-20T23:00:00.000Z')).toBe('21/09/2026');
});
