import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsersAdmin from './UsersAdmin';
import { AuthContext } from '../../auth/AuthContext';
import { api } from '../../api';

vi.mock('../../api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

const roles = [
  { key: 'cashier', name: 'Cashier', permissions: [], builtIn: true, userCount: 1 },
  { key: 'front-desk', name: 'Front Desk', permissions: [], builtIn: false, userCount: 0 },
  { key: 'admin', name: 'Admin', permissions: [], builtIn: true, userCount: 1 },
];
const users = [
  { _id: 'me', name: 'Ada Admin', email: 'ada@x.com', role: 'admin', active: true },
  { _id: 'u2', name: 'Chioma Okafor', email: 'c@x.com', role: 'cashier', active: true },
  { _id: 'u3', name: 'Old Timer', email: 'o@x.com', role: 'retired', active: true },
];
const renderUsers = ({ isAdmin = true, me = 'me' } = {}) =>
  render(
    <AuthContext.Provider value={{ user: { _id: me, name: 'Ada Admin', role: isAdmin ? 'admin' : 'hr' }, isAdmin, can: () => true }}>
      <UsersAdmin />
    </AuthContext.Provider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((path) => Promise.resolve(path === '/users' ? users : { roles, permissions: [] }));
  api.post.mockResolvedValue({});
  api.patch.mockResolvedValue({});
});

const optionNames = (select) => within(select).getAllByRole('option').map((o) => o.textContent);

test('the role choices come from the role list, by name', async () => {
  renderUsers();
  const select = await screen.findByLabelText('Role', { selector: 'select' });
  expect(optionNames(select)).toEqual(['Cashier', 'Front Desk', 'Admin']);
});

test('adds a user with the chosen role key', async () => {
  renderUsers();
  await userEvent.type(await screen.findByLabelText('Name'), 'Tunde Bello');
  await userEvent.type(screen.getByLabelText('Email'), 't@x.com');
  await userEvent.type(screen.getByLabelText('Password'), 'password123');
  await userEvent.selectOptions(screen.getByLabelText('Role', { selector: 'select' }), 'front-desk');
  await userEvent.click(screen.getByRole('button', { name: 'Add user' }));
  expect(api.post).toHaveBeenCalledWith('/users', { name: 'Tunde Bello', email: 't@x.com', password: 'password123', role: 'front-desk' });
});

test('changing a user\'s role sends the role key', async () => {
  renderUsers();
  await userEvent.selectOptions(await screen.findByLabelText('Role for Chioma Okafor'), 'front-desk');
  expect(api.patch).toHaveBeenCalledWith('/users/u2', { role: 'front-desk' });
});

test('a role that no longer exists still shows, so nobody is silently reassigned', async () => {
  renderUsers();
  const select = await screen.findByLabelText('Role for Old Timer');
  expect(select).toHaveValue('retired');
});

test('you cannot change your own role or deactivate yourself', async () => {
  renderUsers();
  expect(await screen.findByLabelText('Role for Ada Admin')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Deactivate Ada Admin' })).toBeDisabled();
});

test('a delegate who is not an admin cannot hand out or touch the Admin role', async () => {
  renderUsers({ isAdmin: false, me: 'hr' });
  const select = await screen.findByLabelText('Role', { selector: 'select' });
  expect(optionNames(select)).toEqual(['Cashier', 'Front Desk']);
  expect(screen.getByLabelText('Role for Ada Admin')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Deactivate Ada Admin' })).toBeDisabled();
  expect(screen.getByLabelText('Role for Chioma Okafor')).not.toBeDisabled();
  const options = optionNames(screen.getByLabelText('Role for Chioma Okafor'));
  expect(options).not.toContain('Admin');
});
