import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../auth/AuthContext';
import Layout from './Layout';
import { visibleNav } from '../nav';

const labels = (role) => visibleNav(role).map((i) => i.label);

test('nav items by role', () => {
  expect(labels('cashier')).toEqual(['Income']);
  expect(labels('accountant')).toEqual(['Dashboard', 'Income', 'Expenses', 'Reports']);
  expect(labels('admin')).toEqual(['Dashboard', 'Income', 'Expenses', 'Reports', 'Admin']);
});

test('Layout only renders links the role may use', () => {
  render(
    <AuthContext.Provider value={{ user: { name: 'Ada', role: 'cashier' }, logout() {} }}>
      <MemoryRouter><Layout><p>page</p></Layout></MemoryRouter>
    </AuthContext.Provider>
  );
  expect(screen.getByRole('link', { name: 'Income' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Expenses' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  expect(screen.getByText('page')).toBeInTheDocument();
});
