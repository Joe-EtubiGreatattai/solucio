import { nairaToKobo, koboToNaira, formatNaira } from './money';

test('nairaToKobo parses valid amounts', () => {
  expect(nairaToKobo('1,500.50')).toBe(150050);
  expect(nairaToKobo('1500')).toBe(150000);
  expect(nairaToKobo('0.5')).toBe(50);
  expect(nairaToKobo(' 20 ')).toBe(2000);
});
test('nairaToKobo rejects invalid input', () => {
  for (const bad of ['', 'abc', '10.999', '-5', '1.2.3']) expect(nairaToKobo(bad)).toBeNull();
});
test('koboToNaira and formatNaira', () => {
  expect(koboToNaira(150050)).toBe('1500.50');
  expect(formatNaira(150050)).toBe('₦1,500.50');
});
