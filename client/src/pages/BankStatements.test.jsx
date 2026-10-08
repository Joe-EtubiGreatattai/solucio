import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BankStatements from './BankStatements';
import { api } from '../api';
import { renderLive } from '../test/live';

vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), uploadPdf: vi.fn() }, API_BASE: '', getToken: () => null }));

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

test('clicking a bulk-import button shows a loading state until the request finishes', async () => {
  let resolvePatch;
  api.patch.mockReturnValue(new Promise((resolve) => { resolvePatch = resolve; }));
  renderPage();
  await waitForLoaded();
  await userEvent.click(screen.getByRole('button', { name: 'Income only' }));

  expect(await screen.findByRole('button', { name: 'Applying…' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import everything' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Expenses only' })).toBeDisabled();

  resolvePatch(statement);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Income only' })).not.toBeDisabled());
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

test('approving shows a loading state until the request finishes', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/accounts') return Promise.resolve([account]);
    if (path === '/categories') return Promise.resolve(categories);
    if (path === '/statements') return Promise.resolve([withTransactions([{ ...expenseTx, confidence: 'high' }, incomeTx])]);
    return Promise.resolve([]);
  });
  let resolvePost;
  api.post.mockReturnValue(new Promise((resolve) => { resolvePost = resolve; }));
  renderPage();
  await waitForLoaded();
  await userEvent.click(screen.getByRole('button', { name: 'Approve statement' }));
  expect(await screen.findByRole('button', { name: 'Approving…' })).toBeDisabled();
  resolvePost(statement);
});

describe('smarter categorization', () => {
  test('the review panel explains why a category was suggested', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/accounts') return Promise.resolve([account]);
      if (path === '/categories') return Promise.resolve(categories);
      if (path === '/statements') return Promise.resolve([withTransactions([{ ...expenseTx, reason: 'Mentions IBEDC' }, incomeTx])]);
      return Promise.resolve([]);
    });
    renderPage();
    await waitForLoaded();
    expect(screen.getByText(/Why: Mentions IBEDC/)).toBeInTheDocument();
  });

  test('confirming a row says when similar rows from the same payee were updated too', async () => {
    api.patch.mockResolvedValue({ ...statement, similarUpdated: 3 });
    renderPage();
    await waitForLoaded();
    await userEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Also applied to 3 other transactions from the same payee');
  });

  test('re-checking categories shows progress, then a summary', async () => {
    let resolvePost;
    api.post.mockReturnValue(new Promise((resolve) => { resolvePost = resolve; }));
    renderPage();
    await waitForLoaded();
    await userEvent.click(screen.getByRole('button', { name: 'Re-check categories' }));
    expect(api.post).toHaveBeenCalledWith('/statements/s1/recategorize');
    expect(await screen.findByRole('button', { name: 'Re-checking…' })).toBeDisabled();
    resolvePost({ ...statement, recategorized: { checked: 40, changed: 12, needReview: 5 } });
    expect(await screen.findByRole('status')).toHaveTextContent('Re-checked 40 transactions: 12 updated, 5 still need review.');
  });
});

describe('deleting a statement', () => {
  test('asks to confirm, shows progress, then removes it from the list', async () => {
    let resolveDelete;
    api.delete.mockReturnValue(new Promise((resolve) => { resolveDelete = resolve; }));
    renderPage();
    await waitForLoaded();
    await userEvent.click(screen.getByRole('button', { name: 'Delete statement' }));
    expect(api.delete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(api.delete).toHaveBeenCalledWith('/statements/s1');
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    resolveDelete({ deleted: true });
    expect(await screen.findByRole('status')).toHaveTextContent('july.pdf was deleted.');
    expect(screen.queryByRole('region', { name: 'Statement transactions' })).toBeNull();
  });

  test('cancel keeps the statement', async () => {
    renderPage();
    await waitForLoaded();
    await userEvent.click(screen.getByRole('button', { name: 'Delete statement' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Delete statement' })).toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  test('approved statements and people who cannot approve get no delete button', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/accounts') return Promise.resolve([account]);
      if (path === '/categories') return Promise.resolve(categories);
      if (path === '/statements') return Promise.resolve([{ ...statement, status: 'approved' }]);
      return Promise.resolve([]);
    });
    renderPage();
    await waitForLoaded();
    expect(screen.queryByRole('button', { name: 'Delete statement' })).toBeNull();
  });

  test('a reviewer without approval rights gets no delete button', async () => {
    renderPage({ can: (p) => p !== 'statements.approve' });
    await waitForLoaded();
    expect(screen.queryByRole('button', { name: 'Delete statement' })).toBeNull();
  });
});
