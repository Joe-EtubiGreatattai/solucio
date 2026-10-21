import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionQueueProvider, useActionQueue } from '../queue/ActionQueueProvider';
import QueueWidget from './QueueWidget';

function Enqueuer({ onReady }) {
  const q = useActionQueue();
  onReady(q);
  return null;
}

const renderWidget = () => {
  let api;
  render(
    <ActionQueueProvider autoDismissMs={0}>
      <QueueWidget />
      <Enqueuer onReady={(q) => { api = q; }} />
    </ActionQueueProvider>
  );
  return () => api;
};

test('shows nothing while the queue is idle', () => {
  renderWidget();
  expect(screen.queryByRole('button', { name: /Background tasks/ })).toBeNull();
});

test('counts in-flight saves and lists them when opened', async () => {
  const get = renderWidget();
  let release;
  const run = () => new Promise((r) => { release = r; });
  act(() => { get().enqueue({ label: 'Mark reviewed: IBEDC', run }); });

  const pill = await screen.findByRole('button', { name: /Background tasks/ });
  expect(pill).toHaveTextContent('Saving 1');
  await userEvent.click(pill);
  expect(screen.getByText('Mark reviewed: IBEDC')).toBeInTheDocument();
  await act(async () => { release('done'); });
});

test('a failed save surfaces an error with a retry control', async () => {
  const get = renderWidget();
  let attempts = 0;
  const run = () => { attempts += 1; return attempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(); };
  act(() => { get().enqueue({ label: 'Approve: july.pdf', run }).catch(() => {}); });

  const pill = await screen.findByRole('button', { name: /Background tasks/ });
  await waitFor(() => expect(pill).toHaveTextContent('1 failed'));
  await userEvent.click(pill);
  expect(screen.getByText('offline')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(attempts).toBe(2));
});
