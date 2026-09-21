const DAY_MS = 24 * 60 * 60 * 1000;
const LAGOS_OFFSET_MS = 60 * 60 * 1000; // UTC+1, no DST

function parseLagosDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) throw new Error('Invalid date');
  const [y, m, day] = str.split('-').map(Number);
  // Validate that the date is valid by checking it against a UTC parse
  const d = new Date(`${str}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  // Check if the parsed date matches the input (rejects Feb 30, etc)
  if (d.getUTCFullYear() !== y || d.getUTCMonth() + 1 !== m || d.getUTCDate() !== day) {
    throw new Error('Invalid date');
  }
  // Now create the Lagos date (UTC+1)
  return new Date(`${str}T00:00:00+01:00`);
}

const dayAfter = (d) => new Date(d.getTime() + DAY_MS);
const lagosToday = (now = Date.now()) => new Date(now + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
const isFuture = (str, now = Date.now()) => str > lagosToday(now);

function formatLagosDate(date) {
  const [y, m, d] = new Date(date.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

module.exports = { parseLagosDate, dayAfter, lagosToday, isFuture, formatLagosDate };
