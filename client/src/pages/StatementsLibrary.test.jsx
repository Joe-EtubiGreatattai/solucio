import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StatementsLibrary from './StatementsLibrary';
import { api } from '../api';
import { renderLive } from '../test/live';

vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), uploadPdf: vi.fn() }, API_BASE: '', getToken: () => null }));

const account = { _id: 'a1', name: 'Main Operations', type: 'bank', bankName: 'GTBank', accountNumber: '0123456789' };
const months = [
  { key: '2026-07', statements: 2, accounts: 1 },
  { key: '2026-06', statements: 0, accounts: 0 },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path === '/accounts') return Promise.resolve([account]);
    if (path === '/statements/months') return Promise.resolve({ months });
    return Promise.resolve([]);
  });
});

const renderLibrary = (initial = '/statements') => renderLive(
  <MemoryRouter initialEntries={[initial]}>
    <Routes>
      <Route path="/statements" element={<StatementsLibrary />} />
      <Route path="/statements/month/:monthKey" element={<div>Month page</div>} />
      <Route path="/statements/:id" element={<div>Review page</div>} />
    </Routes>
  </MemoryRouter>,
  { auth: { can: () => true } },
);

test('shows a box per month, marking months with no statement', async () => {
  renderLibrary();
  expect(await screen.findByText('July 2026')).toBeInTheDocument();
  expect(screen.getByText(/2 statements · 1 account/)).toBeInTheDocument();
  expect(screen.getByText('June 2026')).toBeInTheDocument();
  expect(screen.getByText('No statement imported')).toBeInTheDocument();
});

test('clicking a month opens that month', async () => {
  renderLibrary();
  await userEvent.click(await screen.findByText('July 2026'));
  expect(await screen.findByText('Month page')).toBeInTheDocument();
});

test('a successful import opens the new statement for review', async () => {
  api.uploadPdf.mockResolvedValue({ _id: 's9', fileName: 'Account Statement.pdf' });
  renderLibrary();
  await screen.findByText('July 2026');
  await userEvent.click(screen.getByRole('button', { name: 'Import statement' }));
  await userEvent.selectOptions(screen.getByLabelText('Bank account'), 'a1');
  await userEvent.upload(document.querySelector('input[type="file"]'), new File(['%PDF-1.4'], 'Account Statement.pdf', { type: 'application/pdf' }));
  await userEvent.click(screen.getByRole('button', { name: 'Import for review' }));
  expect(await screen.findByText('Review page')).toBeInTheDocument();
});

test('the empty state invites the first import', async () => {
  api.get.mockImplementation((path) => (path === '/accounts' ? Promise.resolve([account]) : Promise.resolve({ months: [] })));
  renderLibrary();
  expect(await screen.findByText(/No statements yet/)).toBeInTheDocument();
});
