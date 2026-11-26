import { useEffect, useState } from 'react';
import { api } from '../api';
import { useLiveRefresh } from '../realtime/RealtimeProvider';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const keyLabel = (key) => { const [y, m] = key.split('-'); return `${MONTHS_SHORT[Number(m) - 1]} '${y.slice(2)}`; };

// A grid of accounts (rows) × months (columns), ticked where a statement has been imported for that
// account and month, so you can see exactly which account is missing which month.
export default function CoverageMatrix() {
  const live = useLiveRefresh(['statements']);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.get('/statements/coverage')
      .then((d) => { if (alive) { setData(d); setError(''); } })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [live]);

  if (error) return <div className="statement-coverage statement-coverage--gaps">Couldn’t load coverage: {error}</div>;
  if (!data || !data.months?.length) return null;

  const { months, accounts } = data;
  return (
    <div className="coverage-matrix card">
      <div className="coverage-matrix__scroll">
        <table className="coverage-table">
          <thead>
            <tr>
              <th className="coverage-table__acct">Account</th>
              {months.map((k) => <th key={k} scope="col">{keyLabel(k)}</th>)}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const set = new Set(a.covered);
              return (
                <tr key={a._id}>
                  <th className="coverage-table__acct" scope="row"><b>{a.name}</b>{a.bankName ? <small>{a.bankName}</small> : null}</th>
                  {months.map((k) => {
                    const has = set.has(k);
                    return (
                      <td key={k} className={has ? 'cov-yes' : 'cov-no'} title={`${a.name} · ${keyLabel(k)} · ${has ? 'statement imported' : 'no statement'}`}>
                        {has ? '✓' : '–'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="coverage-matrix__legend">
        <span className="cov-dot cov-dot--yes" /> Statement imported
        <span className="cov-dot cov-dot--no" /> No statement
      </p>
    </div>
  );
}
