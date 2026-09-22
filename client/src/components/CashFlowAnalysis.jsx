import { useEffect, useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { useLiveRefresh } from '../realtime/RealtimeProvider';
import { formatNaira } from '../utils/money';
import { Skeleton } from './Skeleton';

const METHOD_LABEL = { transfer: 'Transfer', pos: 'POS' };

function ChangeBadge({ percent }) {
  if (percent === null || percent === undefined) return <span className="change-badge neutral">New</span>;
  if (percent === 0) return <span className="change-badge neutral">No change</span>;
  const up = percent > 0;
  return <span className={`change-badge ${up ? 'up' : 'down'}`}>{up ? '+' : ''}{percent}%</span>;
}

function burnMessage({ avgDailyNet, runwayDays }) {
  if (runwayDays === null || runwayDays === undefined) {
    return { tone: 'positive', text: avgDailyNet > 0 ? 'Cash flow positive — building a buffer at this rate.' : 'Cash flow is flat.' };
  }
  if (runwayDays === 0) return { tone: 'urgent', text: 'No cash buffer left — spending exceeds cash on hand right now.' };
  if (runwayDays <= 14) return { tone: 'urgent', text: `Only about ${runwayDays} days of cash left at this rate. Act now.` };
  if (runwayDays <= 45) return { tone: 'warning', text: `About ${runwayDays} days of cash left if this rate continues.` };
  return { tone: 'warning', text: `About ${runwayDays} days of cash left at this rate — worth watching.` };
}

const bucketLabel = (date, bucket) => {
  if (bucket === 'month') {
    const [y, m] = date.split('-');
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
};

export default function CashFlowAnalysis({ range }) {
  const live = useLiveRefresh(['reports']);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!range.from || !range.to) return undefined;
    let ignore = false;
    api.get('/reports/cash-flow', range)
      .then((next) => { if (!ignore) { setData(next); setError(''); } })
      .catch((e) => { if (!ignore) setError(e.message); });
    return () => { ignore = true; };
  }, [range, live]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <div className="card cash-flow-skeleton"><Skeleton /><Skeleton /><Skeleton /></div>;

  const { totals, previous, change, burnRate, topOutflows, incomeByMethod, series, bucket } = data;
  const burn = burnMessage(burnRate);
  const chartData = series.map((s) => ({ ...s, label: bucketLabel(s.date, bucket) }));
  const topOutflow = topOutflows[0];

  return (
    <section className="cash-flow-tool card" aria-labelledby="cash-flow-title">
      <div className="comparison-head">
        <div>
          <p className="section-eyebrow">CASH FLOW ANALYSIS</p>
          <h2 id="cash-flow-title">Cash flow, in detail</h2>
          <p>Compared with the {bucket === 'day' ? 'same number of days' : `previous ${bucket === 'week' ? 'weeks' : 'months'}`} right before this period.</p>
        </div>
        <span className={`cash-health ${totals.net >= 0 ? 'positive' : 'negative'}`}>{totals.net >= 0 ? 'Cash positive' : 'Spending exceeds income'}</span>
      </div>

      <div className="cash-flow-kpis">
        <div>
          <span>Income</span>
          <b className="income">{formatNaira(totals.income)}</b>
          <div className="kpi-foot"><ChangeBadge percent={change.income} /><small>was {formatNaira(previous.income)}</small></div>
        </div>
        <div>
          <span>Expenses</span>
          <b className="expense">{formatNaira(totals.expenses)}</b>
          <div className="kpi-foot"><ChangeBadge percent={change.expenses} /><small>was {formatNaira(previous.expenses)}</small></div>
        </div>
        <div>
          <span>Net cash flow</span>
          <b className={totals.net >= 0 ? 'income' : 'expense'}>{formatNaira(totals.net)}</b>
          <div className="kpi-foot"><ChangeBadge percent={change.net} /><small>was {formatNaira(previous.net)}</small></div>
        </div>
        <div>
          <span>Cash on hand</span>
          <b>{formatNaira(totals.cashOnHand)}</b>
          <div className="kpi-foot"><small>across all accounts, as of the end of this period</small></div>
        </div>
      </div>

      {chartData.length > 1 && (
        <div className="cash-flow-chart">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="flow" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={0} />
              <YAxis yAxisId="cash" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={0} />
              <Tooltip formatter={(value, name) => [formatNaira(value), name]} labelFormatter={(l) => l} />
              <Bar yAxisId="flow" dataKey="income" name="Income" fill="#2d8a59" radius={[3, 3, 0, 0]} barSize={14} />
              <Bar yAxisId="flow" dataKey="expenses" name="Expenses" fill="#c95a63" radius={[3, 3, 0, 0]} barSize={14} />
              <Area yAxisId="cash" dataKey="cumulative" name="Cash balance" stroke="#438a61" fill="#438a61" fillOpacity={0.12} strokeWidth={2} />
              <Line yAxisId="cash" dataKey="cumulative" name="Cash balance" stroke="#438a61" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className={`burn-rate-card ${burn.tone}`}>
        <span>Burn rate</span>
        <p>{burn.text}</p>
        <small>Average {formatNaira(Math.abs(burnRate.avgDailyNet))} {burnRate.avgDailyNet >= 0 ? 'gained' : 'spent'} per day this period.</small>
      </div>

      <div className="cash-flow-detail-grid">
        <div className="cash-flow-detail">
          <h3>Where the money went</h3>
          {topOutflows.length === 0 ? (
            <p className="muted">No expenses recorded in this period.</p>
          ) : (
            <>
              <p className="actionable-line">
                <strong>{topOutflow.group}</strong> is your largest expense, at <strong>{topOutflow.percent}%</strong> of spending ({formatNaira(topOutflow.total)}).
              </p>
              <ul className="outflow-list">
                {topOutflows.map((o) => (
                  <li key={`${o.type}-${o.group}`}>
                    <span className="outflow-bar" style={{ width: `${o.percent}%` }} aria-hidden="true" />
                    <span className="outflow-name">{o.group}</span>
                    <span className="outflow-value">{formatNaira(o.total)} <small>{o.percent}%</small></span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="cash-flow-detail">
          <h3>How income arrived</h3>
          {incomeByMethod.length === 0 ? (
            <p className="muted">No income recorded in this period.</p>
          ) : (
            <ul className="outflow-list">
              {incomeByMethod.map((m) => (
                <li key={m.method}>
                  <span className="outflow-bar method" style={{ width: `${m.percent}%` }} aria-hidden="true" />
                  <span className="outflow-name">{METHOD_LABEL[m.method] || m.method}</span>
                  <span className="outflow-value">{formatNaira(m.total)} <small>{m.percent}%</small></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
