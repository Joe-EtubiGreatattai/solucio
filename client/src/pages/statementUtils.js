// Shared helpers for the Bank statements library and review pages.

export const confidenceLabel = (confidence) => {
  if (confidence === 'needs-review') return 'Needs review';
  return `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence`;
};

export function categoryLabel(transaction) {
  if (transaction.direction === 'income') return 'Income';
  return [transaction.type, transaction.group, transaction.item].filter(Boolean).join(' › ') || 'Uncategorized';
}

// Whether a row will be imported when the statement is approved. Missing/undefined means yes.
export const isIncluded = (transaction) => transaction.included !== false;

// Rows still needing a decision — excluded rows never block approval and never count as review.
export const unresolvedCount = (statement) =>
  (statement?.transactions || []).filter(isIncluded).filter((entry) => entry.confidence === 'needs-review').length;

// ---- Grouping statements by the months they cover ----
const LAGOS = 3600000; // UTC+1, matches utils/dates.js
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ym = (iso) => { const d = new Date(new Date(iso).getTime() + LAGOS); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; };

export const monthKey = (iso) => { const { y, m } = ym(iso); return `${y}-${String(m + 1).padStart(2, '0')}`; };
export const monthLabel = (iso) => { const { y, m } = ym(iso); return `${MONTHS[m]} ${y}`; };

// The period a statement covers: "October 2026", "Jan – Sep 2026", or "Dec 2025 – Feb 2026".
export function periodLabel(startIso, endIso) {
  if (!startIso) return null;
  const s = ym(startIso);
  const e = endIso ? ym(endIso) : s;
  if (s.y === e.y && s.m === e.m) return `${MONTHS[s.m]} ${s.y}`;
  if (s.y === e.y) return `${SHORT[s.m]} – ${SHORT[e.m]} ${s.y}`;
  return `${SHORT[s.m]} ${s.y} – ${SHORT[e.m]} ${e.y}`;
}

// Groups statements (already sorted newest-period-first) under their covered start month.
export function groupByMonth(statements) {
  const groups = [];
  for (const st of statements || []) {
    const key = st.periodStart ? monthKey(st.periodStart) : 'unknown';
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, label: st.periodStart ? monthLabel(st.periodStart) : 'Covered month unknown', items: [] }; groups.push(g); }
    g.items.push(st);
  }
  return groups;
}

// Which months between the earliest and latest covered month have NO statement at all. A statement
// counts for every month in its own start–end range, so a Jan–Sep statement fills all nine months.
export function monthCoverage(statements) {
  const covered = new Set();
  let min = null;
  let max = null;
  for (const st of statements || []) {
    if (!st.periodStart) continue;
    const s = ym(st.periodStart);
    const e = st.periodEnd ? ym(st.periodEnd) : s;
    let idx = s.y * 12 + s.m;
    const endIdx = Math.max(idx, e.y * 12 + e.m);
    for (; idx <= endIdx && idx - (s.y * 12 + s.m) < 240; idx += 1) {
      covered.add(idx);
      if (min === null || idx < min) min = idx;
      if (max === null || idx > max) max = idx;
    }
  }
  if (min === null) return { missing: [], fromLabel: null, toLabel: null };
  const labelOf = (idx) => `${MONTHS[idx % 12]} ${Math.floor(idx / 12)}`;
  const missing = [];
  for (let idx = min; idx <= max; idx += 1) if (!covered.has(idx)) missing.push(labelOf(idx));
  return { missing, fromLabel: labelOf(min), toLabel: labelOf(max) };
}
