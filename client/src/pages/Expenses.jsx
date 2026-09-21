import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAccounts } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';
import ExpenseForm from '../components/ExpenseForm';
import VoidDialog from '../components/VoidDialog';
import Field from '../components/Field';
import { formatDate } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { accountLabel } from '../utils/labels';

export default function Expenses() {
  const { accounts, error: accountsError } = useAccounts();
  const { categories, error: categoriesError } = useCategories();
  const [filters, setFilters] = useState({ from: '', to: '', status: 'all', type: '' });
  const [data, setData] = useState({ items: [], total: 0 });
  const [error, setError] = useState('');
  const [voidId, setVoidId] = useState(null);

  const load = useCallback(() => {
    api.get('/expenses', filters).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [filters]);
  useEffect(load, [load]);

  const record = async (payload) => {
    await api.post('/expenses', payload);
    load();
  };
  const confirmVoid = async (reason) => {
    await api.post(`/expenses/${voidId}/void`, { reason });
    setVoidId(null);
    load();
  };
  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <>
      <h2>Expenses</h2>
      <ExpenseForm accounts={accounts} categories={categories} onSubmit={record} />
      <div className="card grid">
        <Field label="From"><input type="date" value={filters.from} onChange={setFilter('from')} /></Field>
        <Field label="To"><input type="date" value={filters.to} onChange={setFilter('to')} /></Field>
        <Field label="Type">
          <select value={filters.type} onChange={setFilter('type')}>
            <option value="">All</option>
            {categories.map((c) => <option key={c.type} value={c.type}>{c.type}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={filters.status} onChange={setFilter('status')}>
            <option value="all">All</option><option value="active">Active</option><option value="voided">Void</option>
          </select>
        </Field>
      </div>
      {(error || accountsError || categoriesError) && <p className="error" role="alert">{error || accountsError || categoriesError}</p>}
      <div className="card">
        <table>
          <thead>
            <tr><th>Date</th><th>Category</th><th>Account</th><th className="num">Amount</th><th>Note</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {data.items.map((e) => (
              <tr key={e._id} className={e.voided ? 'void' : ''}>
                <td>{formatDate(e.date)}</td>
                <td>{[e.type, e.group, e.item].filter(Boolean).join(' › ')}</td>
                <td>{accountLabel(e.account)}</td>
                <td className="num">{formatNaira(e.amount)}</td>
                <td>{e.note}</td>
                <td className="keep">{e.voided ? `Void: ${e.voidReason}` : 'Active'}</td>
                <td className="keep">{!e.voided && <button className="danger" onClick={() => setVoidId(e._id)}>Void</button>}</td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={7}>No expenses recorded for these filters.</td></tr>}
          </tbody>
        </table>
        <p>{data.total} entries</p>
      </div>
      {voidId && <VoidDialog title="Void this expense?" onConfirm={confirmVoid} onCancel={() => setVoidId(null)} />}
    </>
  );
}
