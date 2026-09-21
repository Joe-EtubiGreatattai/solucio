import { useEffect, useState } from 'react';
import { api } from '../api';
import DateRange from '../components/DateRange';
import { rangeFor } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { accountLabel } from '../utils/labels';

export default function Dashboard() {
  const [range, setRange] = useState(rangeFor('month'));
  const [summary, setSummary] = useState(null);
  const [balances, setBalances] = useState(null);
  const [error, setError] = useState('');

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
      <h2>Dashboard</h2>
      <DateRange value={range} onChange={setRange} />
      {error && <p className="error" role="alert">{error}</p>}
      {summary && (
        <div className="cards">
          <div className="card stat">Income ({summary.income.count})<b>{formatNaira(summary.income.total)}</b></div>
          <div className="card stat">Spending ({summary.spending.count})<b>{formatNaira(summary.spending.total)}</b></div>
          <div className="card stat">Net<b>{formatNaira(summary.net)}</b></div>
        </div>
      )}
      <h3>Balance per account</h3>
      {balances && (
        <div className="card">
          <table>
            <thead><tr><th>Account</th><th className="num">Opening</th><th className="num">In</th><th className="num">Out</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {balances.accounts.map((a) => (
                <tr key={a.accountId}>
                  <td>{accountLabel(a)}{!a.active && ' (inactive)'}</td>
                  <td className="num">{formatNaira(a.openingBalance)}</td>
                  <td className="num">{formatNaira(a.totalIn)}</td>
                  <td className="num">{formatNaira(a.totalOut)}</td>
                  <td className="num"><b>{formatNaira(a.balance)}</b></td>
                </tr>
              ))}
              <tr><td colSpan={4}><b>All accounts</b></td><td className="num"><b>{formatNaira(balances.grandTotal)}</b></td></tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
