import { render, screen } from '@testing-library/react';
import { AuthContext } from '../auth/AuthContext';
import Reports from './Reports';
import { api } from '../api';

vi.mock('../api', () => ({ api: { get: vi.fn(), blob: vi.fn() } }));

const renderReports = (perms) =>
  render(
    <AuthContext.Provider value={{ can: (p) => perms.includes(p), permissions: perms, user: { name: 'Ada', role: 'x' }, isAdmin: false }}>
      <Reports />
    </AuthContext.Provider>
  );

beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ grandTotal: 0, types: [] }); });

test('exports are offered only to roles that may export', async () => {
  renderReports(['reports.view', 'reports.export']);
  expect(await screen.findByRole('button', { name: 'Download' })).toBeInTheDocument();
});

test('a role that can view but not export gets no export controls', async () => {
  renderReports(['reports.view']);
  expect(await screen.findByText('No spending in this period.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
});
