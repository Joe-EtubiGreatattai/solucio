import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionQueueProvider, useActionQueue } from './ActionQueueProvider';

// A tiny harness that exposes enqueue and renders the job list so tests can observe queue state.
function Harness({ onReady }) {
  const q = useActionQueue();
  onReady?.(q);
  return (
    <ul>
      {q.jobs.map((j) => <li key={j.id} data-status={j.status}>{j.label}:{j.status}{j.error ? `:${j.error}` : ''}</li>)}
    </ul>
  );
}

const renderQueue = () => {
  let api;
  render(
    <ActionQueueProvider autoDismissMs={0}>
      <Harness onReady={(q) => { api = q; }} />
    </ActionQueueProvider>
  );
  return () => api;
};

test('runs queued jobs one at a time, in order', async () => {
  const get = renderQueue();
  const order = [];
  const makeJob = (name) => {
    let release;
    const gate = new Promise((r) => { release = r; });
    return { name, release, run: () => gate.then(() => { order.push(name); return name; }) };
  };
  const a = makeJob('A');
  const b = makeJob('B');
  act(() => { get().enqueue({ label: 'A', run: a.run }); get().enqueue({ label: 'B', run: b.run }); });

  // A runs first; B waits even though it was enqueued immediately.
  await waitFor(() => expect(screen.getByText('A:running')).toBeInTheDocument());
  expect(screen.getByText('B:pending')).toBeInTheDocument();

  await act(async () => { a.release(); });
  await waitFor(() => expect(screen.getByText('B:running')).toBeInTheDocument());
  await act(async () => { b.release(); });
  await waitFor(() => expect(screen.getByText('B:done')).toBeInTheDocument());
  expect(order).toEqual(['A', 'B']);
});

test('a failed job is marked error and can be retried', async () => {
  const get = renderQueue();
  let attempts = 0;
  const run = () => { attempts += 1; return attempts === 1 ? Promise.reject(new Error('network blip')) : Promise.resolve('ok'); };
  await act(async () => { get().enqueue({ label: 'Save', run }).catch(() => {}); });

  await waitFor(() => expect(screen.getByText('Save:error:network blip')).toBeInTheDocument());
  act(() => { get().retry(get().jobs[0].id); });
  await waitFor(() => expect(screen.getByText('Save:done')).toBeInTheDocument());
  expect(attempts).toBe(2);
});

test('enqueue resolves with the job result for the caller', async () => {
  const get = renderQueue();
  let resolved;
  await act(async () => { resolved = await get().enqueue({ label: 'X', run: () => Promise.resolve(42) }); });
  expect(resolved).toBe(42);
});
