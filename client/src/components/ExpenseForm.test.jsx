import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpenseForm from './ExpenseForm';

const accounts = [{ _id: 'a1', name: 'Main', type: 'cash' }];
const categories = [{ type: 'Recurrent', groups: [{ name: 'Tax and Dues', items: ['PAYE'] }, { name: 'Rents', items: [] }] }];

async function fill(amount = '250') {
  await userEvent.type(screen.getByLabelText('Amount (₦)'), amount);
  await userEvent.selectOptions(screen.getByLabelText('Account'), 'a1');
  await userEvent.selectOptions(screen.getByLabelText('Category type'), 'Recurrent');
}

test('requires category, and an item when the group has items', async () => {
  const onSubmit = vi.fn();
  render(<ExpenseForm accounts={accounts} categories={categories} onSubmit={onSubmit} />);
  await userEvent.click(screen.getByRole('button', { name: 'Record expense' }));
  expect(screen.getByText(/Choose the account/)).toBeInTheDocument();
  expect(screen.getByText(/Choose a category type/)).toBeInTheDocument();

  await fill();
  await userEvent.selectOptions(screen.getByLabelText('Group'), 'Tax and Dues');
  await userEvent.click(screen.getByRole('button', { name: 'Record expense' }));
  expect(screen.getByText(/Choose an item/)).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('submits a leaf group with a null item', async () => {
  const onSubmit = vi.fn().mockResolvedValue();
  render(<ExpenseForm accounts={accounts} categories={categories} onSubmit={onSubmit} />);
  await fill('1,000');
  await userEvent.selectOptions(screen.getByLabelText('Group'), 'Rents');
  await userEvent.click(screen.getByRole('button', { name: 'Record expense' }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    amount: 100000, accountId: 'a1', type: 'Recurrent', group: 'Rents', item: null,
  }));
});
