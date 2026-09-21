import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { visibleNav } from '../nav';

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const access = useAuth();
  const actions = visibleNav(access).map((item) => ({ label: `Open ${item.label}`, to: item.to }));

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const matches = actions.filter((action) => action.label.toLowerCase().includes(query.toLowerCase()));
  const choose = (to) => { navigate(to); setOpen(false); setQuery(''); };

  return (
    <>
      <button type="button" className="command-trigger" onClick={() => setOpen(true)} aria-label="Search pages and actions">Search <kbd>⌘ K</kbd></button>
      {open && (
        <div className="command-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="command-palette" role="dialog" aria-modal="true" aria-label="Search pages and actions" onMouseDown={(event) => event.stopPropagation()}>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and actions…" aria-label="Search pages and actions" />
            <div className="command-results">
              {matches.map((action) => <button key={action.to} type="button" onClick={() => choose(action.to)}>{action.label}</button>)}
              {!matches.length && <p className="muted">No matching pages or actions.</p>}
            </div>
            <small className="muted">Esc to close</small>
          </section>
        </div>
      )}
    </>
  );
}
