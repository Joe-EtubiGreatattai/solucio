import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

// A tiny background job queue for slow write actions (saving a statement review, approving, etc.). Callers
// hand it a label and a function that returns a promise; the queue runs jobs one at a time so edits apply
// in order, tracks each job's status for the on-screen widget, and lets failed jobs be retried. Because the
// actual network call runs inside the queue — not the component that scheduled it — the reviewer can move
// on (even to another page) while saves finish in the background.

// Default value: with no provider (e.g. in unit tests), a job just runs inline. Components stay usable
// without having to wrap every test in the provider.
const inlineQueue = {
  jobs: [],
  enqueue: ({ run }) => Promise.resolve().then(run),
  retry: () => {},
  dismiss: () => {},
  clearFinished: () => {},
};
const ActionQueueContext = createContext(inlineQueue);
export const useActionQueue = () => useContext(ActionQueueContext);

let seq = 0;

export function ActionQueueProvider({ children, autoDismissMs = 2500 }) {
  const [jobs, setJobs] = useState([]); // display only: { id, label, status, error }
  const store = useRef(new Map()); // id -> { run, resolve, reject }
  const pending = useRef([]); // ids waiting to run, in order
  const busy = useRef(false);

  const setStatus = useCallback((id, status, error) => {
    setJobs((list) => list.map((j) => (j.id === id ? { ...j, status, error } : j)));
  }, []);
  const drop = useCallback((id) => {
    store.current.delete(id);
    setJobs((list) => list.filter((j) => j.id !== id));
  }, []);

  // Run the next pending job, then the one after it. Only one runs at a time.
  const pump = useCallback(async () => {
    if (busy.current) return;
    const id = pending.current.shift();
    if (!id) return;
    const entry = store.current.get(id);
    if (!entry) return;
    busy.current = true;
    setStatus(id, 'running');
    try {
      const result = await entry.run();
      setStatus(id, 'done');
      entry.resolve(result);
      if (autoDismissMs) setTimeout(() => drop(id), autoDismissMs);
    } catch (err) {
      setStatus(id, 'error', err?.message || 'Could not complete');
      entry.reject(err);
    } finally {
      busy.current = false;
      pump();
    }
  }, [setStatus, drop, autoDismissMs]);

  const enqueue = useCallback(({ label, run }) => new Promise((resolve, reject) => {
    const id = `q${++seq}`;
    store.current.set(id, { run, resolve, reject });
    setJobs((list) => [...list, { id, label, status: 'pending' }]);
    pending.current.push(id);
    pump();
  }), [pump]);

  // Re-run a failed job. Its original promise already rejected, so callers recover via the live refresh
  // that a successful save triggers; this just gets the work done.
  const retry = useCallback((id) => {
    const entry = store.current.get(id);
    if (!entry) return;
    entry.resolve = () => {};
    entry.reject = () => {};
    setStatus(id, 'pending');
    pending.current.push(id);
    pump();
  }, [pump, setStatus]);

  const dismiss = useCallback((id) => drop(id), [drop]);
  const clearFinished = useCallback(() => {
    setJobs((list) => list.filter((j) => j.status === 'pending' || j.status === 'running'));
  }, []);

  const value = useMemo(() => ({ jobs, enqueue, retry, dismiss, clearFinished }), [jobs, enqueue, retry, dismiss, clearFinished]);
  return <ActionQueueContext.Provider value={value}>{children}</ActionQueueContext.Provider>;
}
