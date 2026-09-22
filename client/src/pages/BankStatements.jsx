import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useLiveRefresh } from '../realtime/RealtimeProvider';
import { useAuth } from '../auth/AuthContext';
import { useAccounts } from '../hooks/useAccounts';
import { formatDate } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { Skeleton, TableSkeleton } from '../components/Skeleton';

const confidenceLabel = (confidence) => {
  if (confidence === 'needs-review') return 'Needs review';
  return `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence`;
};

function categoryLabel(transaction) {
  if (transaction.direction === 'income') return 'Income';
  return [transaction.type, transaction.group, transaction.item].filter(Boolean).join(' › ') || 'Uncategorized';
}

// Whether a row will be imported when the statement is approved. Missing/undefined means yes.
const isIncluded = (transaction) => transaction.included !== false;

export default function BankStatements() {
  const live = useLiveRefresh(['statements']);
  const categoriesLive = useLiveRefresh(['categories']);
  const { can } = useAuth();
  const { accounts, error: accountsError } = useAccounts();
  const bankAccounts = accounts.filter((account) => account.type === 'bank');
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState(null);
  const [statements, setStatements] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedTransactionId, setSelectedTransactionId] = useState('');
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/statements', accountId ? { accountId } : {});
      setStatements(data);
      setSelectedId((current) => current && data.some((statement) => statement._id === current) ? current : (data[0]?._id || ''));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accountId, live]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/categories').then(setCategories).catch(() => setCategories([])); }, [categoriesLive]);

  const statement = statements.find((entry) => entry._id === selectedId);
  const transaction = statement?.transactions.find((entry) => entry._id === selectedTransactionId) || statement?.transactions[0];
  // Excluded rows never need review and never block approval: they simply won't be imported.
  const includedTransactions = statement?.transactions.filter(isIncluded) || [];
  const unresolved = includedTransactions.filter((entry) => entry.confidence === 'needs-review').length;
  const visibleTransactions = statement?.transactions.filter((entry) => !reviewOnly || (isIncluded(entry) && entry.confidence === 'needs-review')) || [];
  const reviewIndex = visibleTransactions.findIndex((entry) => entry._id === transaction?._id);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!statement || ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
      const direction = event.key === 'j' || event.key === 'ArrowDown' ? 1 : event.key === 'k' || event.key === 'ArrowUp' ? -1 : 0;
      if (!direction || !visibleTransactions.length) return;
      event.preventDefault();
      const next = visibleTransactions[Math.max(0, Math.min(visibleTransactions.length - 1, reviewIndex + direction))];
      if (next) setSelectedTransactionId(next._id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [statement, visibleTransactions, reviewIndex]);

  const upload = async (event) => {
    event.preventDefault();
    if (!file || !accountId) {
      setError('Choose a bank account and PDF statement first.');
      return;
    }
    setUploading(true);
    try {
      const query = new URLSearchParams({ accountId, fileName: file.name });
      const created = await api.uploadPdf(`/statements/import?${query}`, file);
      setStatements((current) => [created, ...current]);
      setSelectedId(created._id);
      setSelectedTransactionId(created.transactions[0]?._id || '');
      setFile(null);
      event.currentTarget.reset();
      setNotice(`${created.fileName} is ready for review.`);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Every edit to a row — category, direction, or whether to import it — goes through here.
  const patchTransaction = async (transactionId, changes) => {
    if (!statement) return;
    try {
      const updated = await api.patch(`/statements/${statement._id}/transactions/${transactionId}`, changes);
      setStatements((current) => current.map((entry) => entry._id === updated._id ? updated : entry));
      if (reviewOnly && changes.confidence === 'high') {
        const next = updated.transactions.find((entry) => isIncluded(entry) && entry.confidence === 'needs-review');
        setSelectedTransactionId(next?._id || '');
      }
      setNotice('Transaction review saved.');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };
  const saveTransaction = (changes) => transaction && patchTransaction(transaction._id, changes);
  const toggleInclude = (entry) => patchTransaction(entry._id, { included: !isIncluded(entry) });

  // Bring in only the income rows, only the expenses, or everything — one click instead of one row at a time.
  const bulkInclude = async (scope) => {
    if (!statement) return;
    try {
      const updated = await api.patch(`/statements/${statement._id}/include`, { scope });
      setStatements((current) => current.map((entry) => entry._id === updated._id ? updated : entry));
      setNotice(scope === 'all' ? 'Importing every transaction.' : `Only ${scope} transactions will be imported.`);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const approve = async () => {
    if (!statement) return;
    try {
      const updated = await api.post(`/statements/${statement._id}/approve`);
      setStatements((current) => current.map((entry) => entry._id === updated._id ? updated : entry));
      setNotice('Statement approved. Its included transactions are now in your records.');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const selectedType = categories.find((entry) => entry.type === transaction?.type) || categories[0];
  const selectedGroup = selectedType?.groups.find((entry) => entry.name === transaction?.group) || selectedType?.groups[0];
  const canApprove = unresolved === 0 && includedTransactions.length > 0;

  return (
    <>
      <div className="statements-page-head">
        <div><h1>Bank statements</h1><p className="muted">Review imported bank activity before it becomes part of your records.</p></div>
        {can('statements.import') && <button type="button" onClick={() => setShowImport((current) => !current)}>{showImport ? 'Close import' : 'Import statement'}</button>}
      </div>

      {(error || accountsError) && <p className="error" role="alert">{error || accountsError}</p>}
      {notice && <p className="statement-notice" role="status">{notice}</p>}

      {can('statements.import') && showImport && (
        <form className="card statement-import" onSubmit={upload}>
          <div className="statement-import-copy">
            <span className="statement-file-icon">↥</span>
            <div><b>Import a bank statement</b><p>Upload a text-based PDF. Unclear entries are sent to review instead of being guessed.</p></div>
          </div>
          <label className="field"><span>Bank account</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Choose account</option>{bankAccounts.map((account) => <option key={account._id} value={account._id}>{account.name} · {account.bankName}</option>)}</select></label>
          <label className="statement-file-input"><input type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /><span>{file ? file.name : 'Choose PDF'}</span></label>
          <button type="submit" disabled={uploading}>{uploading ? 'Reading statement…' : 'Import for review'}</button>
        </form>
      )}

      <section className="statement-review">
        <div className="statement-toolbar">
          <div className="statement-picker">
            <label htmlFor="statement-picker">Statement</label>
            <select id="statement-picker" value={selectedId} onChange={(event) => { const next = statements.find((entry) => entry._id === event.target.value); setSelectedId(event.target.value); setSelectedTransactionId(next?.transactions[0]?._id || ''); }} disabled={loading || statements.length === 0}>
              <option value="">{loading ? 'Loading statements…' : 'Choose an imported statement'}</option>
              {statements.map((entry) => <option key={entry._id} value={entry._id}>{entry.fileName} · {entry.account?.name} · {entry.status}</option>)}
            </select>
          </div>
          <div className="statement-toolbar-meta">{statement ? <><span>{formatDate(statement.createdAt)}</span><span className={statement.status === 'approved' ? 'approved-lock' : 'review-count'}>{statement.status === 'approved' ? 'Approved' : `${unresolved} to review`}</span></> : <span>{statements.length} imported</span>}<button type="button" className="secondary compact" onClick={load}>Refresh</button></div>
        </div>
          {loading ? (
            <div className="statement-loading" aria-busy="true"><Skeleton label="Loading statements…" /><Skeleton /><div className="card statement-table-card"><table><TableSkeleton columns={6} label="Loading statement transactions…" /></table></div></div>
          ) : !statement ? (
            <div className="card statement-blank"><span>⌁</span><h2>{statements.length ? 'Choose a statement to review' : 'Your review workspace is ready'}</h2><p>{statements.length ? 'Select an imported statement from the toolbar above.' : 'Import a bank statement when you are ready to begin.'}</p></div>
          ) : (
            <>
              <div className="card statement-summary">
                <div><p className="statement-eyebrow">{statement.status === 'approved' ? 'APPROVED STATEMENT' : 'STATEMENT IN REVIEW'}</p><h2>{statement.fileName}</h2><p>{statement.account?.name} · uploaded by {statement.uploadedBy?.name || 'Unknown user'} · {statement.transactions.length} transactions</p></div>
                <div className="statement-summary-actions">
                  {statement.status === 'approved' ? <span className="approved-lock">Locked</span> : <><span className={unresolved ? 'review-count' : includedTransactions.length === 0 ? 'review-count' : 'ready-count'}>{unresolved ? `${unresolved} need review` : includedTransactions.length === 0 ? 'Nothing selected to import' : 'Ready to approve'}</span>{can('statements.approve') && <button type="button" disabled={!canApprove} onClick={approve}>Approve statement</button>}</>}
                </div>
              </div>

              {statement.status === 'review' && can('statements.review') && (
                <div className="card statement-bulk-include">
                  <span>Import:</span>
                  <div className="row">
                    <button type="button" className="secondary compact" onClick={() => bulkInclude('all')}>Import everything</button>
                    <button type="button" className="secondary compact" onClick={() => bulkInclude('income')}>Income only</button>
                    <button type="button" className="secondary compact" onClick={() => bulkInclude('expense')}>Expenses only</button>
                  </div>
                  <small>{includedTransactions.length} of {statement.transactions.length} rows will be imported when you approve.</small>
                </div>
              )}

              <div className="statement-review-split">
                <div className="card statement-table-card">
                  <div className="statement-table-head"><div><h2>Transactions</h2><p>Select a row to edit its category.</p></div><div className="statement-table-actions"><button type="button" className={reviewOnly ? '' : 'secondary'} onClick={() => { setReviewOnly((current) => !current); const first = statement.transactions.find((entry) => isIncluded(entry) && entry.confidence === 'needs-review'); if (first) setSelectedTransactionId(first._id); }}>{reviewOnly ? 'Show all' : `Review queue (${unresolved})`}</button><span>{statement.transactions.filter((entry) => entry.direction === 'income').length} income · {statement.transactions.filter((entry) => entry.direction === 'expense').length} expenses</span></div></div>
                  <div className="table-wrap" role="region" aria-label="Statement transactions">
                    <table className="statement-table"><thead><tr><th>Date</th><th>Transaction</th><th>Category</th><th>Review</th><th className="num">Amount</th><th>Import</th></tr></thead><tbody>
                      {visibleTransactions.map((entry) => (
                        <tr key={entry._id} className={[transaction?._id === entry._id ? 'selected-row' : '', isIncluded(entry) ? '' : 'excluded'].filter(Boolean).join(' ')} onClick={() => setSelectedTransactionId(entry._id)}>
                          <td>{formatDate(entry.date)}</td>
                          <td><b>{entry.narration}</b>{entry.reference && <small>{entry.reference}</small>}</td>
                          <td>{categoryLabel(entry)}</td>
                          <td><span className={`confidence ${entry.confidence}`}>{confidenceLabel(entry.confidence)}</span></td>
                          <td className={`num ${entry.direction}`}>{entry.direction === 'income' ? '+' : '−'}{formatNaira(entry.amount)}</td>
                          <td className="keep">
                            {statement.status === 'review' && can('statements.review') ? (
                              <input
                                type="checkbox"
                                checked={isIncluded(entry)}
                                aria-label={`Import ${entry.narration}`}
                                onClick={(event) => event.stopPropagation()}
                                onChange={() => toggleInclude(entry)}
                              />
                            ) : (isIncluded(entry) ? 'Yes' : 'No')}
                          </td>
                        </tr>
                      ))}
                    </tbody></table>
                  </div>
                </div>

                {transaction && <aside className="card transaction-editor">
                  <div><p className="statement-eyebrow">REVIEWING TRANSACTION {reviewIndex >= 0 ? `${reviewIndex + 1} OF ${visibleTransactions.length}` : ''}</p><h2>{transaction.narration}</h2><p>{formatDate(transaction.date)} · {transaction.direction === 'income' ? 'Money in' : 'Money out'} · {formatNaira(transaction.amount)}</p></div>
                  {statement.status === 'review' && can('statements.review') ? <div className="transaction-controls">
                    <label className="field"><span>Treat as</span><select value={transaction.direction} onChange={(event) => saveTransaction({ direction: event.target.value, type: null, group: null, item: null, confidence: 'needs-review' })}><option value="income">Income</option><option value="expense">Expense</option></select></label>
                    {transaction.direction === 'expense' && <>
                      <label className="field"><span>Type</span><select value={transaction.type || selectedType?.type || ''} onChange={(event) => saveTransaction({ type: event.target.value, group: '', item: null, confidence: 'needs-review' })}>{categories.map((entry) => <option key={entry.type} value={entry.type}>{entry.type}</option>)}</select></label>
                      <label className="field"><span>Group</span><select value={transaction.group || selectedGroup?.name || ''} onChange={(event) => saveTransaction({ type: selectedType?.type, group: event.target.value, item: null, confidence: 'needs-review' })}>{selectedType?.groups.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}</select></label>
                      {selectedGroup?.items?.length > 0 && <label className="field"><span>Item</span><select value={transaction.item || ''} onChange={(event) => saveTransaction({ item: event.target.value, confidence: 'needs-review' })}><option value="">Choose item</option>{selectedGroup.items.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>}
                    </>}
                    <label className="check"><input type="checkbox" checked={isIncluded(transaction)} onChange={() => toggleInclude(transaction)} /><span>Import this transaction</span></label>
                    <button type="button" onClick={() => saveTransaction({ confidence: 'high' })}>Mark reviewed</button>
                    <div className="review-navigation"><button type="button" className="secondary" disabled={reviewIndex <= 0} onClick={() => setSelectedTransactionId(visibleTransactions[reviewIndex - 1]._id)}>Previous</button><button type="button" className="secondary" disabled={reviewIndex >= visibleTransactions.length - 1} onClick={() => setSelectedTransactionId(visibleTransactions[reviewIndex + 1]._id)}>Next</button></div>
                  </div> : <span className="approved-lock">This statement is locked</span>}
                </aside>}
              </div>
            </>
          )}
      </section>
    </>
  );
}
