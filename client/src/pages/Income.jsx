import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useLiveRefresh } from '../realtime/RealtimeProvider';
import { useAuth } from '../auth/AuthContext';
import { useAccounts } from '../hooks/useAccounts';
import IncomeForm from '../components/IncomeForm';
import VoidDialog from '../components/VoidDialog';
import PaymentSuccess from '../components/PaymentSuccess';
import TableWrap from '../components/TableWrap';
import Field from '../components/Field';
import { viewReceipt } from '../utils/receipt';
import { features } from '../features';
import { formatDate } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { accountLabel } from '../utils/labels';
import { TableSkeleton } from '../components/Skeleton';
import { useStoredState } from '../hooks/useStoredState';

const METHOD = { transfer: 'Bank transfer', pos: 'POS' };

export default function Income() {
  const live = useLiveRefresh(['incomes']);
  const { can } = useAuth();
  const canView = can('income.view');
  const canRecord = can('income.record');
  const canVoid = can('income.void');
  const { accounts, error: accountsError } = useAccounts();
  const [filters, setFilters] = useStoredState('solucio:income-filters', { from: '', to: '', status: 'all' });
  const [data, setData] = useState({ items: [], total: 0 });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [voidId, setVoidId] = useState(null);

  const load = useCallback(() => {
    if (!canView) return;
    api.get('/incomes', filters)
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, [filters, canView, live]);
  useEffect(load, [load]);

  const record = async (payload) => {
    const income = await api.post('/incomes', payload);
    setNotice(income);
    load();
  };

  const confirmVoid = async (reason) => {
    await api.post(`/incomes/${voidId}/void`, { reason });
    setVoidId(null);
    load();
  };
  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const filtered = !!(filters.from || filters.to || filters.status !== 'all');

  return (
    <>
      <div className="page-title-row">
        <h1>Income</h1>
        {canRecord && <span className="page-hint">Record payments only when needed</span>}
      </div>
      {canRecord && (
        <details className="workspace-disclosure" open={!canView}>
          <summary>Record payment</summary>
          <IncomeForm accounts={accounts} onSubmit={record} />
        </details>
      )}
      {notice && (
        <PaymentSuccess
          income={notice}
          account={accounts.find((a) => a._id === notice.account)}
          onViewReceipt={viewReceipt}
          canViewReceipt={canView && features.receipts}
          onDismiss={() => setNotice(null)}
        />
      )}
      {canView ? (
        <>
        <details className="workspace-disclosure workspace-disclosure-compact">
          <summary>Filter income{filtered && ' (active)'}</summary>
          <div className="card grid">
          <Field label="From"><input type="date" value={filters.from} onChange={setFilter('from')} /></Field>
          <Field label="To"><input type="date" value={filters.to} onChange={setFilter('to')} /></Field>
          <Field label="Status">
            <select value={filters.status} onChange={setFilter('status')}>
              <option value="all">All</option><option value="active">Active</option><option value="voided">Void</option>
            </select>
          </Field>
          </div>
        </details>
        {(error || accountsError) && <p className="error" role="alert">{error || accountsError}</p>}
        <div className="card">
          <TableWrap label="Income entries">
          <table>
            <thead>
              <tr><th>Date</th><th>Receipt</th><th>Method</th><th>Account</th><th className="num">Amount</th><th>Recorded by</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            {!loaded ? <TableSkeleton columns={8} label="Loading…" /> : <tbody>
              {data.items.map((i) => (
                <tr key={i._id} className={i.voided ? 'void' : ''}>
                  <td>{formatDate(i.date)}</td>
                  <td>{i.receiptNumber}</td>
                  <td>{METHOD[i.method]}</td>
                  <td>{accountLabel(i.account)}</td>
                  <td className="num">{formatNaira(i.amount)}</td>
                  <td>{i.recordedBy && i.recordedBy.name}</td>
                  <td className="keep">{i.voided ? `Void: ${i.voidReason}` : 'Active'}</td>
                  <td className="keep row actions">
                    {features.receipts && (
                      <button className="link" aria-label={`View receipt ${i.receiptNumber}`} onClick={() => viewReceipt(i._id).catch((e) => setError(e.message))}>Receipt</button>
                    )}
                    {!i.voided && canVoid && <button className="link danger-text" aria-label={`Void ${i.receiptNumber}`} onClick={() => setVoidId(i._id)}>Void</button>}
                  </td>
                </tr>
              ))}
              {loaded && data.items.length === 0 && (
                <tr><td colSpan={8}>{filtered ? 'No payments match these filters.' : (canRecord ? 'No payments yet. Record the first one above.' : 'No payments have been recorded yet.')}</td></tr>
              )}
            </tbody>}
          </table>
          </TableWrap>
          <p>{data.total} entries</p>
        </div>
        </>
      ) : (
        (error || accountsError) && <p className="error" role="alert">{error || accountsError}</p>
      )}
      {voidId && <VoidDialog title="Void this income entry?" onConfirm={confirmVoid} onCancel={() => setVoidId(null)} />}
    </>
  );
}
