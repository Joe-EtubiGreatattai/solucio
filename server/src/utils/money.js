const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function below1000(n) {
  const parts = [];
  if (n >= 100) {
    parts.push(`${SMALL[Math.floor(n / 100)]} hundred`);
    n %= 100;
    if (n) parts.push('and');
  }
  if (n >= 20) parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${SMALL[n % 10]}` : ''));
  else if (n > 0 || parts.length === 0) parts.push(SMALL[n]);
  return parts.join(' ');
}

function words(n) {
  if (n === 0) return 'zero';
  const parts = [];
  for (const [size, label] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) {
    if (n >= size) {
      parts.push(`${below1000(Math.floor(n / size))} ${label}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(n < 100 && parts.length ? `and ${below1000(n)}` : below1000(n));
  return parts.join(' ');
}

function amountInWords(kobo) {
  const naira = Math.floor(kobo / 100);
  const k = kobo % 100;
  const segments = [];
  if (naira > 0) segments.push(`${words(naira)} naira`);
  if (k > 0) segments.push(`${words(k)} kobo`);
  const s = `${segments.join(' and ')} only`;
  return s[0].toUpperCase() + s.slice(1);
}

const formatMoney = (kobo) =>
  (kobo / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatNgn = (kobo) => `NGN ${formatMoney(kobo)}`;

module.exports = { amountInWords, formatMoney, formatNgn };
