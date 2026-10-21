import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useLiveRefresh } from '../realtime/RealtimeProvider';
import { useAuth } from '../auth/AuthContext';
import { useAccounts } from '../hooks/useAccounts';
import Field from '../components/Field';
import Pagination from '../components/Pagination';
import { formatDate } from '../utils/dates';
import { Skeleton } from '../components/Skeleton';
import { unresolvedCount } from './statementUtils';

const PAGE_SIZE = 25;

// The library lists every imported statement. Reviewing one happens on its own page (/statements/:id),
// so this page stays focused on importing and choosing what to open.
export default function StatementsLibrary() {
  const live = useLiveRefresh(['statements']);
  const navigate = useNavigate();
  const { can } = useAuth();
  const { accounts, error: accountsError } = useAccounts();
  const bankAccounts = accounts.filter((account) => account.type === 'bank');
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState(null);
  const [statements, setStatements] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/statements', { page, limit: PAGE_SIZE });
      // Tolerate either the paginated shape ({ items, total }) or a bare array, so a backend on an older
      // build can never leave the page blank.
      const items = Array.isArray(data) ? data : (data?.items ?? []);
      setStatements(items);
      setTotal(Array.isArray(data) ? data.length : (data?.total ?? items.length));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, live]);

  useEffect(() => { load(); }, [load]);

  const upload = async (event) => {
    event.preventDefault();
    // Capture the form now: event.currentTarget is null once the handler returns, i.e. after the await.
    const form = event.currentTarget;
    if (!file || !accountId) {
      setError('Choose a bank account and PDF statement first.');
      return;
    }
    setUploading(true);
    try {
      const query = new URLSearchParams({ accountId, fileName: file.name });
      const created = await api.uploadPdf(`/statements/import?${query}`, file);
      // Show the new statement at the top. On page 1 prepend it; otherwise jump to page 1 where it lives.
      if (page === 1) {
        setStatements((current) => [created, ...current]);
        setTotal((t) => t + 1);
      } else {
        setPage(1);
      }
      setFile(null);
      setShowImport(false);
      form?.reset();
      setNotice(`${created.fileName} is ready for review.`);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="statements-page-head">
        <div><h1>Bank statements</h1><p className="muted">Import a statement, then open it to review before it becomes part of your records.</p></div>
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
          <Field label="Bank account">
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">Choose account</option>
              {bankAccounts.map((account) => <option key={account._id} value={account._id}>{account.name} · {account.bankName}</option>)}
            </select>
          </Field>
          <label className="statement-file-input"><input type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /><span>{file ? file.name : 'Choose PDF'}</span></label>
          <button type="submit" disabled={uploading}>{uploading ? 'Reading statement…' : 'Import for review'}</button>
        </form>
      )}

      {loading ? (
        <div className="statement-loading" aria-busy="true"><Skeleton label="Loading statements…" /><Skeleton /><Skeleton /></div>
      ) : statements.length === 0 ? (
        <div className="card statement-blank"><span>⌁</span><h2>Your review workspace is ready</h2><p>Import a bank statement when you are ready to begin. Imported statements will appear here to open and review.</p></div>
      ) : (
        <>
        <div className="statement-library-head"><h2>Imported statements</h2><span>{total} statement{total === 1 ? '' : 's'} · tap one to review</span></div>
        <div className="statement-library" role="list" aria-label="Imported statements">
          {statements.map((entry) => {
            // The list endpoint sends counts only; a just-uploaded statement still carries its full
            // transactions array, so fall back to it so the new card shows the right numbers immediately.
            const unresolved = entry.unresolvedCount ?? unresolvedCount(entry);
            const count = entry.transactionCount ?? entry.transactions?.length ?? 0;
            return (
              <button type="button" role="listitem" key={entry._id} className="statement-card" onClick={() => navigate(`/statements/${entry._id}`)}>
                <span className="statement-list-file">PDF</span>
                <div className="statement-card-body">
                  <b>{entry.fileName}</b>
                  <small>{entry.account?.name || 'Unknown account'} · {count} transactions · {formatDate(entry.createdAt)}</small>
                </div>
                <span className={entry.status === 'approved' ? 'approved-lock' : unresolved ? 'review-count' : 'ready-count'}>
                  {entry.status === 'approved' ? 'Approved' : unresolved ? `${unresolved} to review` : 'Ready'}
                </span>
              </button>
            );
          })}
        </div>
        <Pagination page={page} limit={PAGE_SIZE} total={total} onPage={setPage} />
        </>
      )}
    </>
  );
}
