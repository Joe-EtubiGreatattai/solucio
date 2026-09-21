import { useEffect, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import DateRange from '../components/DateRange';
import Field from '../components/Field';
import { rangeFor } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { downloadBlob } from '../utils/download';

export default function Reports() {
  const [range, setRange] = useState(rangeFor('month'));
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [exportType, setExportType] = useState('summary');
  const [format, setFormat] = useState('xlsx');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!range.from || !range.to) return;
    api.get('/reports/spending-by-category', range).then((r) => { setReport(r); setError(''); }).catch((e) => setError(e.message));
  }, [range]);

  const chart = report ? report.types.flatMap((t) => t.groups.map((g) => ({ name: `${t.type}: ${g.group}`, naira: g.total / 100 }))) : [];

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
      <h2>Reports</h2>
      <DateRange value={range} onChange={setRange} />
      {error && <p className="error" role="alert">{error}</p>}

      <div className="card row">
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

      <h3>Spending by category</h3>
      {report && report.grandTotal === 0 && <p>No spending in this period.</p>}
      {report && report.grandTotal > 0 && (
        <>
          <div className="card">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chart}>
                <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip formatter={(v) => formatNaira(v * 100)} />
                <Bar dataKey="naira" fill="#1f6f8b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <table>
              <thead><tr><th>Category</th><th className="num">Amount</th><th className="num">% of spending</th></tr></thead>
              <tbody>
                {report.types.map((t) => [
                  <tr key={t.type}><td><b>{t.type}</b></td><td className="num"><b>{formatNaira(t.total)}</b></td><td className="num">{t.percent}%</td></tr>,
                  ...t.groups.flatMap((g) => [
                    <tr key={`${t.type}|${g.group}`}><td style={{ paddingLeft: 24 }}>{g.group}</td><td className="num">{formatNaira(g.total)}</td><td className="num">{g.percent}%</td></tr>,
                    ...g.items.map((i) => (
                      <tr key={`${t.type}|${g.group}|${i.item}`}><td style={{ paddingLeft: 48 }}>{i.item}</td><td className="num">{formatNaira(i.total)}</td><td className="num">{i.percent}%</td></tr>
                    )),
                  ]),
                ])}
                <tr><td><b>Total</b></td><td className="num"><b>{formatNaira(report.grandTotal)}</b></td><td /></tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
