import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useStoredState } from '../hooks/useStoredState';

// A one-time "what's new" modal for admins. Bump UPDATE_ID when there is a new thing to announce and
// everyone who can see it will be shown it once more. "Seen" is remembered per browser, which is fine
// for an announcement — the worst case is seeing it again on a new device.
export const UPDATE_ID = 'reports-category-drilldown-2026-10';
export const SEEN_KEY = 'solucio:seen-update';

export default function UpdateAnnouncement() {
  const { isAdmin, can } = useAuth();
  const navigate = useNavigate();
  const [seen, setSeen] = useStoredState(SEEN_KEY, '');
  const primaryRef = useRef(null);

  // Only the people who can actually use the feature — admins and the maintenance super-user — are told.
  const eligible = isAdmin || can('accounts.manage');
  const show = eligible && seen !== UPDATE_ID;

  useEffect(() => {
    if (!show) return undefined;
    const opener = document.activeElement;
    primaryRef.current?.focus();
    return () => { if (opener && typeof opener.focus === 'function') opener.focus(); };
  }, [show]);

  if (!show) return null;

  const dismiss = () => setSeen(UPDATE_ID);
  const viewIt = () => { setSeen(UPDATE_ID); navigate('/reports'); };
  const onKeyDown = (e) => { if (e.key === 'Escape') { e.preventDefault(); dismiss(); } };

  return (
    <div className="modal">
      <div className="card update-modal" role="dialog" aria-modal="true" aria-labelledby="update-title" onKeyDown={onKeyDown}>
        <span className="update-badge">New update</span>
        <h3 id="update-title">Drill into your report categories</h3>
        <p>On the <strong>Reports</strong> page, you can now click any category under <strong>Spending by category</strong> or <strong>Income by category</strong> to expand it and see the breakdown by sub-item — each item’s amount and share.</p>
        <p className="muted">Look for the categories with a small ▸ arrow; click one to open or close its items.</p>
        <div className="row modal-actions">
          <button type="button" className="secondary" onClick={dismiss}>Got it</button>
          <button type="button" ref={primaryRef} onClick={viewIt}>View it on Reports</button>
        </div>
      </div>
    </div>
  );
}
