import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useAccounts } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';
import ExpenseForm from '../components/ExpenseForm';
import VoidDialog from '../components/VoidDialog';
import Field from '../components/Field';
import TableWrap from '../components/TableWrap';
import { formatDate } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { accountLabel } from '../utils/labels';
import { TableSkeleton } from '../components/Skeleton';

export default function Expenses() {
  const { can } = useAuth();
  const canView = can('expenses.view');
  const canRecord = can('expenses.record');
  const canVoid = can('expenses.void');
  const { accounts, error: accountsError } = useAccounts();
  const { categories, error: categoriesError } = useCategories();
  const [filters, setFilters] = useState({ from: '', to: '', status: 'all', type: '' });
  const [data, setData] = useState({ items: [], total: 0 });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [voidId, setVoidId] = useState(null);

  const load = useCallback(() => {
    if (!canView) return;
    api.get('/expenses', filters)
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, [filters, canView]);
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
  const filtered = !!(filters.from || filters.to || filters.type || filters.status !== 'all');
  const categoryPath = (e) => [e.type, e.group, e.item].filter(Boolean).join(' › ');

  return (
    <>
      <div className="page-title-row">
        <h1>Expenses</h1>
        {canRecord && <span className="page-hint">Record an expense when it happens</span>}
      </div>
      {canRecord && (
        <details className="workspace-disclosure" open={!canView}>
          <summary>Record expense</summary>
          <ExpenseForm accounts={accounts} categories={categories} onSubmit={record} />
        </details>
      )}
      {canView ? (
        <>
        <details className="workspace-disclosure workspace-disclosure-compact">
          <summary>Filter expenses{filtered && ' (active)'}</summary>
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
        </details>
        {(error || accountsError || categoriesError) && <p className="error" role="alert">{error || accountsError || categoriesError}</p>}
        <div className="card">
          <TableWrap label="Expense entries">
          <table>
            <thead>
              <tr><th>Date</th><th>Category</th><th>Account</th><th className="num">Amount</th><th>Note</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            {!loaded ? <TableSkeleton columns={7} label="Loading…" /> : <tbody>
              {data.items.map((e) => (
                <tr key={e._id} className={e.voided ? 'void' : ''}>
                  <td>{formatDate(e.date)}</td>
                  <td>{categoryPath(e)}</td>
                  <td>{accountLabel(e.account)}</td>
                  <td className="num">{formatNaira(e.amount)}</td>
                  <td>{e.note}</td>
                  <td className="keep">{e.voided ? `Void: ${e.voidReason}` : 'Active'}</td>
                  <td className="keep">
                    {!e.voided && canVoid && (
                      <button className="link danger-text" aria-label={`Void expense ${categoryPath(e)}, ${formatDate(e.date)}`} onClick={() => setVoidId(e._id)}>Void</button>
                    )}
                  </td>
                </tr>
              ))}
              {loaded && data.items.length === 0 && (
                <tr><td colSpan={7}>{filtered ? 'No expenses match these filters.' : (canRecord ? 'No expenses yet. Record the first one above.' : 'No expenses have been recorded yet.')}</td></tr>
              )}
            </tbody>}
          </table>
          </TableWrap>
          <p>{data.total} entries</p>
        </div>
        </>
      ) : (
        (error || accountsError || categoriesError) && <p className="error" role="alert">{error || accountsError || categoriesError}</p>
      )}
      {voidId && <VoidDialog title="Void this expense?" onConfirm={confirmVoid} onCancel={() => setVoidId(null)} />}
    </>
  );
}
