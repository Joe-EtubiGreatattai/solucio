import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../auth/AuthContext';
import Layout from './Layout';
import { visibleNav } from '../nav';

const CASHIER = ['income.view', 'income.record', 'income.void'];
const ACCOUNTANT = [...CASHIER, 'expenses.view', 'expenses.record', 'expenses.void', 'reports.view', 'reports.export'];
const EVERYTHING = [...ACCOUNTANT, 'activity.view', 'accounts.manage', 'users.manage'];
const access = (perms, isAdmin = false) => ({ can: (p) => perms.includes(p), isAdmin });
const labels = (a) => visibleNav(a).map((i) => i.label);

test('the menu follows the permissions, not the role name', () => {
  expect(labels(access(CASHIER))).toEqual(['Income']);
  expect(labels(access(ACCOUNTANT))).toEqual(['Dashboard', 'Income', 'Expenses', 'Reports']);
  expect(labels(access(EVERYTHING, true))).toEqual(['Dashboard', 'Income', 'Expenses', 'Reports', 'Activity', 'Admin']);
});

test('custom roles get exactly the pages their permissions open', () => {
  expect(labels(access(['income.record']))).toEqual(['Income']); // can record even without seeing the list
  expect(labels(access(['users.manage']))).toEqual(['Admin']);
  expect(labels(access(['accounts.manage']))).toEqual(['Admin']);
  expect(labels(access(['categories.manage']))).toEqual(['Admin']);
  expect(labels(access(['activity.view']))).toEqual(['Activity']);
  expect(labels(access(['expenses.view']))).toEqual(['Expenses']);
  expect(labels(access([]))).toEqual([]);
});

test('Layout only renders links the person may use, and shows the role name', () => {
  render(
    <AuthContext.Provider value={{ user: { name: 'Ada', role: 'front-desk' }, roleName: 'Front Desk', logout() {}, ...access(['income.view']) }}>
      <MemoryRouter><Layout><p>page</p></Layout></MemoryRouter>
    </AuthContext.Provider>
  );
  expect(screen.getByRole('link', { name: 'Income' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Expenses' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  expect(screen.getByText(/Front Desk/)).toBeInTheDocument();
  expect(screen.getByText('page')).toBeInTheDocument();
});
