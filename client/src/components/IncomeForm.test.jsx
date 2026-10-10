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
  expect(amount).toHaveValue(''); // letters never make it into the field
  expect(screen.queryByText(/Enter a valid amount/)).toBeNull();
  await userEvent.type(amount, '12.'); // an incomplete amount is flagged on blur
  await userEvent.tab();
  expect(screen.getByText(/Enter a valid amount/)).toBeInTheDocument();
  await userEvent.clear(amount);
  await userEvent.type(amount, '2500');
  expect(amount).toHaveValue('2,500'); // and commas appear as you type
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

const incomeCats = [{ type: 'Diagnostics', groups: [{ name: 'Laboratory', items: [] }, { name: 'Radiology', items: ['X-ray'] }] }];

test('income category is optional — records fine without one', async () => {
  const onSubmit = vi.fn().mockResolvedValue();
  render(<IncomeForm accounts={accounts} categories={incomeCats} onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText('Amount (₦)'), '500');
  await userEvent.selectOptions(screen.getByLabelText('Account'), 'a1');
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 50000, accountId: 'a1' }));
  const payload = onSubmit.mock.calls[0][0];
  expect(payload).not.toHaveProperty('type');
  expect(payload).not.toHaveProperty('group');
});

test('a chosen income category is validated and sent', async () => {
  const onSubmit = vi.fn().mockResolvedValue();
  render(<IncomeForm accounts={accounts} categories={incomeCats} onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText('Amount (₦)'), '500');
  await userEvent.selectOptions(screen.getByLabelText('Account'), 'a1');
  await userEvent.selectOptions(screen.getByLabelText('Category type'), 'Diagnostics');
  await userEvent.selectOptions(screen.getByLabelText('Group'), 'Radiology');
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(screen.getByText(/Choose an item/)).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('Item'), 'X-ray');
  await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ type: 'Diagnostics', group: 'Radiology', item: 'X-ray' }));
});
