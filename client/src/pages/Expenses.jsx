import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useLiveRefresh } from '../realtime/RealtimeProvider';
import { useAuth } from '../auth/AuthContext';
import { useAccounts } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';
import ExpenseForm from '../components/ExpenseForm';
import VoidDialog from '../components/VoidDialog';
import Field from '../components/Field';
import TableWrap from '../components/TableWrap';
import Pagination from '../components/Pagination';
import { formatDate } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { accountLabel } from '../utils/labels';
import { downloadBlob } from '../utils/download';
import { TableSkeleton } from '../components/Skeleton';
import { useStoredState } from '../hooks/useStoredState';

const PAGE_SIZE = 50;

export default function Expenses() {
  const live = useLiveRefresh(['expenses']);
  const { can } = useAuth();
  const canView = can('expenses.view');
  const canRecord = can('expenses.record');
  const canVoid = can('expenses.void');
  const { accounts, error: accountsError } = useAccounts();
  const { categories, error: categoriesError } = useCategories();
  const [filters, setFilters] = useStoredState('solucio:expense-filters', { from: '', to: '', status: 'all', type: '', group: '', item: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [voidId, setVoidId] = useState(null);
  const [exportFormat, setExportFormat] = useState('xlsx');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    if (!canView) return;
    api.get('/expenses', { ...filters, page, limit: PAGE_SIZE })
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, [filters, page, canView, live]);
  useEffect(load, [load]);

  // Drop a saved category filter that points at a type/group/item that no longer exists, so the list
  // doesn't silently come back empty while the dropdowns still read "All".
  useEffect(() => {
    setFilters((f) => {
      if (!categories.length || !f.type) return f;
      const next = { ...f };
      const t = categories.find((c) => c.type === f.type);
      if (!t) { next.type = ''; next.group = ''; next.item = ''; }
      else {
        const g = f.group && (t.groups || []).find((x) => x.name === f.group);
        if (f.group && !g) { next.group = ''; next.item = ''; }
        else if (g && f.item && !(g.items || []).includes(f.item)) next.item = '';
      }
      const same = next.type === f.type && next.group === f.group && next.item === f.item;
      return same ? f : next;
    });
  }, [categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const record = async (payload) => {
    await api.post('/expenses', payload);
    load();
  };
  const confirmVoid = async (reason) => {
    await api.post(`/expenses/${voidId}/void`, { reason });
    setVoidId(null);
    load();
  };
  // Any filter change narrows the result set, so jump back to the first page of the new results.
  const setFilter = (k) => (e) => { setFilters({ ...filters, [k]: e.target.value }); setPage(1); };
  // Type, group and item cascade like the record form: choosing a different level upstream clears what's below it.
  const setTypeFilter = (e) => { setFilters({ ...filters, type: e.target.value, group: '', item: '' }); setPage(1); };
  const setGroupFilter = (e) => { setFilters({ ...filters, group: e.target.value, item: '' }); setPage(1); };
  const filtered = !!(filters.from || filters.to || filters.type || filters.group || filters.item || filters.status !== 'all');
  const categoryPath = (e) => [e.type, e.group, e.item].filter(Boolean).join(' › ');
  const groupsForType = (categories.find((c) => c.type === filters.type) || {}).groups || [];
  const itemsForGroup = (groupsForType.find((g) => g.name === filters.group) || {}).items || [];

  const exportFile = async () => {
    setExporting(true);
    try {
      const { type, ...rest } = filters;
      const blob = await api.blob('/reports/export', { type: 'expenses', format: exportFormat, categoryType: type, ...rest });
      downloadBlob(blob, `solucio-expenses.${exportFormat}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

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
            <select value={filters.type} onChange={setTypeFilter}>
              <option value="">All</option>
              {categories.map((c) => <option key={c.type} value={c.type}>{c.type}</option>)}
            </select>
          </Field>
          {filters.type && (
            <Field label="Group">
              <select value={filters.group} onChange={setGroupFilter}>
                <option value="">All</option>
                {groupsForType.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
              </select>
            </Field>
          )}
          {itemsForGroup.length > 0 && (
            <Field label="Item">
              <select value={filters.item} onChange={setFilter('item')}>
                <option value="">All</option>
                {itemsForGroup.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </Field>
          )}
          <Field label="Status">
            <select value={filters.status} onChange={setFilter('status')}>
              <option value="all">All</option><option value="active">Active</option><option value="voided">Void</option>
            </select>
          </Field>
          </div>
        </details>
        <div className="card row export-controls">
          <Field label="Format">
            <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
              <option value="xlsx">Excel</option>
              <option value="pdf">PDF</option>
            </select>
          </Field>
          <button onClick={exportFile} disabled={exporting}>{exporting ? 'Preparing…' : 'Export'}</button>
        </div>
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
          {loaded && <p>{data.total} {data.total === 1 ? 'entry' : 'entries'}</p>}
          <Pagination page={page} limit={PAGE_SIZE} total={data.total} onPage={setPage} />
        </div>
        </>
      ) : (
        (error || accountsError || categoriesError) && <p className="error" role="alert">{error || accountsError || categoriesError}</p>
      )}
      {voidId && <VoidDialog title="Void this expense?" onConfirm={confirmVoid} onCancel={() => setVoidId(null)} />}
    </>
  );
}
