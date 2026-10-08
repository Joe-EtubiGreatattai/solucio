export function nairaToKobo(input) {
  const s = String(input).replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [n, k = ''] = s.split('.');
  return parseInt(n, 10) * 100 + parseInt(k.padEnd(2, '0'), 10);
}
export const koboToNaira = (kobo) => (kobo / 100).toFixed(2);
export const formatNaira = (kobo) =>
  (kobo < 0 ? '-' : '') + '₦' + (Math.abs(kobo) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Turns whatever is typed into a tidy amount string with thousands separators, one dot and at most two
// decimals (e.g. "1234567.5" -> "1,234,567.5"). nairaToKobo strips the commas again on submit.
export function formatAmountInput(raw) {
  let s = String(raw ?? '').replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  if (s === '') return '';
  const [intPart, decPart] = s.split('.');
  const intFmt = intPart === '' ? '' : Number(intPart).toLocaleString('en-US');
  if (s.includes('.')) return `${intFmt || '0'}.${(decPart || '').slice(0, 2)}`;
  return intFmt;
}
