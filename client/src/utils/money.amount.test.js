import { formatAmountInput, nairaToKobo } from './money';

test('formats whole numbers with thousands separators', () => {
  expect(formatAmountInput('1500')).toBe('1,500');
  expect(formatAmountInput('1234567')).toBe('1,234,567');
  expect(formatAmountInput('100')).toBe('100');
});
test('keeps a single dot and at most two decimals', () => {
  expect(formatAmountInput('1500.5')).toBe('1,500.5');
  expect(formatAmountInput('1500.509')).toBe('1,500.50');
  expect(formatAmountInput('1500.')).toBe('1,500.');
  expect(formatAmountInput('1.2.3')).toBe('1.23');
});
test('tolerates commas already present and leading junk', () => {
  expect(formatAmountInput('1,234,567.89')).toBe('1,234,567.89');
  expect(formatAmountInput('1a2b3')).toBe('123');
  expect(formatAmountInput('007')).toBe('7');
});
test('handles the empty and decimal-only cases', () => {
  expect(formatAmountInput('')).toBe('');
  expect(formatAmountInput('abc')).toBe('');
  expect(formatAmountInput('.')).toBe('0.');
  expect(formatAmountInput('.5')).toBe('0.5');
});
test('its output still parses back to kobo', () => {
  expect(nairaToKobo(formatAmountInput('1234567.5'))).toBe(123456750);
});
