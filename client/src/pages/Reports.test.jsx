import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// The page asks for two things: the spending breakdown and the cash-flow analysis.
const emptyCashFlow = {
  range: { from: '', to: '' }, bucket: 'day', series: [],
  totals: { income: 0, expenses: 0, net: 0, cashOnHand: 0 },
  previous: { income: 0, expenses: 0, net: 0 },
  change: { income: 0, expenses: 0, net: 0 },
  burnRate: { avgDailyNet: 0, runwayDays: null },
  topOutflows: [], incomeByMethod: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path === '/accounts') return Promise.resolve([]);
    return Promise.resolve(path === '/reports/cash-flow' ? emptyCashFlow : { grandTotal: 0, types: [] });
  });
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

describe('filtering reports by bank/account', () => {
  const account = { _id: 'a1', name: 'Main Operations', type: 'bank', bankName: 'GTBank' };

  const renderAdmin = () => renderLive(<Reports />, { auth: { can: () => true, isAdmin: true } });

  test('roles without account rights see no account filter', async () => {
    renderReports(['reports.view', 'reports.export']);
    await screen.findByRole('button', { name: 'Download' });
    expect(screen.queryByLabelText('Bank / account')).toBeNull();
  });

  test('a super-user with accounts.manage but not the admin role still gets the filter', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/accounts') return Promise.resolve([account]);
      return Promise.resolve(path === '/reports/cash-flow' ? emptyCashFlow : { grandTotal: 0, types: [] });
    });
    renderLive(<Reports />, { auth: { can: (p) => p === 'accounts.manage', isAdmin: false } });
    expect(await screen.findByLabelText('Bank / account')).toBeInTheDocument();
  });

  test('an admin can scope every report to one account', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/accounts') return Promise.resolve([account]);
      return Promise.resolve(path === '/reports/cash-flow' ? emptyCashFlow : { grandTotal: 0, types: [] });
    });
    renderAdmin();
    const select = await screen.findByLabelText('Bank / account');
    await act(async () => { await userEvent.selectOptions(select, 'a1'); });
    await waitFor(() => expect(
      api.get.mock.calls.some((c) => c[0] === '/reports/spending-by-category' && c[1]?.accountId === 'a1'),
    ).toBe(true));
    expect(api.get.mock.calls.some((c) => c[0] === '/reports/cash-flow' && c[1]?.accountId === 'a1')).toBe(true);
  });
});
