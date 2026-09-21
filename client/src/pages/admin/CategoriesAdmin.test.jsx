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

test('explains that hiding keeps past expenses', async () => {
  render(<CategoriesAdmin />);
  await screen.findByRole('heading', { name: 'Recurrent' });
  expect(screen.getByText(/past expenses keep/i)).toBeInTheDocument();
});

test('adds a category', async () => {
  const research = { type: 'Research', active: true, groups: [] };
  api.post.mockResolvedValue(withNew(research));
  render(<CategoriesAdmin />);
  await userEvent.type(await screen.findByLabelText('New category'), 'Research');
  await userEvent.click(screen.getByRole('button', { name: 'Add category' }));
  expect(api.post).toHaveBeenCalledWith('/categories/types', { name: 'Research' });
  expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();
  expect(screen.getByLabelText('New category')).toHaveValue('');
});

test('adds a group to a category', async () => {
  render(<CategoriesAdmin />);
  await userEvent.type(await screen.findByLabelText('New group in Recurrent'), 'Security');
  await userEvent.click(screen.getByRole('button', { name: 'Add group to Recurrent' }));
  expect(api.post).toHaveBeenCalledWith('/categories/groups', { type: 'Recurrent', name: 'Security' });
});

test('adds an item to a group', async () => {
  render(<CategoriesAdmin />);
  await userEvent.type(await screen.findByLabelText('New item in Staff Wages'), 'Bonus');
  await userEvent.click(screen.getByRole('button', { name: 'Add item to Staff Wages' }));
  expect(api.post).toHaveBeenCalledWith('/categories/items', { type: 'Recurrent', group: 'Staff Wages', name: 'Bonus' });
});

test('adding also works with the Enter key', async () => {
  render(<CategoriesAdmin />);
  await userEvent.type(await screen.findByLabelText('New item in Rents'), 'Office{enter}');
  expect(api.post).toHaveBeenCalledWith('/categories/items', { type: 'Recurrent', group: 'Rents', name: 'Office' });
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
  expect(api.patch).toHaveBeenLastCalledWith('/categories/active', { type: 'Capital', group: 'Equipment', item: 'Nursing', active: false });
  await userEvent.click(screen.getByRole('button', { name: 'Show item Radiology in Equipment' }));
  expect(api.patch).toHaveBeenLastCalledWith('/categories/active', { type: 'Capital', group: 'Equipment', item: 'Radiology', active: true });
  await userEvent.click(screen.getByRole('button', { name: 'Hide group Rents in Recurrent' }));
  expect(api.patch).toHaveBeenLastCalledWith('/categories/active', { type: 'Recurrent', group: 'Rents', active: false });
  await userEvent.click(screen.getByRole('button', { name: 'Hide category Capital' }));
  expect(api.patch).toHaveBeenLastCalledWith('/categories/active', { type: 'Capital', active: false });
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
