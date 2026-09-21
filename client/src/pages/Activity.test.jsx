import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Activity from './Activity';
import { api } from '../api';

vi.mock('../api', () => ({ api: { get: vi.fn() } }));

const users = [
  { _id: 'u1', name: 'Chioma Okafor', role: 'cashier' },
  { _id: 'u2', name: 'Ada Admin', role: 'admin' },
];
const items = [
  { _id: 'l1', action: 'income.create', createdAt: '2026-09-21T10:30:00.000Z', actor: { name: 'Chioma Okafor', role: 'cashier' }, details: { receiptNumber: 'RCP-2026-0007', amount: 150050 } },
  { _id: 'l2', action: 'user.update', createdAt: '2026-09-20T09:00:00.000Z', actor: { name: 'Ada Admin', role: 'admin' }, details: { name: 'Tunde Bello', email: 't@x.com', changes: { role: 'accountant' }, passwordReset: true } },
  { _id: 'l3', action: 'auth.login', createdAt: '2026-09-19T08:00:00.000Z', actor: null, details: { email: 'gone@x.com' } },
];
const route = (page = { items, total: 3 }) => (path) => Promise.resolve(path === '/users' ? users : page);

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(route());
});

test('lists who did what and when, in plain words', async () => {
  render(<Activity />);
  expect(await screen.findByText('Recorded income')).toBeInTheDocument();
  const rows = screen.getAllByRole('row');
  const first = within(rows[1]);
  expect(first.getByText('21/09/2026 11:30')).toBeInTheDocument();
  expect(first.getByText('Chioma Okafor')).toBeInTheDocument();
  expect(first.getByText('cashier')).toBeInTheDocument();
  expect(first.getByText('RCP-2026-0007, ₦1,500.50')).toBeInTheDocument();
  const second = within(rows[2]);
  expect(second.getByText('Updated user')).toBeInTheDocument();
  expect(second.getByText('Tunde Bello: role → accountant, password reset')).toBeInTheDocument();
  expect(within(rows[3]).getByText('Unknown user')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Activity log' })).toBeInTheDocument();
});

test('shows Loading first, then an empty state', async () => {
  let resolveLog;
  api.get.mockImplementation((path) => (path === '/users' ? Promise.resolve(users) : new Promise((r) => { resolveLog = r; })));
  render(<Activity />);
  expect(await screen.findByText('Loading…')).toBeInTheDocument();
  resolveLog({ items: [], total: 0 });
  expect(await screen.findByText('No activity recorded yet.')).toBeInTheDocument();
});

test('filters by action, user and dates, and starts again from page 1', async () => {
  render(<Activity />);
  await screen.findByText('Recorded income');
  await userEvent.selectOptions(screen.getByLabelText('Action'), 'income.void');
  expect(api.get).toHaveBeenLastCalledWith('/audit-logs', expect.objectContaining({ action: 'income.void', page: 1 }));
  await userEvent.selectOptions(screen.getByLabelText('User'), 'u1');
  expect(api.get).toHaveBeenLastCalledWith('/audit-logs', expect.objectContaining({ action: 'income.void', actorId: 'u1', page: 1 }));
  await userEvent.type(screen.getByLabelText('From'), '2026-09-01');
  expect(api.get).toHaveBeenLastCalledWith('/audit-logs', expect.objectContaining({ from: '2026-09-01' }));
});

test('says when nothing matches the filters', async () => {
  api.get.mockImplementation(route({ items: [], total: 0 }));
  render(<Activity />);
  await screen.findByText('No activity recorded yet.');
  await userEvent.selectOptions(screen.getByLabelText('Action'), 'user.create');
  expect(await screen.findByText('No activity matches these filters.')).toBeInTheDocument();
});

test('pages through long logs', async () => {
  api.get.mockImplementation(route({ items, total: 120 }));
  render(<Activity />);
  expect(await screen.findByText('Showing 1–50 of 120')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(api.get).toHaveBeenLastCalledWith('/audit-logs', expect.objectContaining({ page: 2 }));
  expect(await screen.findByText('Showing 51–100 of 120')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Showing 101–120 of 120')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});

test('shows an alert when the log cannot be loaded', async () => {
  api.get.mockImplementation((path) => (path === '/users' ? Promise.resolve(users) : Promise.reject(new Error('Cannot reach the server'))));
  render(<Activity />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
});
