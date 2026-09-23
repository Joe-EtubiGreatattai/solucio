import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountsAdmin from './AccountsAdmin';
import { api } from '../../api';

vi.mock('../../api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

beforeEach(() => {
  api.get.mockResolvedValue([]);
  api.post.mockResolvedValue({});
});

test('bank accounts require a bank name and number before saving', async () => {
  render(<AccountsAdmin />);
  await userEvent.type(await screen.findByLabelText('Name'), 'Ops');
  await userEvent.click(screen.getByRole('button', { name: 'Save account' }));
  expect(screen.getByText(/Enter the bank name/)).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test('posts the opening balance in kobo', async () => {
  render(<AccountsAdmin />);
  await userEvent.type(await screen.findByLabelText('Name'), 'Ops');
  await userEvent.type(screen.getByLabelText('Bank name'), 'Zenith');
  await userEvent.type(screen.getByLabelText('Account number'), '1234567890');
  await userEvent.type(screen.getByLabelText('Opening balance (₦)'), '5,000.25');
  await userEvent.click(screen.getByRole('button', { name: 'Save account' }));
  expect(api.post).toHaveBeenCalledWith('/accounts', {
    name: 'Ops', type: 'bank', bankName: 'Zenith', accountNumber: '1234567890', openingBalance: 500025,
  });
});

test('shows a busy label while saving', async () => {
  let resolvePost;
  api.post.mockReturnValue(new Promise((resolve) => { resolvePost = resolve; }));
  render(<AccountsAdmin />);
  await userEvent.type(await screen.findByLabelText('Name'), 'Ops');
  await userEvent.type(screen.getByLabelText('Bank name'), 'Zenith');
  await userEvent.type(screen.getByLabelText('Account number'), '1234567890');
  await userEvent.click(screen.getByRole('button', { name: 'Save account' }));
  expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
  resolvePost({});
  await screen.findByRole('button', { name: 'Save account' });
});

test('shows a busy label while toggling an account', async () => {
  let resolvePatch;
  api.get.mockResolvedValue([{ _id: 'a1', name: 'Ops', type: 'cash', active: true, openingBalance: 0 }]);
  api.patch.mockReturnValue(new Promise((resolve) => { resolvePatch = resolve; }));
  render(<AccountsAdmin />);
  const row = await screen.findByRole('button', { name: 'Deactivate Ops' });
  await userEvent.click(row);
  await waitFor(() => expect(row).toBeDisabled());
  expect(row).toHaveTextContent('Saving…');
  resolvePatch({});
});
