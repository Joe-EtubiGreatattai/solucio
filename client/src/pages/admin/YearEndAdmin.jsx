import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import Field from '../../components/Field';

const naira = (kobo) => `₦${((kobo || 0) / 100).toLocaleString('en-NG')}`;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '');

export default function YearEndAdmin() {
  const [slates, setSlates] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [label, setLabel] = useState(String(new Date().getFullYear()));
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      setSlates(await api.get('/slates'));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const slate = await api.post('/slates', { label: label.trim(), confirm: confirm.trim() });
      setNotice(`${slate.label} archived and the system cleared for a new year.`);
      setConfirming(false);
      setConfirm('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const download = async (slate) => {
    try {
      const dump = await api.get(`/slates/${slate._id}/export`);
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `slate-${String(slate.label).replace(/[^\w.-]/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setError(err.message);
    }
  };

  const ready = confirm.trim() === label.trim() && label.trim().length > 0;

  return (
    <div className="year-end">
      {notice && <p className="statement-notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="card year-end-card">
        <h2>Start a new year (new slate)</h2>
        <p className="muted">At the end of the year, this saves the whole year into a slate you can view and download, then clears the system so you can start fresh.</p>
        <ul className="year-end-what">
          <li><b>Archived first</b>, so nothing is lost: every income, expense, statement and category for the year.</li>
          <li><b>Then cleared:</b> all income, expenses, statements and their PDFs, and all categories. Receipt numbers reset, and every account’s balance is set to ₦0.</li>
          <li><b>Kept:</b> your accounts, users and roles.</li>
        </ul>
        {!confirming ? (
          <button type="button" className="danger" onClick={() => setConfirming(true)}>Start a new slate…</button>
        ) : (
          <div className="year-end-confirm">
            <Field label="Year you are closing"><input value={label} onChange={(event) => setLabel(event.target.value)} /></Field>
            <Field label={`Type ${label || 'the year'} to confirm`}><input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder={label} /></Field>
            <p className="year-end-warn">This clears the whole system for everyone. The year is archived first, so it is saved — but the live data is wiped.</p>
            <div className="row">
              <button type="button" className="secondary" onClick={() => { setConfirming(false); setConfirm(''); }}>Cancel</button>
              <button type="button" className="danger" disabled={busy || !ready} onClick={start}>{busy ? 'Working…' : `Archive ${label} and clear`}</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Past slates</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : slates.length === 0 ? (
          <p className="muted">No years have been closed yet.</p>
        ) : (
          <table className="slate-table">
            <thead><tr><th>Year</th><th>Income</th><th>Expenses</th><th>Net</th><th>Closed</th><th aria-hidden="true" /></tr></thead>
            <tbody>
              {slates.map((slate) => (
                <tr key={slate._id}>
                  <td><b>{slate.label}</b></td>
                  <td>{naira(slate.summary?.incomeKobo)}</td>
                  <td>{naira(slate.summary?.expenseKobo)}</td>
                  <td>{naira(slate.summary?.netKobo)}</td>
                  <td>{fmtDate(slate.createdAt)}{slate.createdBy?.name ? ` · ${slate.createdBy.name}` : ''}</td>
                  <td><button type="button" className="secondary" onClick={() => download(slate)}>Download</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
