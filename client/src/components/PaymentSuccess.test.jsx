import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentSuccess from './PaymentSuccess';

const income = { _id: 'i1', receiptNumber: 'RCP-2026-0007', amount: 150050, method: 'pos', date: '2026-09-20T23:00:00.000Z' };
const account = { name: 'Main Operations', type: 'bank', bankName: 'GTBank', accountNumber: '0123456789' };

test('confirms the payment with its key details', () => {
  render(<PaymentSuccess income={income} account={account} onViewReceipt={vi.fn()} onDismiss={vi.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent('Payment recorded');
  expect(screen.getByText('RCP-2026-0007')).toBeInTheDocument();
  expect(screen.getByText('₦1,500.50')).toBeInTheDocument();
  expect(screen.getByText('POS')).toBeInTheDocument();
  expect(screen.getByText('21/09/2026')).toBeInTheDocument();
  expect(screen.getByText(/Main Operations/)).toBeInTheDocument();
});

test('the receipt only opens when the button is clicked', async () => {
  const onViewReceipt = vi.fn().mockResolvedValue();
  render(<PaymentSuccess income={income} account={account} onViewReceipt={onViewReceipt} onDismiss={vi.fn()} />);
  expect(onViewReceipt).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'View receipt' }));
  expect(onViewReceipt).toHaveBeenCalledWith('i1');
});

test('shows a message when the receipt cannot be opened', async () => {
  const onViewReceipt = vi.fn().mockRejectedValue(new Error('Could not load the receipt'));
  render(<PaymentSuccess income={income} account={account} onViewReceipt={onViewReceipt} onDismiss={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'View receipt' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the receipt');
});

test('"Record another payment" dismisses the confirmation', async () => {
  const onDismiss = vi.fn();
  render(<PaymentSuccess income={income} account={account} onViewReceipt={vi.fn()} onDismiss={onDismiss} />);
  await userEvent.click(screen.getByRole('button', { name: 'Record another payment' }));
  expect(onDismiss).toHaveBeenCalled();
});

test('the receipt button can be left out for people who may not view receipts', () => {
  render(<PaymentSuccess income={income} account={account} onViewReceipt={vi.fn()} onDismiss={vi.fn()} canViewReceipt={false} />);
  expect(screen.queryByRole('button', { name: 'View receipt' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Record another payment' })).toBeInTheDocument();
});
