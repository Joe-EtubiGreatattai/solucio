import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';
import { api, getToken, setToken } from '../api';

vi.mock('../api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getToken: vi.fn(),
  setToken: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}));

function Probe() {
  const { user, roleName, can, isAdmin, login, logout, loading, refreshAccess } = useAuth();
  if (loading) return <p>loading</p>;
  return (
    <div>
      <p>user: {user ? user.name : 'nobody'}</p>
      <p>role: {roleName || 'none'}</p>
      <p>admin: {String(isAdmin)}</p>
      <p>income.view: {String(can('income.view'))}</p>
      <p>expenses.view: {String(can('expenses.view'))}</p>
      <button onClick={() => login('a@b.com', 'pw')}>login</button>
      <button onClick={logout}>logout</button>
      <button onClick={refreshAccess}>refresh</button>
    </div>
  );
}

beforeEach(() => { vi.clearAllMocks(); getToken.mockReturnValue(null); });

test('signing in stores who you are and what your role allows', async () => {
  api.post.mockResolvedValue({ token: 't', user: { name: 'Chioma', role: 'front-desk' }, roleName: 'Front Desk', permissions: ['income.view'] });
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(screen.getByText('user: nobody')).toBeInTheDocument();
  expect(screen.getByText('income.view: false')).toBeInTheDocument();
  await userEvent.click(screen.getByText('login'));
  expect(await screen.findByText('user: Chioma')).toBeInTheDocument();
  expect(screen.getByText('role: Front Desk')).toBeInTheDocument();
  expect(screen.getByText('income.view: true')).toBeInTheDocument();
  expect(screen.getByText('expenses.view: false')).toBeInTheDocument();
  expect(screen.getByText('admin: false')).toBeInTheDocument();
  expect(setToken).toHaveBeenCalledWith('t');
});

test('a saved session is restored with its permissions', async () => {
  getToken.mockReturnValue('saved');
  api.get.mockResolvedValue({ user: { name: 'Ada', role: 'admin' }, roleName: 'Admin', permissions: ['income.view', 'expenses.view'] });
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(await screen.findByText('user: Ada')).toBeInTheDocument();
  expect(screen.getByText('admin: true')).toBeInTheDocument();
  expect(screen.getByText('expenses.view: true')).toBeInTheDocument();
});

test('signing out forgets the permissions', async () => {
  api.post.mockResolvedValue({ token: 't', user: { name: 'Chioma', role: 'cashier' }, roleName: 'Cashier', permissions: ['income.view'] });
  render(<AuthProvider><Probe /></AuthProvider>);
  await userEvent.click(screen.getByText('login'));
  await screen.findByText('income.view: true');
  await userEvent.click(screen.getByText('logout'));
  expect(await screen.findByText('income.view: false')).toBeInTheDocument();
  expect(screen.getByText('user: nobody')).toBeInTheDocument();
});

test('outside a provider nobody is allowed to do anything', () => {
  function Bare() { const { can } = useAuth(); return <p>{String(can('income.view'))}</p>; }
  render(<Bare />);
  expect(screen.getByText('false')).toBeInTheDocument();
});

test('refreshAccess picks up a changed role without signing in again', async () => {
  api.post.mockResolvedValue({ token: 't', user: { name: 'Chioma', role: 'front-desk' }, roleName: 'Front Desk', permissions: ['income.view'] });
  render(<AuthProvider><Probe /></AuthProvider>);
  await userEvent.click(screen.getByText('login'));
  await screen.findByText('income.view: true');
  api.get.mockResolvedValue({ user: { name: 'Chioma', role: 'front-desk' }, roleName: 'Front Desk', permissions: ['income.view', 'expenses.view'] });
  await userEvent.click(screen.getByText('refresh'));
  expect(await screen.findByText('expenses.view: true')).toBeInTheDocument();
});
