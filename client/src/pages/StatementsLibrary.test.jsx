import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StatementsLibrary from './StatementsLibrary';
import { api } from '../api';
import { renderLive } from '../test/live';

vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), uploadPdf: vi.fn() }, API_BASE: '', getToken: () => null }));

const account = { _id: 'a1', name: 'Main Operations', type: 'bank', bankName: 'GTBank', accountNumber: '0123456789' };
const expenseTx = { _id: 't1', date: '2026-07-15', narration: 'IBEDC PREPAID METER', amount: 975000, direction: 'expense', confidence: 'needs-review', included: true };
const statement = { _id: 's1', fileName: 'july.pdf', status: 'review', createdAt: '2026-07-20', account, uploadedBy: { name: 'Ada' }, transactions: [expenseTx] };

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path === '/accounts') return Promise.resolve([account]);
    if (path === '/statements') return Promise.resolve({ items: [statement], total: 1, page: 1, limit: 25 });
    return Promise.resolve([]);
  });
});

const renderLibrary = (initial = '/statements') => renderLive(
  <MemoryRouter initialEntries={[initial]}>
    <Routes>
      <Route path="/statements" element={<StatementsLibrary />} />
      <Route path="/statements/:id" element={<div>Review page for {initial}</div>} />
    </Routes>
  </MemoryRouter>,
  { auth: { can: () => true } },
);

test('lists imported statements as cards with their status', async () => {
  renderLibrary();
  expect(await screen.findByText('july.pdf')).toBeInTheDocument();
  expect(screen.getByText(/1 to review/)).toBeInTheDocument();
});

test('card counts come from the slim list summary, not a full transactions array', async () => {
  // The list endpoint now returns counts only; the card must read those and not expect every row.
  const summary = { _id: 's2', fileName: 'august.pdf', status: 'review', createdAt: '2026-08-20', account, uploadedBy: { name: 'Ada' }, transactionCount: 42, unresolvedCount: 7 };
  api.get.mockImplementation((path) => {
    if (path === '/accounts') return Promise.resolve([account]);
    if (path === '/statements') return Promise.resolve({ items: [summary], total: 1, page: 1, limit: 25 });
    return Promise.resolve([]);
  });
  renderLibrary();
  expect(await screen.findByText('august.pdf')).toBeInTheDocument();
  expect(screen.getByText(/42 transactions/)).toBeInTheDocument();
  expect(screen.getByText(/7 to review/)).toBeInTheDocument();
});

test('pages through a long library instead of fetching every statement', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/accounts') return Promise.resolve([account]);
    if (path === '/statements') return Promise.resolve({ items: [statement], total: 60, page: 1, limit: 25 });
    return Promise.resolve([]);
  });
  renderLibrary();
  expect(await screen.findByText('Showing 1–25 of 60')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(api.get).toHaveBeenLastCalledWith('/statements', expect.objectContaining({ page: 2, limit: 25 }));
});

test('clicking a statement card opens its review page', async () => {
  renderLibrary();
  await userEvent.click(await screen.findByText('july.pdf'));
  expect(await screen.findByText(/Review page/)).toBeInTheDocument();
});

test('a successful import shows the ready-for-review notice and no error', async () => {
  const created = { _id: 's9', fileName: 'Account Statement.pdf', status: 'review', createdAt: '2026-10-13', account, uploadedBy: { name: 'System' }, transactions: [{ ...expenseTx, _id: 'n1' }] };
  api.uploadPdf.mockResolvedValue(created);
  renderLibrary();
  await screen.findByText('july.pdf');
  await userEvent.click(screen.getByRole('button', { name: 'Import statement' }));
  await userEvent.selectOptions(screen.getByLabelText('Bank account'), 'a1');
  await userEvent.upload(document.querySelector('input[type="file"]'), new File(['%PDF-1.4'], 'Account Statement.pdf', { type: 'application/pdf' }));
  await userEvent.click(screen.getByRole('button', { name: 'Import for review' }));
  expect(await screen.findByRole('status')).toHaveTextContent('ready for review');
  expect(screen.queryByText(/Cannot read properties of null/)).toBeNull();
});

test('the empty state invites the first import', async () => {
  api.get.mockImplementation((path) => (path === '/accounts' ? Promise.resolve([account]) : Promise.resolve({ items: [], total: 0, page: 1, limit: 25 })));
  renderLibrary();
  expect(await screen.findByText(/Your review workspace is ready/)).toBeInTheDocument();
});
