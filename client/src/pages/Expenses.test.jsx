import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../auth/AuthContext';
import Expenses from './Expenses';
import { api } from '../api';

vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn(), blob: vi.fn() } }));

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

describe('filtering by category, group and item', () => {
  const richCategories = [{
    type: 'Recurrent',
    groups: [
      { name: 'Staff Wages', items: [] },
      { name: 'Hospital Consumables', items: ['Oxygen', 'Drugs'] },
    ],
  }];
  const expenseCalls = () => api.get.mock.calls.filter((c) => c[0] === '/expenses').map((c) => c[1]);

  beforeEach(() => {
    api.get.mockImplementation((path) => Promise.resolve(
      path === '/accounts' ? [{ _id: 'a1', name: 'Main', type: 'cash' }]
        : path === '/categories' ? richCategories
          : { items: [row], total: 1 }
    ));
  });

  test('the group filter appears once a type is chosen, and the item filter once a group with items is chosen', async () => {
    renderExpenses(['expenses.view']);
    await screen.findByText('Recurrent › Staff Wages');
    expect(screen.queryByLabelText('Group')).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText('Type'), 'Recurrent');
    expect(screen.getByLabelText('Group')).toBeInTheDocument();
    expect(screen.queryByLabelText('Item')).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText('Group'), 'Hospital Consumables');
    expect(screen.getByLabelText('Item')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Item')).getByText('Oxygen')).toBeInTheDocument();
  });

  test('choosing a group or item asks the server to filter by it', async () => {
    renderExpenses(['expenses.view']);
    await screen.findByText('Recurrent › Staff Wages');
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'Recurrent');
    await userEvent.selectOptions(screen.getByLabelText('Group'), 'Hospital Consumables');
    expect(expenseCalls().at(-1)).toMatchObject({ type: 'Recurrent', group: 'Hospital Consumables' });

    await userEvent.selectOptions(screen.getByLabelText('Item'), 'Oxygen');
    expect(expenseCalls().at(-1)).toMatchObject({ type: 'Recurrent', group: 'Hospital Consumables', item: 'Oxygen' });
  });

  test('choosing a different type clears the group and item that no longer apply', async () => {
    renderExpenses(['expenses.view']);
    await screen.findByText('Recurrent › Staff Wages');
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'Recurrent');
    await userEvent.selectOptions(screen.getByLabelText('Group'), 'Hospital Consumables');
    await userEvent.selectOptions(screen.getByLabelText('Item'), 'Oxygen');

    await userEvent.selectOptions(screen.getByLabelText('Type'), '');
    expect(screen.queryByLabelText('Group')).toBeNull();
    expect(expenseCalls().at(-1)).toMatchObject({ type: '', group: '', item: '' });
  });
});

describe('exporting the filtered list', () => {
  beforeEach(() => {
    api.blob.mockResolvedValue(new Blob(['x']));
  });

  test('exports with the current filters, sending the category type as categoryType', async () => {
    renderExpenses(['expenses.view']);
    await screen.findByText('Recurrent › Staff Wages');
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'Recurrent');
    await userEvent.selectOptions(screen.getByLabelText('Format'), 'pdf');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(api.blob).toHaveBeenCalledWith('/reports/export', expect.objectContaining({ type: 'expenses', format: 'pdf', categoryType: 'Recurrent' }));
  });
});
