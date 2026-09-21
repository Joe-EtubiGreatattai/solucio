const HOUR = 3600000;

export const lagosToday = (now = Date.now()) => new Date(now + HOUR).toISOString().slice(0, 10);

export function rangeFor(preset, today = lagosToday()) {
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  if (preset === 'week') {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  throw new Error(`Unknown preset ${preset}`);
}

export function formatDate(iso) {
  const [y, m, d] = new Date(new Date(iso).getTime() + HOUR).toISOString().slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTime(iso) {
  const s = new Date(new Date(iso).getTime() + HOUR).toISOString();
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d}/${m}/${y} ${s.slice(11, 16)}`;
}
