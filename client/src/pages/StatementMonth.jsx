import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useLiveRefresh } from '../realtime/RealtimeProvider';
import { formatDate } from '../utils/dates';
import { Skeleton } from '../components/Skeleton';
import { unresolvedCount, periodLabel, monthLabel } from './statementUtils';

// The statements covering one month, opened from a month box on the library page.
export default function StatementMonth() {
  const { monthKey } = useParams();
  const navigate = useNavigate();
  const live = useLiveRefresh(['statements']);
  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get('/statements', { month: monthKey, limit: 200 });
      setStatements(Array.isArray(data) ? data : (data?.items ?? []));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [monthKey, live]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const valid = /^\d{4}-\d{2}$/.test(monthKey || '');
  const title = valid ? monthLabel(`${monthKey}-01`) : 'Month';

  return (
    <>
      <div className="statements-page-head">
        <div>
          <Link to="/statements" className="statement-back">← All months</Link>
          <h1>{title}</h1>
          <p className="muted">Statements covering {title}.</p>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {loading ? (
        <div className="statement-loading" aria-busy="true"><Skeleton label="Loading statements…" /><Skeleton /></div>
      ) : statements.length === 0 ? (
        <div className="card statement-blank"><span>⌁</span><h2>No statement for {title}</h2><p>No bank statement covering this month has been imported yet.</p></div>
      ) : (
        <div className="statement-library" role="list" aria-label={`Statements covering ${title}`}>
          {statements.map((entry) => {
            const unresolved = entry.unresolvedCount ?? unresolvedCount(entry);
            const count = entry.transactionCount ?? entry.transactions?.length ?? 0;
            const period = periodLabel(entry.periodStart, entry.periodEnd);
            return (
              <button type="button" role="listitem" key={entry._id} className="statement-card" onClick={() => navigate(`/statements/${entry._id}`)} title={`Imported ${formatDate(entry.createdAt)}`}>
                <span className="statement-list-file">PDF</span>
                <div className="statement-card-body">
                  <b>{entry.fileName}</b>
                  <small>{entry.account?.name || 'Unknown account'} · {count} transactions{period ? ` · covers ${period}` : ''}</small>
                </div>
                <span className={entry.status === 'approved' ? 'approved-lock' : unresolved ? 'review-count' : 'ready-count'}>
                  {entry.status === 'approved' ? 'Approved' : unresolved ? `${unresolved} to review` : 'Ready'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
