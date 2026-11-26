import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useLiveRefresh } from '../realtime/RealtimeProvider';
import { useAuth } from '../auth/AuthContext';
import { useAccounts } from '../hooks/useAccounts';
import Field from '../components/Field';
import { Skeleton } from '../components/Skeleton';
import { monthLabel } from './statementUtils';

// The library opens on a grid of month boxes. Pick a month to see the statements that cover it
// (StatementMonth page). Months with no statement imported are shown too, so gaps are obvious.
export default function StatementsLibrary() {
  const live = useLiveRefresh(['statements']);
  const navigate = useNavigate();
  const { can } = useAuth();
  const { accounts, error: accountsError } = useAccounts();
  const bankAccounts = accounts.filter((account) => account.type === 'bank');
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState(null);
  const [months, setMonths] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/statements/months');
      setMonths(data?.months ?? []);
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
    const form = event.currentTarget;
    if (!file || !accountId) {
      setError('Choose a bank account and PDF statement first.');
      return;
    }
    setUploading(true);
    try {
      const query = new URLSearchParams({ accountId, fileName: file.name });
      const created = await api.uploadPdf(`/statements/import?${query}`, file);
      setFile(null);
      setShowImport(false);
      form?.reset();
      setError('');
      await load();
      navigate(`/statements/${created._id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const monthName = (key) => monthLabel(`${key}-01`);

  return (
    <>
      <div className="statements-page-head">
        <div><h1>Bank statements</h1><p className="muted">Pick a month to see the statements for it. Months with nothing imported are marked.</p></div>
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
        <div className="statement-loading" aria-busy="true"><Skeleton label="Loading months…" /><Skeleton /><Skeleton /></div>
      ) : months.length === 0 ? (
        <div className="card statement-blank"><span>⌁</span><h2>No statements yet</h2><p>Import a bank statement to begin. Each month you import will appear here as a box to open.</p></div>
      ) : (
        <>
          <div className="statement-library-head"><h2>By month</h2><span>Newest first · tap a month to open it</span></div>
          <div className="month-grid" role="list" aria-label="Months">
            {months.map((m) => {
              const empty = m.statements === 0;
              return (
                <button type="button" role="listitem" key={m.key} className={`month-box${empty ? ' month-box--empty' : ''}`} onClick={() => navigate(`/statements/month/${m.key}`)}>
                  <b>{monthName(m.key)}</b>
                  {empty
                    ? <small>No statement imported</small>
                    : <small>{m.statements} statement{m.statements === 1 ? '' : 's'} · {m.accounts} account{m.accounts === 1 ? '' : 's'}</small>}
                  <span className="month-box__go" aria-hidden="true">→</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
