import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import DateRange from '../components/DateRange';
import TableWrap from '../components/TableWrap';
import { rangeFor } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { accountLabel } from '../utils/labels';
import { DashboardSkeleton, TableSkeleton } from '../components/Skeleton';
import { useStoredState } from '../hooks/useStoredState';

export default function Dashboard() {
  const { can } = useAuth();
  const [range, setRange] = useStoredState('solucio:dashboard-range', rangeFor('month'));
  const [summary, setSummary] = useState(null);
  const [balances, setBalances] = useState(null);
  const [error, setError] = useState('');
  const attention = balances?.accounts.filter((account) => account.balance < 0) || [];

  useEffect(() => {
    if (!range.from || !range.to) return;
    let ignore = false;
    api.get('/reports/summary', range).then((s) => { if (!ignore) { setSummary(s); setError(''); } }).catch((e) => { if (!ignore) setError(e.message); });
    return () => { ignore = true; };
  }, [range]);
  useEffect(() => {
    api.get('/reports/account-balances').then(setBalances).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-title-row">
        <h1>Dashboard</h1>
        <span className="page-hint">{range.from} to {range.to}</span>
      </div>
      <details className="workspace-disclosure workspace-disclosure-compact">
        <summary>Change dashboard period</summary>
        <DateRange value={range} onChange={setRange} />
      </details>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="action-center" aria-label="Quick actions">
        <div><p className="section-eyebrow">START HERE</p><h2>What do you need to do?</h2></div>
        <div className="quick-actions">
          {can('income.record') && <NavLink to="/income" className="quick-action"><span>↑</span><b>Record income</b><small>Capture a payment</small></NavLink>}
          {can('expenses.record') && <NavLink to="/expenses" className="quick-action"><span>↓</span><b>Record expense</b><small>Log money out</small></NavLink>}
          {can('statements.import') && <NavLink to="/statements" className="quick-action"><span>⌁</span><b>Import statement</b><small>Review bank activity</small></NavLink>}
          {can('reports.view') && <NavLink to="/reports" className="quick-action"><span>↗</span><b>View reports</b><small>Understand performance</small></NavLink>}
        </div>
      </section>
      {attention.length > 0 && <section className="attention-card" role="status"><b>{attention.length} account{attention.length === 1 ? '' : 's'} need attention</b><span>{attention.map((account) => accountLabel(account)).join(', ')} {attention.length === 1 ? 'is' : 'are'} below zero.</span></section>}
      {summary && (
        <div className="cards">
          <div className="card stat">Income ({summary.income.count})<b>{formatNaira(summary.income.total)}</b></div>
          <div className="card stat">Spending ({summary.spending.count})<b>{formatNaira(summary.spending.total)}</b></div>
          <div className="card stat">Net<b>{formatNaira(summary.net)}</b></div>
        </div>
      )}
      {!summary && <DashboardSkeleton />}
      <h2>Balance per account</h2>
      {balances ? (
        <div className="card">
          <TableWrap label="Balance per account">
          <table>
            <thead><tr><th>Account</th><th className="num">Opening</th><th className="num">In</th><th className="num">Out</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {balances.accounts.map((a) => (
                <tr key={a.accountId}>
                  <td>{accountLabel(a)}{!a.active && ' (inactive)'}</td>
                  <td className="num">{formatNaira(a.openingBalance)}</td>
                  <td className="num">{formatNaira(a.totalIn)}</td>
                  <td className="num">{formatNaira(a.totalOut)}</td>
                  <td className="num"><b>{formatNaira(a.balance)}</b>{a.balance < 0 && <span className="flag"> Overdrawn</span>}</td>
                </tr>
              ))}
              <tr><td colSpan={4}><b>All accounts</b></td><td className="num"><b>{formatNaira(balances.grandTotal)}</b></td></tr>
            </tbody>
          </table>
          </TableWrap>
        </div>
      ) : <div className="card"><table><TableSkeleton columns={5} label="Loading account balances…" /></table></div>}
    </>
  );
}
