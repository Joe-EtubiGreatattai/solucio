import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// A one-time "what's new" modal for admins. Bump UPDATE_ID when there is a new thing to announce and
// everyone who can see it will be shown it once more. "Seen" is stored on the user record (server-side),
// so dismissing it once hides it on every device that person signs in from.
export const UPDATE_ID = 'new-slate-year-end-2026-11';

export default function UpdateAnnouncement() {
  const { isAdmin, can, user, markUpdateSeen } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const primaryRef = useRef(null);

  // Only the people who can actually use the feature — admins and the maintenance super-user — are told.
  const eligible = isAdmin || can('slate.manage');
  const alreadySeen = (user?.seenUpdates || []).includes(UPDATE_ID);
  const show = eligible && !alreadySeen && !dismissed;

  useEffect(() => {
    if (!show) return undefined;
    const opener = document.activeElement;
    primaryRef.current?.focus();
    return () => { if (opener && typeof opener.focus === 'function') opener.focus(); };
  }, [show]);

  if (!show) return null;

  const dismiss = () => { setDismissed(true); markUpdateSeen(UPDATE_ID); };
  const viewIt = () => { setDismissed(true); markUpdateSeen(UPDATE_ID); navigate('/admin'); };
  const onKeyDown = (e) => { if (e.key === 'Escape') { e.preventDefault(); dismiss(); } };

  return (
    <div className="modal">
      <div className="card update-modal" role="dialog" aria-modal="true" aria-labelledby="update-title" onKeyDown={onKeyDown}>
        <span className="update-badge">New update</span>
        <h3 id="update-title">Close the year with a new slate</h3>
        <p>There’s a new <strong>Year end</strong> tab in <strong>Admin</strong>. At the end of the year, <strong>New slate</strong> saves the whole year into a slate you can view and download, then clears the system for a fresh start.</p>
        <p className="muted">It archives everything first, so nothing is lost — then clears income, expenses, statements and categories, resets receipt numbers and zeroes every account’s balance. Super-admins only.</p>
        <div className="row modal-actions">
          <button type="button" className="secondary" onClick={dismiss}>Got it</button>
          <button type="button" ref={primaryRef} onClick={viewIt}>Open Year end</button>
        </div>
      </div>
    </div>
  );
}
