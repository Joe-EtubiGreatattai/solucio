import { useEffect, useRef, useState } from 'react';
import Field from './Field';

const FOCUSABLE = 'button:not([disabled]), textarea, input, select, [href], [tabindex]:not([tabindex="-1"])';

export default function VoidDialog({ title, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);
  const reasonRef = useRef(null);

  // Move focus in on open and give it back to whatever opened the dialog on close.
  useEffect(() => {
    const opener = document.activeElement;
    reasonRef.current?.focus();
    return () => { if (opener && typeof opener.focus === 'function') opener.focus(); };
  }, []);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key !== 'Tab') return;
    // Keep Tab inside the dialog so keyboard users never land on the page behind it.
    const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

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
      <form
        ref={dialogRef}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="void-dialog-title"
        onKeyDown={onKeyDown}
        onSubmit={submit}
      >
        <h3 id="void-dialog-title">{title}</h3>
        <p>The entry stays on record, marked void, and no longer counts in totals.</p>
        <Field label="Reason" error={error}>
          <textarea ref={reasonRef} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="row">
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button className="danger" disabled={busy}>Void entry</button>
        </div>
      </form>
    </div>
  );
}
