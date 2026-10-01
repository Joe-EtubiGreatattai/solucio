import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordDialog from './PasswordDialog';

const fill = async ({ current, next, confirm }) => {
  if (current !== undefined) await userEvent.type(screen.getByLabelText('Current password'), current);
  await userEvent.type(screen.getByLabelText('New password'), next);
  await userEvent.type(screen.getByLabelText('Confirm new password'), confirm);
};

test('asks for the current password when changing your own', async () => {
  const onSubmit = vi.fn().mockResolvedValue();
  render(<PasswordDialog title="Change your password" askCurrent onSubmit={onSubmit} onCancel={vi.fn()} />);
  expect(screen.getByRole('dialog', { name: 'Change your password' })).toBeInTheDocument();
  await fill({ current: 'old-password', next: 'brand-new-pass', confirm: 'brand-new-pass' });
  await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
  expect(onSubmit).toHaveBeenCalledWith({ currentPassword: 'old-password', newPassword: 'brand-new-pass' });
});

test('an admin reset does not ask for a current password', async () => {
  const onSubmit = vi.fn().mockResolvedValue();
  render(<PasswordDialog title="Reset password for Ada" onSubmit={onSubmit} onCancel={vi.fn()} />);
  expect(screen.queryByLabelText('Current password')).toBeNull();
  await fill({ next: 'brand-new-pass', confirm: 'brand-new-pass' });
  await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
  expect(onSubmit).toHaveBeenCalledWith({ newPassword: 'brand-new-pass' });
});

test('checks length and that both new passwords match before sending', async () => {
  const onSubmit = vi.fn();
  render(<PasswordDialog title="Reset" onSubmit={onSubmit} onCancel={vi.fn()} />);
  await fill({ next: 'short', confirm: 'short' });
  await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
  expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText('New password'));
  await userEvent.type(screen.getByLabelText('New password'), 'long-enough-1');
  await userEvent.clear(screen.getByLabelText('Confirm new password'));
  await userEvent.type(screen.getByLabelText('Confirm new password'), 'long-enough-2');
  await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
  expect(screen.getByText('The two passwords do not match')).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('shows the server\'s reason and a busy state', async () => {
  let reject;
  const onSubmit = vi.fn().mockReturnValue(new Promise((_, r) => { reject = r; }));
  render(<PasswordDialog title="Change" askCurrent onSubmit={onSubmit} onCancel={vi.fn()} />);
  await fill({ current: 'wrong-one', next: 'brand-new-pass', confirm: 'brand-new-pass' });
  await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
  expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
  reject(Object.assign(new Error('Current password is incorrect'), { fields: { currentPassword: 'Current password is incorrect' } }));
  expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save password' })).not.toBeDisabled();
});

test('Escape and Cancel close it', async () => {
  const onCancel = vi.fn();
  render(<PasswordDialog title="Change" askCurrent onSubmit={vi.fn()} onCancel={onCancel} />);
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledTimes(2);
});
