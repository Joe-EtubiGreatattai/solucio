import { render, screen } from '@testing-library/react';
import { AuthContext } from '../auth/AuthContext';
import RequirePermission from './RequirePermission';

const withAccess = (perms) => (
  <AuthContext.Provider value={{ can: (p) => perms.includes(p), isAdmin: false }}>
    <RequirePermission check={(a) => a.can('expenses.view')}><p>secret page</p></RequirePermission>
  </AuthContext.Provider>
);

test('shows the page when the check passes', () => {
  render(withAccess(['expenses.view']));
  expect(screen.getByText('secret page')).toBeInTheDocument();
});

test('shows a plain message when it does not', () => {
  render(withAccess(['income.view']));
  expect(screen.queryByText('secret page')).toBeNull();
  expect(screen.getByText(/not allowed/i)).toBeInTheDocument();
});
