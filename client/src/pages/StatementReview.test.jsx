import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StatementReview from './StatementReview';
import { api } from '../api';
import { renderLive } from '../test/live';

vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), uploadPdf: vi.fn() }, API_BASE: '', getToken: () => null }));

const account = { _id: 'a1', name: 'Main Operations', type: 'bank', bankName: 'GTBank', accountNumber: '0123456789' };
const categories = [{ type: 'Recurrent', groups: [{ name: 'Servicing & Maintenance', items: ['Electricity', 'Fuel'] }] }];
const incomeCategories = [{ type: 'Diagnostics', groups: [{ name: 'Laboratory', items: [] }, { name: 'Radiology', items: ['X-ray'] }] }];
const expenseTx = { _id: 't1', date: '2026-07-15', narration: 'IBEDC PREPAID METER', amount: 975000, direction: 'expense', type: 'Recurrent', group: 'Servicing & Maintenance', item: 'Electricity', confidence: 'high', included: true };
const incomeTx = { _id: 't2', date: '2026-07-16', narration: 'NIP TFR FROM PATIENT', amount: 500000, direction: 'income', confidence: 'high', included: true };
const statement = { _id: 's1', fileName: 'july.pdf', status: 'review', createdAt: '2026-07-20', account, uploadedBy: { name: 'Ada' }, transactions: [expenseTx, incomeTx] };

const withTransactions = (transactions) => ({ ...statement, transactions });

// The review page fetches a single statement by id; override this when a test needs a different shape.
const mockStatement = (value) => {
  api.get.mockImplementation((path, query) => {
    if (path === '/categories') return Promise.resolve(query && query.kind === 'income' ? incomeCategories : categories);
    if (path === '/statements/s1') return Promise.resolve(value);
    return Promise.resolve([]);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockStatement(statement);
});

const renderPage = (auth = {}) => renderLive(
  <MemoryRouter initialEntries={['/statements/s1']}>
    <Routes>
      <Route path="/statements" element={<div>Statements library</div>} />
      <Route path="/statements/:id" element={<StatementReview />} />
    </Routes>
  </MemoryRouter>,
  { auth: { can: () => true, ...auth } },
);
// The narration also appears in the editor panel (it shows the selected row), so anchor on the
// transactions region loading rather than on narration text, which is ambiguous once something is selected.
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

test('choosing an item also saves the shown type and group, never an item on its own', async () => {
  const uncat = { _id: 't3', date: '2026-07-15', narration: 'DANIEL OKAFOR TEST TUBES', amount: 50000, direction: 'expense', type: null, group: null, item: null, confidence: 'needs-review', included: true };
  mockStatement({ ...statement, transactions: [uncat] });
  api.patch.mockResolvedValue(withTransactions([{ ...uncat, type: 'Recurrent', group: 'Servicing & Maintenance', item: 'Electricity' }]));
  renderPage();
  await waitForLoaded();
  await userEvent.click(screen.getAllByText('DANIEL OKAFOR TEST TUBES')[0]);
  await userEvent.selectOptions(screen.getByLabelText('Item'), 'Electricity');
  expect(api.patch).toHaveBeenCalledWith('/statements/s1/transactions/t3', expect.objectContaining({
    type: 'Recurrent', group: 'Servicing & Maintenance', item: 'Electricity',
  }));
});

test('the Mark reviewed button shows a saving state while the change is in flight', async () => {
  let resolvePatch;
  api.patch.mockImplementation(() => new Promise((r) => { resolvePatch = r; }));
  renderPage();
  await waitForLoaded();
  await userEvent.click(screen.getAllByText('IBEDC PREPAID METER')[0]);
  await userEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
  expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
  resolvePatch(withTransactions([{ ...expenseTx, confidence: 'high' }, incomeTx]));
  expect(await screen.findByRole('button', { name: 'Mark reviewed' })).toBeEnabled();
});

test('Mark reviewed on an uncategorised expense saves the shown type and group, not just confidence', async () => {
  const uncat = { _id: 't3', date: '2026-07-15', narration: 'DANIEL OKAFOR TEST TUBES', amount: 50000, direction: 'expense', type: null, group: null, item: null, confidence: 'needs-review', included: true };
  mockStatement({ ...statement, transactions: [uncat] });
  api.patch.mockResolvedValue(withTransactions([{ ...uncat, type: 'Recurrent', group: 'Servicing & Maintenance', confidence: 'high' }]));
  renderPage();
  await waitForLoaded();
  await userEvent.click(screen.getAllByText('DANIEL OKAFOR TEST TUBES')[0]);
  await userEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
  expect(api.patch).toHaveBeenCalledWith('/statements/s1/transactions/t3', expect.objectContaining({
    type: 'Recurrent', group: 'Servicing & Maintenance', confidence: 'high',
  }));
});

test('a transaction can be excluded and re-included from the list', async () => {
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
  mockStatement(withTransactions([{ ...expenseTx, included: false }, { ...incomeTx, included: false }]));
  renderPage();
  await waitForLoaded();
  expect(screen.getByRole('button', { name: 'Approve statement' })).toBeDisabled();
  expect(screen.getByText(/nothing selected/i)).toBeInTheDocument();
});

test('excluded rows are visually marked and not counted toward what still needs review', async () => {
  mockStatement(withTransactions([{ ...expenseTx, included: false, confidence: 'needs-review' }, incomeTx]));
  renderPage();
  await waitForLoaded();
  expect(screen.getByText('Ready to approve')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Approve statement' })).not.toBeDisabled();
});

test('approving shows a loading state until the request finishes', async () => {
  mockStatement(withTransactions([{ ...expenseTx, confidence: 'high' }, incomeTx]));
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
    mockStatement(withTransactions([{ ...expenseTx, reason: 'Mentions IBEDC' }, incomeTx]));
    renderPage();
    await waitForLoaded();
    await userEvent.click(screen.getByText('IBEDC PREPAID METER'));
    expect(await screen.findByText(/Why: Mentions IBEDC/)).toBeInTheDocument();
  });

  test('confirming a row says when similar rows from the same payee were updated too', async () => {
    api.patch.mockResolvedValue({ ...statement, similarUpdated: 3 });
    renderPage();
    await waitForLoaded();
    await userEvent.click(screen.getAllByText('IBEDC PREPAID METER')[0]);
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
  test('asks to confirm, shows progress, then returns to the library', async () => {
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
    expect(await screen.findByText('Statements library')).toBeInTheDocument();
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
    mockStatement({ ...statement, status: 'approved' });
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

describe('income categorization in the review panel', () => {
  test('an income row can be given an income category', async () => {
    api.patch.mockResolvedValue(withTransactions([expenseTx, { ...incomeTx, type: 'Diagnostics', group: 'Laboratory' }]));
    renderPage();
    await waitForLoaded();
    await userEvent.click(screen.getAllByText('NIP TFR FROM PATIENT')[0]);
    // income rows get an income category selector, not the expense "Type" one
    expect(screen.queryByLabelText('Type')).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Category (optional)'), 'Diagnostics');
    expect(api.patch).toHaveBeenCalledWith('/statements/s1/transactions/t2', expect.objectContaining({ type: 'Diagnostics', group: 'Laboratory' }));
  });
});

describe('fixing categories that block approval', () => {
  const blockerError = (blockers) => Object.assign(new Error('not set up'), { data: { blockers } });

  test('a missing category offers one-click create, then re-approves', async () => {
    api.post.mockImplementation((path) => (path.endsWith('/approve')
      ? Promise.reject(blockerError([{ transactionId: 't1', narration: 'IBEDC PREPAID METER', kind: 'expense', path: 'Recurrent › New Group', action: 'create', create: { type: 'Recurrent', group: 'New Group' } }]))
      : Promise.resolve(statement)));
    renderPage();
    await waitForLoaded();
    await userEvent.click(screen.getByRole('button', { name: 'Approve statement' }));
    expect(await screen.findByText(/still need a category/i)).toBeInTheDocument();

    // now make ensure-path + a retried approve succeed
    api.post.mockImplementation((path) => (path.endsWith('/approve') ? Promise.resolve(statement) : Promise.resolve([])));
    await userEvent.click(screen.getByRole('button', { name: /Create 1 category & approve/ }));
    expect(api.post).toHaveBeenCalledWith('/categories/ensure-path', { kind: 'expense', type: 'Recurrent', group: 'New Group' });
    await waitFor(() => expect(screen.queryByText(/still need a category/i)).toBeNull());
  });

  test('an incomplete category is shown to open rather than create', async () => {
    api.post.mockImplementation((path) => (path.endsWith('/approve')
      ? Promise.reject(blockerError([{ transactionId: 't1', narration: 'NIP TFR FROM PATIENT', kind: 'income', path: 'Diagnostics', action: 'choose' }]))
      : Promise.resolve(statement)));
    renderPage();
    await waitForLoaded();
    await userEvent.click(screen.getByRole('button', { name: 'Approve statement' }));
    expect(await screen.findByText(/pick a category/i)).toBeInTheDocument();
    // the row's description is shown inside the modal, not just an empty path
    expect(within(screen.getByRole('dialog')).getByText('NIP TFR FROM PATIENT', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create .* & approve/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Open this transaction' }));
    expect(screen.queryByText(/still need a category/i)).toBeNull();
  });
});
