import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Admin from './Admin';
import { AuthContext } from '../auth/AuthContext';

vi.mock('./admin/UsersAdmin', () => ({ default: () => <p>users screen</p> }));
vi.mock('./admin/AccountsAdmin', () => ({ default: () => <p>accounts screen</p> }));
vi.mock('./admin/RolesAdmin', () => ({ default: () => <p>roles screen</p> }));
vi.mock('./admin/CategoriesAdmin', () => ({ default: () => <p>categories screen</p> }));

const renderAdmin = (perms, isAdmin = false) =>
  render(
    <AuthContext.Provider value={{ can: (p) => perms.includes(p), isAdmin }}>
      <Admin />
    </AuthContext.Provider>
  );
const tabs = () => screen.getAllByRole('tab').map((t) => t.textContent);

test('an admin sees Users, Accounts, Categories and Roles', async () => {
  renderAdmin(['users.manage', 'accounts.manage', 'categories.manage'], true);
  expect(tabs()).toEqual(['Users', 'Accounts', 'Categories', 'Roles']);
  expect(screen.getByText('users screen')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: 'Roles' }));
  expect(screen.getByText('roles screen')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Roles' })).toHaveAttribute('aria-selected', 'true');
});

test('a user manager who is not an admin sees only Users', () => {
  renderAdmin(['users.manage']);
  expect(tabs()).toEqual(['Users']);
  expect(screen.getByText('users screen')).toBeInTheDocument();
});

test('someone who can only manage accounts lands on Accounts', () => {
  renderAdmin(['accounts.manage']);
  expect(tabs()).toEqual(['Accounts']);
  expect(screen.getByText('accounts screen')).toBeInTheDocument();
});

test('someone who can only manage categories lands on Categories', () => {
  renderAdmin(['categories.manage']);
  expect(tabs()).toEqual(['Categories']);
  expect(screen.getByText('categories screen')).toBeInTheDocument();
});
