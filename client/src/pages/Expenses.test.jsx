import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../auth/AuthContext';
import Expenses from './Expenses';
import { api } from '../api';

vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

const row = { _id: 'e1', date: '2026-09-20T23:00:00.000Z', type: 'Recurrent', group: 'Staff Wages', item: null, amount: 100000, account: { name: 'Main', type: 'cash' }, voided: false };
const renderExpenses = (perms) =>
  render(
    <AuthContext.Provider value={{ can: (p) => perms.includes(p), permissions: perms, user: { name: 'Ada', role: 'x' }, isAdmin: false }}>
      <MemoryRouter><Expenses /></MemoryRouter>
    </AuthContext.Provider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((path) => Promise.resolve(
    path === '/accounts' ? [{ _id: 'a1', name: 'Main', type: 'cash' }]
      : path === '/categories' ? [{ type: 'Recurrent', groups: [{ name: 'Staff Wages', items: [] }] }]
        : { items: [row], total: 1 }
  ));
});

test('view only: sees the list, cannot record or void', async () => {
  renderExpenses(['expenses.view']);
  expect(await screen.findByText('Recurrent › Staff Wages')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Record expense' })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Void expense/ })).toBeNull();
});

test('full access: can record and void', async () => {
  renderExpenses(['expenses.view', 'expenses.record', 'expenses.void']);
  expect(await screen.findByRole('button', { name: 'Record expense' })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: /^Void expense Recurrent › Staff Wages/ })).toBeInTheDocument();
});

test('record only: can record but never asks for the list', async () => {
  renderExpenses(['expenses.record']);
  expect(await screen.findByRole('button', { name: 'Record expense' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Expense entries' })).toBeNull();
  expect(api.get).not.toHaveBeenCalledWith('/expenses', expect.anything());
});
