const { amountInWords, formatMoney, formatNgn } = require('../src/utils/money');

test('amountInWords', () => {
  expect(amountInWords(150000)).toBe('One thousand five hundred naira only');
  expect(amountInWords(250050)).toBe('Two thousand five hundred naira and fifty kobo only');
  expect(amountInWords(10500)).toBe('One hundred and five naira only');
  expect(amountInWords(1)).toBe('One kobo only');
  expect(amountInWords(100000100)).toBe('One million and one naira only');
  expect(amountInWords(2100)).toBe('Twenty-one naira only');
});

test('formatMoney and formatNgn', () => {
  expect(formatMoney(150050)).toBe('1,500.50');
  expect(formatNgn(100)).toBe('NGN 1.00');
});
