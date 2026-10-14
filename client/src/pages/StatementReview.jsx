import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useLiveRefresh } from '../realtime/RealtimeProvider';
import { useAuth } from '../auth/AuthContext';
import { formatDate } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { Skeleton, TableSkeleton } from '../components/Skeleton';
import { categoryLabel, confidenceLabel, isIncluded } from './statementUtils';

export default function StatementReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const live = useLiveRefresh(['statements']);
  const categoriesLive = useLiveRefresh(['categories']);
  const { can } = useAuth();
  const [statement, setStatement] = useState(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState('');
  const [categories, setCategories] = useState([]);
  const [incomeCategories, setIncomeCategories] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [bulkIncludeScope, setBulkIncludeScope] = useState('');
  const [approving, setApproving] = useState(false);
  const [approveBlockers, setApproveBlockers] = useState(null);
  const [fixing, setFixing] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/statements/${id}`);
      setStatement(data);
      setError('');
    } catch (err) {
      setError(err.message);
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [id, live]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/categories').then(setCategories).catch(() => setCategories([])); }, [categoriesLive]);
  useEffect(() => { api.get('/categories', { kind: 'income' }).then(setIncomeCategories).catch(() => setIncomeCategories([])); }, [categoriesLive]);

  // Only set once a row is actually clicked — this both drives the editor modal's open state and
  // keeps it closed until the reviewer opens a record.
  const transaction = statement?.transactions.find((entry) => entry._id === selectedTransactionId) || null;
  const closeEditor = () => setSelectedTransactionId('');
  // Excluded rows never need review and never block approval: they simply won't be imported.
  const includedTransactions = statement?.transactions.filter(isIncluded) || [];
  const unresolved = includedTransactions.filter((entry) => entry.confidence === 'needs-review').length;
  const visibleTransactions = statement?.transactions.filter((entry) => !reviewOnly || (isIncluded(entry) && entry.confidence === 'needs-review')) || [];
  const reviewIndex = visibleTransactions.findIndex((entry) => entry._id === transaction?._id);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!statement) return;
      // Esc closes the open editor modal.
      if (event.key === 'Escape' && transaction) { setSelectedTransactionId(''); return; }
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
      // j/k (or arrows) step through records only while a record is open in the modal.
      if (!transaction) return;
      const direction = event.key === 'j' || event.key === 'ArrowDown' ? 1 : event.key === 'k' || event.key === 'ArrowUp' ? -1 : 0;
      if (!direction || !visibleTransactions.length) return;
      event.preventDefault();
      const next = visibleTransactions[Math.max(0, Math.min(visibleTransactions.length - 1, reviewIndex + direction))];
      if (next) setSelectedTransactionId(next._id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [statement, transaction, visibleTransactions, reviewIndex]);

  // Every edit to a row — category, direction, or whether to import it — goes through here.
  const patchTransaction = async (transactionId, changes) => {
    if (!statement) return;
    try {
      const updated = await api.patch(`/statements/${statement._id}/transactions/${transactionId}`, changes);
      setStatement(updated);
      if (reviewOnly && changes.confidence === 'high') {
        const next = updated.transactions.find((entry) => isIncluded(entry) && entry.confidence === 'needs-review');
        setSelectedTransactionId(next?._id || '');
      }
      const similar = updated.similarUpdated || 0;
      setNotice(similar ? `Transaction review saved. Also applied to ${similar} other transaction${similar === 1 ? '' : 's'} from the same payee.` : 'Transaction review saved.');
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
    setBulkIncludeScope(scope);
    try {
      const updated = await api.patch(`/statements/${statement._id}/include`, { scope });
      setStatement(updated);
      setNotice(scope === 'all' ? 'Importing every transaction.' : `Only ${scope} transactions will be imported.`);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkIncludeScope('');
    }
  };

  // Re-run the categorizer on rows nobody has decided, using what reviewers have taught it since import.
  const recheck = async () => {
    if (!statement) return;
    setRechecking(true);
    try {
      const updated = await api.post(`/statements/${statement._id}/recategorize`);
      setStatement(updated);
      const { checked, changed, needReview } = updated.recategorized;
      setNotice(`Re-checked ${checked} transactions: ${changed} updated, ${needReview} still need review.`);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setRechecking(false);
    }
  };

  // Only statements still in review can be deleted; the server refuses approved ones.
  const deleteStatement = async () => {
    if (!statement) return;
    setDeleting(true);
    try {
      await api.delete(`/statements/${statement._id}`);
      navigate('/statements');
    } catch (err) {
      setError(err.message);
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  const approve = async () => {
    if (!statement) return;
    setApproving(true);
    try {
      const updated = await api.post(`/statements/${statement._id}/approve`);
      setStatement(updated);
      setNotice('Statement approved. Its included transactions are now in your records.');
      setError('');
    } catch (err) {
      // Approval can be held up by rows whose category isn't set up; offer to fix them in a dialog.
      if (err.data && Array.isArray(err.data.blockers) && err.data.blockers.length) setApproveBlockers(err.data.blockers);
      else setError(err.message);
    } finally {
      setApproving(false);
    }
  };

  // One click: create every missing category the held-up rows need, refresh the trees, then approve again.
  const createMissingAndApprove = async (creates) => {
    setFixing(true);
    try {
      for (const c of creates) await api.post('/categories/ensure-path', { kind: c.kind, ...c.create });
      const [exp, inc] = await Promise.all([api.get('/categories'), api.get('/categories', { kind: 'income' })]);
      setCategories(Array.isArray(exp) ? exp : []);
      setIncomeCategories(Array.isArray(inc) ? inc : []);
      setApproveBlockers(null);
      await approve();
    } catch (err) {
      setError(err.message);
    } finally {
      setFixing(false);
    }
  };
  const openBlocker = (blocker) => { setReviewOnly(false); setSelectedTransactionId(blocker.transactionId); setApproveBlockers(null); };

  const selectedType = categories.find((entry) => entry.type === transaction?.type) || categories[0];
  const selectedGroup = selectedType?.groups.find((entry) => entry.name === transaction?.group) || selectedType?.groups[0];
  // Income category is optional, so no auto-fallback to the first type/group.
  const selectedIncomeType = incomeCategories.find((entry) => entry.type === transaction?.type);
  const selectedIncomeGroup = selectedIncomeType?.groups.find((entry) => entry.name === transaction?.group) || selectedIncomeType?.groups[0];
  const canApprove = unresolved === 0 && includedTransactions.length > 0;

  return (
    <>
      <div className="statements-page-head">
        <div>
          <Link to="/statements" className="statement-back">← Back to statements</Link>
          <h1>{statement?.fileName || 'Statement review'}</h1>
          <p className="muted">Review imported bank activity before it becomes part of your records.</p>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="statement-notice" role="status">{notice}</p>}

      <section className="statement-review">
        {loading ? (
          <div className="statement-loading" aria-busy="true"><Skeleton label="Loading statement…" /><Skeleton /><div className="card statement-table-card"><table><TableSkeleton columns={6} label="Loading statement transactions…" /></table></div></div>
        ) : !statement ? (
          <div className="card statement-blank"><span>⌁</span><h2>Statement not found</h2><p>It may have been deleted. <Link to="/statements" className="link">Back to statements</Link>.</p></div>
        ) : (
          <>
            <div className="card statement-summary">
              <div><p className="statement-eyebrow">{statement.status === 'approved' ? 'APPROVED STATEMENT' : 'STATEMENT IN REVIEW'}</p><h2>{statement.fileName}</h2><p>{statement.account?.name} · uploaded by {statement.uploadedBy?.name || 'Unknown user'} · {statement.transactions.length} transactions · {formatDate(statement.createdAt)}</p></div>
              <div className="statement-summary-actions">
                {statement.status === 'review' && can('statements.review') && <button type="button" className="secondary compact" disabled={rechecking} onClick={recheck}>{rechecking ? 'Re-checking…' : 'Re-check categories'}</button>}
                {statement.status === 'approved' ? <span className="approved-lock">Locked</span> : <><span className={unresolved ? 'review-count' : includedTransactions.length === 0 ? 'review-count' : 'ready-count'}>{unresolved ? `${unresolved} need review` : includedTransactions.length === 0 ? 'Nothing selected to import' : 'Ready to approve'}</span>{can('statements.approve') && <button type="button" disabled={!canApprove || approving} onClick={approve}>{approving ? 'Approving…' : 'Approve statement'}</button>}{can('statements.approve') && (confirmingDelete ? <><button type="button" className="danger" disabled={deleting} onClick={deleteStatement}>{deleting ? 'Deleting…' : 'Confirm delete'}</button><button type="button" className="secondary" disabled={deleting} onClick={() => setConfirmingDelete(false)}>Cancel</button></> : <button type="button" className="secondary" onClick={() => setConfirmingDelete(true)}>Delete statement</button>)}</>}
              </div>
            </div>

            {statement.status === 'review' && can('statements.review') && (
              <div className="card statement-bulk-include">
                <span>Import:</span>
                <div className="row">
                  <button type="button" className="secondary compact" disabled={!!bulkIncludeScope} onClick={() => bulkInclude('all')}>{bulkIncludeScope === 'all' ? 'Applying…' : 'Import everything'}</button>
                  <button type="button" className="secondary compact" disabled={!!bulkIncludeScope} onClick={() => bulkInclude('income')}>{bulkIncludeScope === 'income' ? 'Applying…' : 'Income only'}</button>
                  <button type="button" className="secondary compact" disabled={!!bulkIncludeScope} onClick={() => bulkInclude('expense')}>{bulkIncludeScope === 'expense' ? 'Applying…' : 'Expenses only'}</button>
                </div>
                <small>{includedTransactions.length} of {statement.transactions.length} rows will be imported when you approve.</small>
              </div>
            )}

              <div className="card statement-table-card">
                <div className="statement-table-head"><div><h2>Transactions</h2><p>Select a record to edit its category.</p></div><div className="statement-table-actions"><button type="button" className={reviewOnly ? '' : 'secondary'} onClick={() => { setReviewOnly((current) => !current); const first = statement.transactions.find((entry) => isIncluded(entry) && entry.confidence === 'needs-review'); if (first) setSelectedTransactionId(first._id); }}>{reviewOnly ? 'Show all' : `Review queue (${unresolved})`}</button><span>{statement.transactions.filter((entry) => entry.direction === 'income').length} income · {statement.transactions.filter((entry) => entry.direction === 'expense').length} expenses</span></div></div>
                <div className="statement-rows" role="region" aria-label="Statement transactions">
                  {visibleTransactions.map((entry) => {
                    const review = statement.status === 'review' && can('statements.review');
                    return (
                      <div
                        key={entry._id}
                        className={['statement-row', entry.direction, transaction?._id === entry._id ? 'selected-row' : '', isIncluded(entry) ? '' : 'excluded'].filter(Boolean).join(' ')}
                        role="button"
                        tabIndex={0}
                        aria-pressed={transaction?._id === entry._id}
                        onClick={() => setSelectedTransactionId(entry._id)}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedTransactionId(entry._id); } }}
                      >
                        <div className="statement-row-main">
                          <b>{entry.narration}</b>
                          {entry.reference && <small>{entry.reference}</small>}
                          <div className="statement-row-tags">
                            <span className="statement-row-cat">{categoryLabel(entry)}</span>
                            <span className={`confidence ${entry.confidence}`} title={entry.reason || undefined}>{confidenceLabel(entry.confidence)}</span>
                            <span className="statement-row-date">{formatDate(entry.date)}</span>
                          </div>
                        </div>
                        <div className="statement-row-side">
                          <span className={`statement-row-amount ${entry.direction}`}>{entry.direction === 'income' ? '+' : '−'}{formatNaira(entry.amount)}</span>
                          {review ? (
                            <label className="statement-row-keep" onClick={(event) => event.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isIncluded(entry)}
                                aria-label={`Import ${entry.narration}`}
                                onChange={() => toggleInclude(entry)}
                              />
                              <span>Import</span>
                            </label>
                          ) : (
                            <span className="statement-row-keep muted">{isIncluded(entry) ? 'Imported' : 'Skipped'}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {transaction && createPortal(
                <div className="modal statement-editor-modal" onClick={closeEditor}>
                <aside className="card transaction-editor" role="dialog" aria-modal="true" aria-label="Review transaction" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="modal-close" aria-label="Close" onClick={closeEditor}>×</button>
                <div><p className="statement-eyebrow">REVIEWING TRANSACTION {reviewIndex >= 0 ? `${reviewIndex + 1} OF ${visibleTransactions.length}` : ''}</p><h2>{transaction.narration}</h2><p>{formatDate(transaction.date)} · {transaction.direction === 'income' ? 'Money in' : 'Money out'} · {formatNaira(transaction.amount)}</p>{transaction.reason && <p className="transaction-reason">Why: {transaction.reason}</p>}</div>
                {statement.status === 'review' && can('statements.review') ? <div className="transaction-controls">
                  <label className="field"><span>Treat as</span><select value={transaction.direction} onChange={(event) => saveTransaction({ direction: event.target.value, type: null, group: null, item: null, confidence: 'needs-review' })}><option value="income">Income</option><option value="expense">Expense</option></select></label>
                  {transaction.direction === 'expense' && <>
                    <label className="field"><span>Type</span><select value={transaction.type || selectedType?.type || ''} onChange={(event) => saveTransaction({ type: event.target.value, group: '', item: null, confidence: 'needs-review' })}>{categories.map((entry) => <option key={entry.type} value={entry.type}>{entry.type}</option>)}</select></label>
                    <label className="field"><span>Group</span><select value={transaction.group || selectedGroup?.name || ''} onChange={(event) => saveTransaction({ type: selectedType?.type, group: event.target.value, item: null, confidence: 'needs-review' })}>{selectedType?.groups.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}</select></label>
                    {selectedGroup?.items?.length > 0 && <label className="field"><span>Item</span><select value={transaction.item || ''} onChange={(event) => saveTransaction({ type: selectedType?.type, group: selectedGroup?.name, item: event.target.value, confidence: 'needs-review' })}><option value="">Choose item</option>{selectedGroup.items.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>}
                  </>}
                  {transaction.direction === 'income' && incomeCategories.length > 0 && <>
                    <label className="field"><span>Category (optional)</span><select value={transaction.type || ''} onChange={(event) => { const t = event.target.value; const firstGroup = incomeCategories.find((c) => c.type === t)?.groups?.[0]; saveTransaction({ type: t || null, group: t ? (firstGroup?.name || null) : null, item: null }); }}><option value="">No category</option>{incomeCategories.map((entry) => <option key={entry.type} value={entry.type}>{entry.type}</option>)}</select></label>
                    {transaction.type && <label className="field"><span>Group</span><select value={transaction.group || selectedIncomeGroup?.name || ''} onChange={(event) => saveTransaction({ type: selectedIncomeType?.type, group: event.target.value, item: null })}>{selectedIncomeType?.groups.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}</select></label>}
                    {transaction.type && selectedIncomeGroup?.items?.length > 0 && <label className="field"><span>Item</span><select value={transaction.item || ''} onChange={(event) => saveTransaction({ type: selectedIncomeType?.type, group: selectedIncomeGroup?.name, item: event.target.value })}><option value="">Choose item</option>{selectedIncomeGroup.items.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>}
                  </>}
                  <label className="check"><input type="checkbox" checked={isIncluded(transaction)} onChange={() => toggleInclude(transaction)} /><span>Import this transaction</span></label>
                  <button type="button" disabled={markingReviewed} onClick={async () => {
                    setMarkingReviewed(true);
                    try {
                      // Confirm the category that is actually shown. The expense Type/Group selects fall
                      // back to the first option when nothing is stored, so persist those too — otherwise
                      // the row would stay type/group-null and keep being flagged at approval.
                      const changes = transaction.direction === 'expense'
                        ? { type: selectedType?.type || null, group: selectedGroup?.name || null, item: (selectedGroup?.items || []).includes(transaction.item) ? transaction.item : null, confidence: 'high' }
                        : { confidence: 'high' };
                      await saveTransaction(changes);
                    } finally { setMarkingReviewed(false); }
                  }}>{markingReviewed ? 'Saving…' : 'Mark reviewed'}</button>
                  <div className="review-navigation"><button type="button" className="secondary" disabled={reviewIndex <= 0} onClick={() => setSelectedTransactionId(visibleTransactions[reviewIndex - 1]._id)}>Previous</button><button type="button" className="secondary" disabled={reviewIndex >= visibleTransactions.length - 1} onClick={() => setSelectedTransactionId(visibleTransactions[reviewIndex + 1]._id)}>Next</button></div>
                </div> : <span className="approved-lock">This statement is locked</span>}
                </aside>
              </div>,
                document.body,
              )}
          </>
        )}
      </section>
      {approveBlockers && (() => {
        const creates = [...new Map(approveBlockers.filter((b) => b.action === 'create').map((b) => [`${b.kind}|${b.path}`, b])).values()];
        const choices = approveBlockers.filter((b) => b.action === 'choose');
        return (
          <div className="modal">
            <form className="card" role="dialog" aria-modal="true" aria-labelledby="fix-cat-title" onSubmit={(e) => e.preventDefault()}>
              <h3 id="fix-cat-title">A few rows still need a category</h3>
              <p>Approving is paused until every row below has a category. Fix them here, then approve again.</p>
              {creates.length > 0 && (
                <div className="fix-group">
                  <p><b>These categories don&apos;t exist yet — create and approve:</b></p>
                  <ul className="blocker-list">{creates.map((b) => <li key={`${b.kind}|${b.path}`}><em className={b.kind === 'income' ? 'income' : 'expense'}>{b.kind}</em> {b.path}</li>)}</ul>
                </div>
              )}
              {choices.length > 0 && (
                <div className="fix-group">
                  <p><b>Open each of these rows and pick a category:</b></p>
                  <ul className="blocker-list">{choices.map((b) => (
                    <li key={b.transactionId}>
                      {b.narration || '(no description)'}
                      {b.path ? <span className="muted"> — currently {b.path}</span> : null}{' '}
                      <button type="button" className="link" onClick={() => openBlocker(b)}>Open this transaction</button>
                    </li>
                  ))}</ul>
                </div>
              )}
              <div className="row modal-actions">
                <button type="button" className="secondary" onClick={() => setApproveBlockers(null)}>Close</button>
                {creates.length > 0 && <button type="button" disabled={fixing} onClick={() => createMissingAndApprove(creates)}>{fixing ? 'Creating…' : `Create ${creates.length} categor${creates.length === 1 ? 'y' : 'ies'} & approve`}</button>}
              </div>
            </form>
          </div>
        );
      })()}
    </>
  );
}
