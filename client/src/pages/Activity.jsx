import { useEffect, useState } from 'react';
import { api } from '../api';
import Field from '../components/Field';
import TableWrap from '../components/TableWrap';
import { ACTIONS, actionLabel, describeActivity } from '../utils/activity';
import { formatDateTime } from '../utils/dates';
import { TableSkeleton } from '../components/Skeleton';

const LIMIT = 50;

export default function Activity() {
  const [filters, setFilters] = useState({ from: '', to: '', actorId: '', action: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);

  useEffect(() => {
    api.get('/users').then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    let ignore = false;
    api.get('/audit-logs', { ...filters, page, limit: LIMIT })
      .then((d) => { if (!ignore) { setData(d); setError(''); } })
      .catch((e) => { if (!ignore) setError(e.message); })
      .finally(() => { if (!ignore) setLoaded(true); });
    return () => { ignore = true; };
  }, [filters, page]);

  const setFilter = (key) => (e) => {
    setFilters({ ...filters, [key]: e.target.value });
    setPage(1);
  };
  const filtered = !!(filters.from || filters.to || filters.actorId || filters.action);
  const start = (page - 1) * LIMIT + 1;
  const end = Math.min(page * LIMIT, data.total);

  return (
    <>
      <div className="page-title-row">
        <div><h1>Activity</h1><p className="muted">Everything done in the system, newest first.</p></div>
      </div>
      <details className="workspace-disclosure workspace-disclosure-compact">
        <summary>Filter activity{filtered && ' (active)'}</summary>
        <div className="card grid">
        <Field label="From"><input type="date" value={filters.from} onChange={setFilter('from')} /></Field>
        <Field label="To"><input type="date" value={filters.to} onChange={setFilter('to')} /></Field>
        <Field label="User">
          <select value={filters.actorId} onChange={setFilter('actorId')}>
            <option value="">Everyone</option>
            {users.map((u) => <option key={u._id} value={u._id}>{u.name} ({u.role})</option>)}
          </select>
        </Field>
        <Field label="Action">
          <select value={filters.action} onChange={setFilter('action')}>
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Field>
        </div>
      </details>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="card">
        <TableWrap label="Activity log">
          <table>
            <thead>
              <tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr>
            </thead>
            {!loaded ? <TableSkeleton columns={4} label="Loading…" /> : <tbody>
              {data.items.map((entry) => (
                <tr key={entry._id}>
                  <td>{formatDateTime(entry.createdAt)}</td>
                  <td>
                    {entry.actor ? (
                      <>
                        <div>{entry.actor.name}</div>
                        <small className="muted">{entry.actor.role}</small>
                      </>
                    ) : 'Unknown user'}
                  </td>
                  <td>{actionLabel(entry.action)}</td>
                  <td>{describeActivity(entry)}</td>
                </tr>
              ))}
              {loaded && data.items.length === 0 && (
                <tr><td colSpan={4}>{filtered ? 'No activity matches these filters.' : 'No activity recorded yet.'}</td></tr>
              )}
            </tbody>}
          </table>
        </TableWrap>
        {data.total > 0 && (
          <div className="row pager">
            <span>{`Showing ${start}–${end} of ${data.total}`}</span>
            <button type="button" className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button type="button" className="secondary" disabled={page * LIMIT >= data.total} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </div>
    </>
  );
}
