import { useState } from 'react';
import Field from './Field';

export default function VoidDialog({ title, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 3) return setError('Give a reason for voiding');
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <div className="modal">
      <form className="card" onSubmit={submit}>
        <h3>{title}</h3>
        <p>The entry stays on record, marked void, and no longer counts in totals.</p>
        <Field label="Reason" error={error}>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="row">
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button className="danger" disabled={busy}>Void entry</button>
        </div>
      </form>
    </div>
  );
}
