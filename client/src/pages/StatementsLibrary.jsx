import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useLiveRefresh } from '../realtime/RealtimeProvider';
import { useAuth } from '../auth/AuthContext';
import { useAccounts } from '../hooks/useAccounts';
import Field from '../components/Field';
import { formatDate } from '../utils/dates';
import { Skeleton } from '../components/Skeleton';
import { unresolvedCount } from './statementUtils';

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
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/statements');
      setStatements(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [live]);

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
      setStatements((current) => [created, ...current]);
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
        <div className="statement-library-head"><h2>Imported statements</h2><span>{statements.length} statement{statements.length === 1 ? '' : 's'} · tap one to review</span></div>
        <div className="statement-library" role="list" aria-label="Imported statements">
          {statements.map((entry) => {
            const unresolved = unresolvedCount(entry);
            return (
              <button type="button" role="listitem" key={entry._id} className="statement-card" onClick={() => navigate(`/statements/${entry._id}`)}>
                <span className="statement-list-file">PDF</span>
                <div className="statement-card-body">
                  <b>{entry.fileName}</b>
                  <small>{entry.account?.name || 'Unknown account'} · {entry.transactions.length} transactions · {formatDate(entry.createdAt)}</small>
                </div>
                <span className={entry.status === 'approved' ? 'approved-lock' : unresolved ? 'review-count' : 'ready-count'}>
                  {entry.status === 'approved' ? 'Approved' : unresolved ? `${unresolved} to review` : 'Ready'}
                </span>
              </button>
            );
          })}
        </div>
        </>
      )}
    </>
  );
}
