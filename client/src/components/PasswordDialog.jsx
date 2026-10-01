import { useEffect, useRef, useState } from 'react';
import Field from './Field';

const FOCUSABLE = 'button:not([disabled]), textarea, input, select, [href], [tabindex]:not([tabindex="-1"])';

// Changing your own password (askCurrent) proves you know the current one; an admin reset does not.
export default function PasswordDialog({ title, askCurrent = false, onSubmit, onCancel }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);
  const firstRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    firstRef.current?.focus();
    return () => { if (opener && typeof opener.focus === 'function') opener.focus(); };
  }, []);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    if (e.key !== 'Tab') return;
    const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (askCurrent && !current) errs.currentPassword = 'Enter your current password';
    if (next.length < 8) errs.newPassword = 'Password must be at least 8 characters';
    else if (next !== confirm) errs.confirm = 'The two passwords do not match';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onSubmit(askCurrent ? { currentPassword: current, newPassword: next } : { newPassword: next });
    } catch (err) {
      setErrors({ ...err.fields, form: err.fields && Object.keys(err.fields).length ? '' : err.message });
      setBusy(false);
    }
  };

  return (
    <div className="modal">
      <form ref={dialogRef} className="card" role="dialog" aria-modal="true" aria-labelledby="password-dialog-title" onKeyDown={onKeyDown} onSubmit={submit}>
        <h3 id="password-dialog-title">{title}</h3>
        {askCurrent && (
          <Field label="Current password" error={errors.currentPassword}>
            <input ref={firstRef} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
        )}
        <Field label="New password" error={errors.newPassword || errors.password}>
          <input ref={askCurrent ? undefined : firstRef} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password" error={errors.confirm}>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <p className="muted">At least 8 characters. A short phrase is easier to remember and harder to guess.</p>
        {errors.form && <p className="error" role="alert">{errors.form}</p>}
        <div className="row modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        </div>
      </form>
    </div>
  );
}
