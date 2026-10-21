import { useState } from 'react';
import { useActionQueue } from '../queue/ActionQueueProvider';

// Top-right indicator for the background action queue. Shows how many saves are in flight and, when opened,
// the list of jobs with their status; failed jobs can be retried or dismissed. Renders nothing when idle.
export default function QueueWidget() {
  const { jobs, retry, dismiss } = useActionQueue();
  const [open, setOpen] = useState(false);
  if (!jobs.length) return null;

  const active = jobs.filter((j) => j.status === 'pending' || j.status === 'running').length;
  const errors = jobs.filter((j) => j.status === 'error').length;
  const label = errors ? `${errors} failed` : active ? `Saving ${active}` : 'Saved';

  const statusIcon = { pending: '•', running: '⟳', done: '✓', error: '!' };

  return (
    <div className={`queue-widget ${errors ? 'has-errors' : ''}`}>
      <button type="button" className="queue-pill" aria-expanded={open} aria-label={`Background tasks: ${label}`} onClick={() => setOpen((o) => !o)}>
        <span className={`queue-dot ${active ? 'spinning' : errors ? 'error' : 'ok'}`} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {open && (
        <div className="queue-panel" role="dialog" aria-label="Background tasks">
          <div className="queue-panel-head"><b>Background tasks</b></div>
          <ul className="queue-list">
            {jobs.map((job) => (
              <li key={job.id} className={`queue-item ${job.status}`}>
                <span className={`queue-status ${job.status}`} aria-hidden="true">{statusIcon[job.status]}</span>
                <span className="queue-item-label">{job.label}{job.status === 'error' && job.error ? <small>{job.error}</small> : null}</span>
                {job.status === 'error' && (
                  <span className="queue-item-actions">
                    <button type="button" className="link" onClick={() => retry(job.id)}>Retry</button>
                    <button type="button" className="link" onClick={() => dismiss(job.id)}>Dismiss</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
