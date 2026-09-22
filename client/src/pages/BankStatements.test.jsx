import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BankStatements from './BankStatements';
import { api } from '../api';
import { renderLive } from '../test/live';

vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), uploadPdf: vi.fn() }, API_BASE: '', getToken: () => null }));

const account = { _id: 'a1', name: 'Main Operations', type: 'bank', bankName: 'GTBank', accountNumber: '0123456789' };
const categories = [{ type: 'Recurrent', groups: [{ name: 'Servicing & Maintenance', items: ['Electricity', 'Fuel'] }] }];
const expenseTx = { _id: 't1', date: '2026-07-15', narration: 'IBEDC PREPAID METER', amount: 975000, direction: 'expense', type: 'Recurrent', group: 'Servicing & Maintenance', item: 'Electricity', confidence: 'high', included: true };
const incomeTx = { _id: 't2', date: '2026-07-16', narration: 'NIP TFR FROM PATIENT', amount: 500000, direction: 'income', confidence: 'high', included: true };
const statement = { _id: 's1', fileName: 'july.pdf', status: 'review', createdAt: '2026-07-20', account, uploadedBy: { name: 'Ada' }, transactions: [expenseTx, incomeTx] };

const withTransactions = (transactions) => ({ ...statement, transactions });

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path === '/accounts') return Promise.resolve([account]);
    if (path === '/categories') return Promise.resolve(categories);
    if (path === '/statements') return Promise.resolve([statement]);
    return Promise.resolve([]);
  });
});

const renderPage = (auth = {}) => renderLive(<BankStatements />, { auth: { can: () => true, ...auth } });
// The narration also appears in the editor panel (it shows the selected row), so anchor on the
// table region loading rather than on narration text, which is ambiguous once something is selected.
const waitForLoaded = () => screen.findByRole('region', { name: 'Statement transactions' });

test('the transaction editor lets a reviewer switch a row between income and expense', async () => {
  api.patch.mockResolvedValue(withTransactions([{ ...expenseTx, direction: 'income' }, incomeTx]));
  renderPage();
  await waitForLoaded();
  await userEvent.click(screen.getAllByText('IBEDC PREPAID METER')[0]);
  expect(screen.getByLabelText('Treat as')).toHaveValue('expense');
  expect(screen.getByLabelText('Type')).toBeInTheDocument();

  await userEvent.selectOptions(screen.getByLabelText('Treat as'), 'income');
  expect(api.patch).toHaveBeenCalledWith('/statements/s1/transactions/t1', expect.objectContaining({ direction: 'income' }));
});

test('category selects disappear once a row is treated as income', async () => {
  renderPage();
  await waitForLoaded();
  await userEvent.click(screen.getAllByText('NIP TFR FROM PATIENT')[0]);
  expect(screen.getByLabelText('Treat as')).toHaveValue('income');
  expect(screen.queryByLabelText('Type')).toBeNull();
});

test('a transaction can be excluded and re-included from the table', async () => {
  api.patch.mockResolvedValue(withTransactions([{ ...expenseTx, included: false }, incomeTx]));
  renderPage();
  await waitForLoaded();
  await userEvent.click(screen.getByLabelText('Import IBEDC PREPAID METER'));
  expect(api.patch).toHaveBeenCalledWith('/statements/s1/transactions/t1', { included: false });
});

test('bulk buttons import only income, only expenses, or everything', async () => {
  api.patch.mockResolvedValue(statement);
  renderPage();
  await waitForLoaded();
  await userEvent.click(screen.getByRole('button', { name: 'Income only' }));
  expect(api.patch).toHaveBeenCalledWith('/statements/s1/include', { scope: 'income' });
  await userEvent.click(screen.getByRole('button', { name: 'Expenses only' }));
  expect(api.patch).toHaveBeenCalledWith('/statements/s1/include', { scope: 'expense' });
  await userEvent.click(screen.getByRole('button', { name: 'Import everything' }));
  expect(api.patch).toHaveBeenCalledWith('/statements/s1/include', { scope: 'all' });
});

test('the approve button is disabled once nothing is left included', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/accounts') return Promise.resolve([account]);
    if (path === '/categories') return Promise.resolve(categories);
    if (path === '/statements') return Promise.resolve([withTransactions([{ ...expenseTx, included: false }, { ...incomeTx, included: false }])]);
    return Promise.resolve([]);
  });
  renderPage();
  await waitForLoaded();
  expect(screen.getByRole('button', { name: 'Approve statement' })).toBeDisabled();
  expect(screen.getByText(/nothing selected/i)).toBeInTheDocument();
});

test('excluded rows are visually marked and not counted toward what still needs review', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/accounts') return Promise.resolve([account]);
    if (path === '/categories') return Promise.resolve(categories);
    if (path === '/statements') return Promise.resolve([withTransactions([
      { ...expenseTx, included: false, confidence: 'needs-review' },
      incomeTx,
    ])]);
    return Promise.resolve([]);
  });
  renderPage();
  await waitForLoaded();
  expect(screen.getByText('Ready to approve')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Approve statement' })).not.toBeDisabled();
});
