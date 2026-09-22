import { render, screen } from '@testing-library/react';
import { AuthContext } from '../auth/AuthContext';
import Reports from './Reports';
import { api } from '../api';
import { renderLive } from '../test/live';
import { waitFor, act } from '@testing-library/react';

vi.mock('../api', () => ({ api: { get: vi.fn(), blob: vi.fn() }, API_BASE: '', getToken: () => null }));

const renderReports = (perms) =>
  render(
    <AuthContext.Provider value={{ can: (p) => perms.includes(p), permissions: perms, user: { name: 'Ada', role: 'x' }, isAdmin: false }}>
      <Reports />
    </AuthContext.Provider>
  );

// The page asks for two things: the spending breakdown and the summary totals.
const emptySummary = { income: { total: 0, count: 0 }, spending: { total: 0, count: 0 }, net: 0 };
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((path) => Promise.resolve(path === '/reports/summary' ? emptySummary : { grandTotal: 0, types: [] }));
});

test('exports are offered only to roles that may export', async () => {
  renderReports(['reports.view', 'reports.export']);
  expect(await screen.findByRole('button', { name: 'Download' })).toBeInTheDocument();
});

test('a role that can view but not export gets no export controls', async () => {
  renderReports(['reports.view']);
  expect(await screen.findByText('No spending in this period.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
});

test('the report refreshes when income, expenses or accounts change', async () => {
  const { socket } = renderLive(<Reports />, { auth: { can: () => true } });
  const calls = () => api.get.mock.calls.filter((c) => c[0] === '/reports/spending-by-category').length;
  await waitFor(() => expect(calls()).toBe(1));
  act(() => socket.fire('data:changed', { resource: 'reports', action: 'create', id: 'x' }));
  await waitFor(() => expect(calls()).toBe(2));
});
