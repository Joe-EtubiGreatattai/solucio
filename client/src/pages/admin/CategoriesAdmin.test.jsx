import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoriesAdmin from './CategoriesAdmin';
import { api } from '../../api';

vi.mock('../../api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

const tree = [
  {
    type: 'Recurrent', active: true,
    groups: [
      { name: 'Staff Wages', active: true, items: [] },
      { name: 'Rents', active: true, items: [{ name: 'Warehouse', active: true }] },
    ],
  },
  {
    type: 'Capital', active: true,
    groups: [{ name: 'Equipment', active: true, items: [{ name: 'Nursing', active: true }, { name: 'Radiology', active: false }] }],
  },
];
const withNew = (extra) => [...tree, extra];

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(tree);
  api.post.mockResolvedValue(tree);
  api.patch.mockResolvedValue(tree);
});

test('shows every category, group and item, and marks what is hidden', async () => {
  render(<CategoriesAdmin />);
  expect(await screen.findByRole('heading', { name: 'Recurrent' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Capital' })).toBeInTheDocument();
  expect(screen.getByText('Staff Wages')).toBeInTheDocument();
  expect(screen.getByText('Warehouse')).toBeInTheDocument();
  const radiology = screen.getByText('Radiology').closest('li');
  expect(within(radiology).getByText('Hidden')).toBeInTheDocument();
  expect(within(radiology).getByRole('button', { name: 'Show item Radiology in Equipment' })).toBeInTheDocument();
  expect(within(screen.getByText('Nursing').closest('li')).queryByText('Hidden')).toBeNull();
});

test('explains that hiding keeps past records', async () => {
  render(<CategoriesAdmin />);
  await screen.findByRole('heading', { name: 'Recurrent' });
  expect(screen.getByText(/past records keep/i)).toBeInTheDocument();
});

test('switches between expense and income category trees', async () => {
  const incomeTree = [{ type: 'Diagnostics', active: true, groups: [{ name: 'Laboratory', active: true, items: [] }] }];
  api.get.mockImplementation((_path, query) => Promise.resolve(query && query.kind === 'income' ? incomeTree : tree));
  render(<CategoriesAdmin />);
  await screen.findByRole('heading', { name: 'Recurrent' });

  await userEvent.click(screen.getByRole('tab', { name: 'Income categories' }));
  expect(await screen.findByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Recurrent' })).toBeNull();

  // adding while on the income tab sends kind: income
  api.post.mockResolvedValue(incomeTree);
  await userEvent.type(screen.getByLabelText('New category'), 'Grants');
  await userEvent.click(screen.getByRole('button', { name: 'Add category' }));
  expect(api.post).toHaveBeenCalledWith('/categories/types', { name: 'Grants', kind: 'income' });
});

test('adds a category', async () => {
  const research = { type: 'Research', active: true, groups: [] };
  api.post.mockResolvedValue(withNew(research));
  render(<CategoriesAdmin />);
  await userEvent.type(await screen.findByLabelText('New category'), 'Research');
  await userEvent.click(screen.getByRole('button', { name: 'Add category' }));
  expect(api.post).toHaveBeenCalledWith('/categories/types', { name: 'Research', kind: 'expense' });
  expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();
  expect(screen.getByLabelText('New category')).toHaveValue('');
});

test('adds a group to a category', async () => {
  render(<CategoriesAdmin />);
  await userEvent.type(await screen.findByLabelText('New group in Recurrent'), 'Security');
  await userEvent.click(screen.getByRole('button', { name: 'Add group to Recurrent' }));
  expect(api.post).toHaveBeenCalledWith('/categories/groups', { type: 'Recurrent', name: 'Security', kind: 'expense' });
});

test('adds an item to a group', async () => {
  render(<CategoriesAdmin />);
  await userEvent.type(await screen.findByLabelText('New item in Staff Wages'), 'Bonus');
  await userEvent.click(screen.getByRole('button', { name: 'Add item to Staff Wages' }));
  expect(api.post).toHaveBeenCalledWith('/categories/items', { type: 'Recurrent', group: 'Staff Wages', name: 'Bonus', kind: 'expense' });
});

test('adding also works with the Enter key', async () => {
  render(<CategoriesAdmin />);
  await userEvent.type(await screen.findByLabelText('New item in Rents'), 'Office{enter}');
  expect(api.post).toHaveBeenCalledWith('/categories/items', { type: 'Recurrent', group: 'Rents', name: 'Office', kind: 'expense' });
});

test('an empty name is refused before asking the server', async () => {
  render(<CategoriesAdmin />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add category' }));
  expect(screen.getByText('Enter a name')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test('hides and shows categories, groups and items', async () => {
  render(<CategoriesAdmin />);
  await userEvent.click(await screen.findByRole('button', { name: 'Hide item Nursing in Equipment' }));
  expect(api.patch).toHaveBeenLastCalledWith('/categories/active', { type: 'Capital', group: 'Equipment', item: 'Nursing', active: false, kind: 'expense' });
  await userEvent.click(screen.getByRole('button', { name: 'Show item Radiology in Equipment' }));
  expect(api.patch).toHaveBeenLastCalledWith('/categories/active', { type: 'Capital', group: 'Equipment', item: 'Radiology', active: true, kind: 'expense' });
  await userEvent.click(screen.getByRole('button', { name: 'Hide group Rents in Recurrent' }));
  expect(api.patch).toHaveBeenLastCalledWith('/categories/active', { type: 'Recurrent', group: 'Rents', active: false, kind: 'expense' });
  await userEvent.click(screen.getByRole('button', { name: 'Hide category Capital' }));
  expect(api.patch).toHaveBeenLastCalledWith('/categories/active', { type: 'Capital', active: false, kind: 'expense' });
});

test('shows the server\'s reason when something already exists', async () => {
  api.post.mockRejectedValue(new Error('A group with that name already exists here'));
  render(<CategoriesAdmin />);
  await userEvent.type(await screen.findByLabelText('New group in Recurrent'), 'Rents');
  await userEvent.click(screen.getByRole('button', { name: 'Add group to Recurrent' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('A group with that name already exists here');
});

test('says when it cannot load', async () => {
  api.get.mockRejectedValue(new Error('Cannot reach the server'));
  render(<CategoriesAdmin />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
});

describe('removing', () => {
  test('asks to confirm, then removes and shows the updated list', async () => {
    let resolvePost;
    api.post.mockReturnValue(new Promise((resolve) => { resolvePost = resolve; }));
    render(<CategoriesAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove item Warehouse in Rents' }));
    expect(api.post).not.toHaveBeenCalled();
    const confirm = screen.getByRole('button', { name: 'Confirm remove item Warehouse in Rents' });
    await userEvent.click(confirm);
    expect(api.post).toHaveBeenCalledWith('/categories/remove', { type: 'Recurrent', group: 'Rents', item: 'Warehouse', kind: 'expense' });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveTextContent('Removing…');
    resolvePost(tree);
  });

  test('cancel backs out without removing', async () => {
    render(<CategoriesAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove category Capital' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel remove' }));
    expect(screen.getByRole('button', { name: 'Remove category Capital' })).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('when something is in use, the server\'s reason is shown', async () => {
    api.post.mockRejectedValue(new Error('"Staff Wages" is used by 3 expenses. Hide it instead, so those records keep their category.'));
    render(<CategoriesAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove group Staff Wages in Recurrent' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm remove group Staff Wages in Recurrent' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('used by 3 expenses. Hide it instead');
  });
});

test('shows a loading animation while switching category trees', async () => {
  let resolveIncome;
  api.get.mockImplementation((_path, query) => (query && query.kind === 'income'
    ? new Promise((r) => { resolveIncome = r; })
    : Promise.resolve(tree)));
  render(<CategoriesAdmin />);
  await screen.findByRole('heading', { name: 'Recurrent' });
  await userEvent.click(screen.getByRole('tab', { name: 'Income categories' }));
  expect(screen.getByText('Loading categories…')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Recurrent' })).toBeNull();
  resolveIncome([{ type: 'Diagnostics', active: true, groups: [] }]);
  expect(await screen.findByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument();
  expect(screen.queryByText('Loading categories…')).toBeNull();
});
