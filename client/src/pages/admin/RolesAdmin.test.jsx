import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RolesAdmin from './RolesAdmin';
import { api } from '../../api';

vi.mock('../../api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

const permissions = [
  { key: 'income.view', label: 'View income and receipts', group: 'Income' },
  { key: 'income.record', label: 'Record income', group: 'Income' },
  { key: 'expenses.view', label: 'View expenses', group: 'Expenses' },
  { key: 'users.manage', label: 'Manage users', group: 'Administration' },
];
const roles = [
  { key: 'cashier', name: 'Cashier', description: 'Records payments', builtIn: true, permissions: ['income.view', 'income.record'], userCount: 2 },
  { key: 'admin', name: 'Admin', description: 'Full access', builtIn: true, permissions: permissions.map((p) => p.key), userCount: 1 },
  { key: 'front-desk', name: 'Front Desk', description: '', builtIn: false, permissions: ['income.view'], userCount: 0 },
];
const rowOf = (name) => screen.getByRole('row', { name: new RegExp(name) });

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ roles, permissions });
  api.post.mockResolvedValue({});
  api.patch.mockResolvedValue({});
  api.delete.mockResolvedValue({ deleted: true });
});

test('lists every role with its users and how much it can do', async () => {
  render(<RolesAdmin />);
  expect(await screen.findByText('Front Desk')).toBeInTheDocument();
  expect(within(rowOf('Cashier')).getByText('2')).toBeInTheDocument();
  expect(within(rowOf('Cashier')).getByText('2 of 4')).toBeInTheDocument();
  expect(within(rowOf('Admin')).getByText('4 of 4')).toBeInTheDocument();
});

test('the Admin role is locked and built-in roles cannot be deleted', async () => {
  render(<RolesAdmin />);
  await screen.findByText('Front Desk');
  expect(within(rowOf('Admin')).getByText('Locked')).toBeInTheDocument();
  expect(within(rowOf('Admin')).queryByRole('button')).toBeNull();
  expect(within(rowOf('Cashier')).getByRole('button', { name: 'Edit Cashier' })).toBeInTheDocument();
  expect(within(rowOf('Cashier')).queryByRole('button', { name: /Delete/ })).toBeNull();
  expect(within(rowOf('Front Desk')).getByRole('button', { name: 'Delete Front Desk' })).toBeInTheDocument();
});

test('creates a role from a name and ticked permissions', async () => {
  render(<RolesAdmin />);
  await userEvent.type(await screen.findByLabelText('Role name'), 'Records Clerk');
  await userEvent.type(screen.getByLabelText('Description'), 'Enters payments');
  await userEvent.click(screen.getByLabelText('View income and receipts'));
  await userEvent.click(screen.getByLabelText('Record income'));
  await userEvent.click(screen.getByRole('button', { name: 'Save role' }));
  expect(api.post).toHaveBeenCalledWith('/roles', {
    name: 'Records Clerk', description: 'Enters payments', permissions: ['income.view', 'income.record'],
  });
  expect(api.get).toHaveBeenCalledTimes(2); // reloaded
});

test('permissions are grouped under headings', async () => {
  render(<RolesAdmin />);
  await screen.findByText('Front Desk');
  for (const group of ['Income', 'Expenses', 'Administration']) {
    expect(screen.getByRole('group', { name: group })).toBeInTheDocument();
  }
  expect(within(screen.getByRole('group', { name: 'Income' })).getAllByRole('checkbox')).toHaveLength(2);
});

test('requires a name before saving', async () => {
  render(<RolesAdmin />);
  await userEvent.click(await screen.findByRole('button', { name: 'Save role' }));
  expect(screen.getByText('Give the role a name')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test('editing loads the role, and saving sends only that role', async () => {
  render(<RolesAdmin />);
  await userEvent.click(await screen.findByRole('button', { name: 'Edit Cashier' }));
  expect(screen.getByLabelText('Role name')).toHaveValue('Cashier');
  expect(screen.getByLabelText('Record income')).toBeChecked();
  expect(screen.getByLabelText('View expenses')).not.toBeChecked();
  await userEvent.click(screen.getByLabelText('Record income'));
  await userEvent.click(screen.getByLabelText('View expenses'));
  await userEvent.click(screen.getByRole('button', { name: 'Update role' }));
  expect(api.patch).toHaveBeenCalledWith('/roles/cashier', {
    name: 'Cashier', description: 'Records payments', permissions: ['income.view', 'expenses.view'],
  });
});

test('shows the server\'s reason when a name is already taken', async () => {
  api.post.mockRejectedValue(Object.assign(new Error('A role with that name already exists'), { fields: { name: 'A role with that name already exists' } }));
  render(<RolesAdmin />);
  await userEvent.type(await screen.findByLabelText('Role name'), 'cashier');
  await userEvent.click(screen.getByRole('button', { name: 'Save role' }));
  expect(await screen.findByText('A role with that name already exists', { selector: 'small' })).toBeInTheDocument();
});

test('deleting asks first, then deletes; a refusal is shown', async () => {
  render(<RolesAdmin />);
  await userEvent.click(await screen.findByRole('button', { name: 'Delete Front Desk' }));
  expect(api.delete).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel delete' }));
  await userEvent.click(screen.getByRole('button', { name: 'Delete Front Desk' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete Front Desk' }));
  expect(api.delete).toHaveBeenCalledWith('/roles/front-desk');

  api.delete.mockRejectedValue(new Error('2 users still have this role. Move them to another role first.'));
  await userEvent.click(await screen.findByRole('button', { name: 'Delete Front Desk' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete Front Desk' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('2 users still have this role');
});
