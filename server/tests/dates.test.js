const { parseLagosDate, dayAfter, lagosToday, isFuture, formatLagosDate } = require('../src/utils/dates');

test('parseLagosDate returns Lagos midnight as a UTC instant', () => {
  expect(parseLagosDate('2026-09-21').toISOString()).toBe('2026-09-20T23:00:00.000Z');
});

test('parseLagosDate rejects bad dates', () => {
  expect(() => parseLagosDate('2026-02-30')).toThrow();
  expect(() => parseLagosDate('21/09/2026')).toThrow();
});

test('dayAfter adds 24 hours', () => {
  expect(dayAfter(parseLagosDate('2026-09-21')).toISOString()).toBe('2026-09-21T23:00:00.000Z');
});

test('lagosToday uses the Lagos day near UTC midnight', () => {
  expect(lagosToday(Date.parse('2026-09-20T23:30:00Z'))).toBe('2026-09-21');
  expect(lagosToday(Date.parse('2026-09-20T22:30:00Z'))).toBe('2026-09-20');
});

test('isFuture compares against the Lagos day', () => {
  const now = Date.parse('2026-09-20T23:30:00Z'); // Lagos: 21 Sep
  expect(isFuture('2026-09-21', now)).toBe(false);
  expect(isFuture('2026-09-22', now)).toBe(true);
});

test('formatLagosDate is day-first in Lagos time', () => {
  expect(formatLagosDate(new Date('2026-09-20T23:00:00Z'))).toBe('21/09/2026');
});
