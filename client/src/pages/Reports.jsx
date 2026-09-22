import { useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { api } from '../api';
import { useLiveRefresh } from '../realtime/RealtimeProvider';
import { useAuth } from '../auth/AuthContext';
import DateRange from '../components/DateRange';
import Field from '../components/Field';
import { rangeFor } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { downloadBlob } from '../utils/download';
import { Skeleton } from '../components/Skeleton';
import { useStoredState } from '../hooks/useStoredState';
import IncomeExpenseAnalysis from '../components/IncomeExpenseAnalysis';

export default function Reports() {
  const live = useLiveRefresh(['reports']);
  const { can } = useAuth();
  const [range, setRange] = useStoredState('solucio:report-range', rangeFor('month'));
  const [report, setReport] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [exportType, setExportType] = useState('summary');
  const [format, setFormat] = useState('xlsx');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!range.from || !range.to) return;
    let ignore = false;
    Promise.all([api.get('/reports/spending-by-category', range), api.get('/reports/summary', range)])
      .then(([spending, nextSummary]) => { if (!ignore) { setReport(spending); setSummary(nextSummary); setError(''); } })
      .catch((e) => { if (!ignore) setError(e.message); });
    return () => { ignore = true; };
  }, [range, live]);

  const chart = report ? report.types.flatMap((t) => t.groups.map((g) => ({ name: `${t.type}: ${g.group}`, amount: g.total, percent: g.percent }))) : [];
  const colours = ['#8964ee', '#b29af7', '#64c7ad', '#f2ad6e', '#ee7f98', '#6a91d9', '#d6c6fa'];

  const exportFile = async () => {
    setBusy(true);
    try {
      const blob = await api.blob('/reports/export', { type: exportType, format, ...range });
      downloadBlob(blob, `solucio-${exportType}-${range.from}_to_${range.to}.${format}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-title-row">
        <h1>Reports</h1>
        <span className="page-hint">{range.from} to {range.to}</span>
      </div>
      <details className="workspace-disclosure workspace-disclosure-compact">
        <summary>Change report period</summary>
        <DateRange value={range} onChange={setRange} />
      </details>
      {error && <p className="error" role="alert">{error}</p>}

      {can('reports.export') && (
        <details className="workspace-disclosure workspace-disclosure-compact">
          <summary>Export report</summary>
          <div className="card row export-controls">
          <Field label="Export">
            <select value={exportType} onChange={(e) => setExportType(e.target.value)}>
              <option value="summary">Summary</option><option value="income">Income</option><option value="expenses">Expenses</option>
            </select>
          </Field>
          <Field label="Format">
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="xlsx">Excel</option><option value="pdf">PDF</option>
            </select>
          </Field>
          <button onClick={exportFile} disabled={busy}>{busy ? 'Preparing…' : 'Download'}</button>
          </div>
        </details>
      )}

      <IncomeExpenseAnalysis summary={summary} />

      <h2>Spending by category</h2>
      {!report && !error && <div className="card report-skeleton"><Skeleton /><Skeleton /><Skeleton /></div>}
      {report && report.grandTotal === 0 && <p>No spending in this period.</p>}
      {report && report.grandTotal > 0 && (
        <div className="card spending-visual">
          <div className="pie-wrap">
            <ResponsiveContainer width="100%" height={330}>
              <PieChart>
                <Pie data={chart} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={78} outerRadius={118} paddingAngle={3} stroke="none">
                  {chart.map((entry, index) => <Cell key={entry.name} fill={colours[index % colours.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => formatNaira(value)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pie-total"><span>Total spending</span><b>{formatNaira(report.grandTotal)}</b></div>
          </div>
          <div className="pie-legend" aria-label="Spending breakdown">
            {chart.map((item, index) => (
              <div className="pie-legend-item" key={item.name}>
                <span className="legend-dot" style={{ background: colours[index % colours.length] }} aria-hidden="true" />
                <span className="legend-name">{item.name}</span>
                <span className="legend-value"><b>{formatNaira(item.amount)}</b><small>{item.percent}% of spending</small></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
