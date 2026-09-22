import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../auth/AuthContext';
import Income from './Income';
import { api } from '../api';
import { viewReceipt } from '../utils/receipt';
import { features } from '../features';
import { renderLive } from '../test/live';
import { waitFor, act } from '@testing-library/react';

vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn() }, API_BASE: '', getToken: () => null }));
vi.mock('../utils/receipt', () => ({ viewReceipt: vi.fn().mockResolvedValue() }));

const ALL = ['income.view', 'income.record', 'income.void'];
const renderIncome = (perms = ALL) =>
  render(
    <AuthContext.Provider value={{ can: (p) => perms.includes(p), permissions: perms, user: { name: 'Ada', role: 'x' }, isAdmin: false }}>
      <MemoryRouter><Income /></MemoryRouter>
    </AuthContext.Provider>
  );
const accounts = [{ _id: 'a1', name: 'Main Operations', type: 'cash' }];
const saved = { _id: 'i1', receiptNumber: 'RCP-2026-0007', amount: 150050, method: 'transfer', date: '2026-09-20T23:00:00.000Z', account: 'a1' };

beforeEach(() => {
  features.receipts = true; // most tests here use the receipt buttons; the switch is tested at the bottom
  vi.clearAllMocks();
  api.get.mockImplementation((path) => Promise.resolve(path === '/accounts' ? accounts : { items: [], total: 0 }));
  api.post.mockResolvedValue(saved);
});

test('shows an alert when accounts fail to load', async () => {
  api.get.mockImplementation((path) => (path === '/accounts' ? Promise.reject(new Error('Accounts unavailable')) : Promise.resolve({ items: [], total: 0 })));
  renderIncome();
  expect(await screen.findByRole('alert')).toHaveTextContent('Accounts unavailable');
});

test('recording a payment shows a success confirmation and does not open the receipt by itself', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  renderIncome();
  await userEvent.type(screen.getByLabelText('Amount (₦)'), '1,500.50');
  await userEvent.selectOptions(await screen.findByLabelText('Account'), 'a1');
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));

  expect(await screen.findByRole('status')).toHaveTextContent('Payment recorded');
  expect(screen.getByText('RCP-2026-0007')).toBeInTheDocument();
  expect(open).not.toHaveBeenCalled();
  expect(viewReceipt).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: 'View receipt' }));
  expect(viewReceipt).toHaveBeenCalledWith('i1');
  open.mockRestore();
});

test('shows Loading before the first response, then an empty state that says what to do', async () => {
  let resolveList;
  api.get.mockImplementation((path) => (path === '/accounts'
    ? Promise.resolve(accounts)
    : new Promise((resolve) => { resolveList = resolve; })));
  renderIncome();
  expect(await screen.findByText('Loading…')).toBeInTheDocument();
  expect(screen.queryByText(/No payments yet/)).toBeNull();
  resolveList({ items: [], total: 0 });
  expect(await screen.findByText(/No payments yet/)).toBeInTheDocument();
  expect(screen.queryByText('Loading…')).toBeNull();
});

test('row actions say which entry they act on', async () => {
  const row = { _id: 'i9', receiptNumber: 'RCP-2026-0042', amount: 150000, method: 'pos', date: '2026-09-20T23:00:00.000Z', account: { name: 'Main Operations', type: 'cash' }, recordedBy: { name: 'Chioma' }, voided: false };
  api.get.mockImplementation((path) => Promise.resolve(path === '/accounts' ? accounts : { items: [row], total: 1 }));
  renderIncome();
  expect(await screen.findByRole('button', { name: 'View receipt RCP-2026-0042' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Void RCP-2026-0042' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Income entries' })).toBeInTheDocument();
});

test('the confirmation can be dismissed', async () => {
  renderIncome();
  await userEvent.type(screen.getByLabelText('Amount (₦)'), '100');
  await userEvent.selectOptions(await screen.findByLabelText('Account'), 'a1');
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Record another payment' }));
  expect(screen.queryByRole('status')).toBeNull();
});

describe('what a role is allowed to do on this page', () => {
  const row = { _id: 'i9', receiptNumber: 'RCP-2026-0042', amount: 150000, method: 'pos', date: '2026-09-20T23:00:00.000Z', account: { name: 'Main Operations', type: 'cash' }, recordedBy: { name: 'Chioma' }, voided: false };
  beforeEach(() => {
    api.get.mockImplementation((path) => Promise.resolve(path === '/accounts' ? accounts : { items: [row], total: 1 }));
  });

  test('view only: sees the list but cannot record or void', async () => {
    renderIncome(['income.view']);
    expect(await screen.findByRole('button', { name: 'View receipt RCP-2026-0042' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Void RCP-2026-0042' })).toBeNull();
  });

  test('view and record without void: no Void buttons', async () => {
    renderIncome(['income.view', 'income.record']);
    expect(await screen.findByRole('button', { name: 'View receipt RCP-2026-0042' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Void RCP-2026-0042' })).toBeNull();
  });

  test('record only: can record, never asks for the list, and gets no receipt button', async () => {
    renderIncome(['income.record']);
    await userEvent.type(screen.getByLabelText('Amount (₦)'), '100');
    await userEvent.selectOptions(await screen.findByLabelText('Account'), 'a1');
    await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Payment recorded');
    expect(screen.queryByRole('button', { name: 'View receipt' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Income entries' })).toBeNull();
    expect(api.get).not.toHaveBeenCalledWith('/incomes', expect.anything());
  });
});

describe('the receipt PDF switch (features.receipts)', () => {
  const row = { _id: 'i9', receiptNumber: 'RCP-2026-0042', amount: 150000, method: 'pos', date: '2026-09-20T23:00:00.000Z', account: { name: 'Main Operations', type: 'cash' }, recordedBy: { name: 'Chioma' }, voided: false };

  afterEach(() => { features.receipts = true; });

  test('it ships switched off', async () => {
    vi.resetModules();
    const fresh = await import('../features');
    expect(fresh.features.receipts).toBe(false);
  });

  test('off: the list has no receipt PDF link, but still shows the receipt number', async () => {
    features.receipts = false;
    api.get.mockImplementation((path) => Promise.resolve(path === '/accounts' ? accounts : { items: [row], total: 1 }));
    renderIncome();
    expect(await screen.findByText('RCP-2026-0042')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View receipt/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Void RCP-2026-0042' })).toBeInTheDocument();
  });

  test('off: recording a payment confirms it with its number but offers no PDF', async () => {
    features.receipts = false;
    renderIncome();
    await userEvent.type(screen.getByLabelText('Amount (₦)'), '100');
    await userEvent.selectOptions(await screen.findByLabelText('Account'), 'a1');
    await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Payment recorded');
    expect(screen.getByRole('status')).toHaveTextContent('RCP-2026-0007');
    expect(screen.queryByRole('button', { name: 'View receipt' })).toBeNull();
    expect(viewReceipt).not.toHaveBeenCalled();
  });

  test('on: both receipt buttons come back', async () => {
    features.receipts = true;
    api.get.mockImplementation((path) => Promise.resolve(path === '/accounts' ? accounts : { items: [row], total: 1 }));
    renderIncome();
    expect(await screen.findByRole('button', { name: 'View receipt RCP-2026-0042' })).toBeInTheDocument();
  });
});

describe('live updates', () => {
  const calls = (path) => api.get.mock.calls.filter((c) => c[0] === path).length;

  test('the list reloads when someone else records or voids income', async () => {
    const { socket } = renderLive(<MemoryRouter><Income /></MemoryRouter>);
    await waitFor(() => expect(calls('/incomes')).toBe(1));
    act(() => socket.fire('data:changed', { resource: 'incomes', action: 'create', id: 'x' }));
    await waitFor(() => expect(calls('/incomes')).toBe(2));
  });

  test('a change to something else does not reload it', async () => {
    const { socket } = renderLive(<MemoryRouter><Income /></MemoryRouter>);
    await waitFor(() => expect(calls('/incomes')).toBe(1));
    act(() => socket.fire('data:changed', { resource: 'expenses', action: 'create', id: 'x' }));
    await new Promise((r) => setTimeout(r, 450));
    expect(calls('/incomes')).toBe(1);
  });

  test('the account choices refresh when an account is added', async () => {
    const { socket } = renderLive(<MemoryRouter><Income /></MemoryRouter>);
    await waitFor(() => expect(calls('/accounts')).toBe(1));
    act(() => socket.fire('data:changed', { resource: 'accounts', action: 'create', id: 'x' }));
    await waitFor(() => expect(calls('/accounts')).toBe(2));
  });
});
