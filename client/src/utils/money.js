export function nairaToKobo(input) {
  const s = String(input).replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [n, k = ''] = s.split('.');
  return parseInt(n, 10) * 100 + parseInt(k.padEnd(2, '0'), 10);
}
export const koboToNaira = (kobo) => (kobo / 100).toFixed(2);
export const formatNaira = (kobo) =>
  '₦' + (kobo / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
