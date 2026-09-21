import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IncomeForm from './IncomeForm';

const accounts = [{ _id: 'a1', name: 'Main', type: 'cash' }];

test('shows validation messages and does not submit invalid data', async () => {
  const onSubmit = vi.fn();
  render(<IncomeForm accounts={accounts} onSubmit={onSubmit} />);
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(screen.getByText(/Enter a valid amount/)).toBeInTheDocument();
  expect(screen.getByText(/Choose the account/)).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('hints at the format and validates the amount as soon as the field is left', async () => {
  render(<IncomeForm accounts={accounts} onSubmit={vi.fn()} />);
  const amount = screen.getByLabelText('Amount (₦)');
  expect(amount).toHaveAttribute('placeholder', '0.00');
  await userEvent.type(amount, 'abc');
  expect(screen.queryByText(/Enter a valid amount/)).toBeNull();
  await userEvent.tab();
  expect(screen.getByText(/Enter a valid amount/)).toBeInTheDocument();
  await userEvent.clear(amount);
  await userEvent.type(amount, '250');
  await userEvent.tab();
  expect(screen.queryByText(/Enter a valid amount/)).toBeNull();
});

test('submits the payload in kobo', async () => {
  const onSubmit = vi.fn().mockResolvedValue();
  render(<IncomeForm accounts={accounts} onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText('Amount (₦)'), '1,500.50');
  await userEvent.selectOptions(screen.getByLabelText('Account'), 'a1');
  await userEvent.selectOptions(screen.getByLabelText('Method'), 'pos');
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(onSubmit).toHaveBeenCalledWith({ amount: 150050, date: expect.any(String), method: 'pos', accountId: 'a1' });
});

test('keeps the typed amount and shows the server error when saving fails', async () => {
  const err = Object.assign(new Error('Account not found or inactive'), { fields: { accountId: 'Choose an active account' } });
  render(<IncomeForm accounts={accounts} onSubmit={vi.fn().mockRejectedValue(err)} />);
  await userEvent.type(screen.getByLabelText('Amount (₦)'), '100');
  await userEvent.selectOptions(screen.getByLabelText('Account'), 'a1');
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(await screen.findByText('Choose an active account')).toBeInTheDocument();
  expect(screen.getByLabelText('Amount (₦)')).toHaveValue('100');
});
