import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAccounts } from '../hooks/useAccounts';
import IncomeForm from '../components/IncomeForm';
import VoidDialog from '../components/VoidDialog';
import Field from '../components/Field';
import { viewReceipt } from '../utils/receipt';
import { formatDate } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { accountLabel } from '../utils/labels';

const METHOD = { transfer: 'Bank transfer', pos: 'POS' };

export default function Income() {
  const { accounts, error: accountsError } = useAccounts();
  const [filters, setFilters] = useState({ from: '', to: '', status: 'all' });
  const [data, setData] = useState({ items: [], total: 0 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [voidId, setVoidId] = useState(null);

  const load = useCallback(() => {
    api.get('/incomes', filters).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [filters]);
  useEffect(load, [load]);

  const record = async (payload) => {
    const win = window.open('', '_blank');
    let income;
    try {
      income = await api.post('/incomes', payload);
    } catch (err) {
      if (win) win.close();
      throw err;
    }
    setNotice(income);
    load();
    viewReceipt(income._id, win).catch((e) => setError(e.message));
  };

  const confirmVoid = async (reason) => {
    await api.post(`/incomes/${voidId}/void`, { reason });
    setVoidId(null);
    load();
  };
  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <>
      <h2>Income</h2>
      <IncomeForm accounts={accounts} onSubmit={record} />
      {notice && (
        <div className="notice">
          Recorded <b>{notice.receiptNumber}</b>.{' '}
          <button className="secondary" onClick={() => viewReceipt(notice._id).catch((e) => setError(e.message))}>View / print receipt</button>
        </div>
      )}
      <div className="card grid">
        <Field label="From"><input type="date" value={filters.from} onChange={setFilter('from')} /></Field>
        <Field label="To"><input type="date" value={filters.to} onChange={setFilter('to')} /></Field>
        <Field label="Status">
          <select value={filters.status} onChange={setFilter('status')}>
            <option value="all">All</option><option value="active">Active</option><option value="voided">Void</option>
          </select>
        </Field>
      </div>
      {(error || accountsError) && <p className="error" role="alert">{error || accountsError}</p>}
      <div className="card">
        <table>
          <thead>
            <tr><th>Date</th><th>Receipt</th><th>Method</th><th>Account</th><th className="num">Amount</th><th>Recorded by</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={i._id} className={i.voided ? 'void' : ''}>
                <td>{formatDate(i.date)}</td>
                <td>{i.receiptNumber}</td>
                <td>{METHOD[i.method]}</td>
                <td>{accountLabel(i.account)}</td>
                <td className="num">{formatNaira(i.amount)}</td>
                <td>{i.recordedBy && i.recordedBy.name}</td>
                <td className="keep">{i.voided ? `Void: ${i.voidReason}` : 'Active'}</td>
                <td className="keep row">
                  <button className="secondary" onClick={() => viewReceipt(i._id).catch((e) => setError(e.message))}>Receipt</button>
                  {!i.voided && <button className="danger" onClick={() => setVoidId(i._id)}>Void</button>}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={8}>No income recorded for these filters.</td></tr>}
          </tbody>
        </table>
        <p>{data.total} entries</p>
      </div>
      {voidId && <VoidDialog title="Void this income entry?" onConfirm={confirmVoid} onCancel={() => setVoidId(null)} />}
    </>
  );
}
