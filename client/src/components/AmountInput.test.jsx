import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import AmountInput from './AmountInput';

function Harness({ initial = '' }) {
  const [v, setV] = useState(initial);
  return <AmountInput aria-label="Amount" value={v} onChange={setV} />;
}

test('adds thousands separators as you type', async () => {
  render(<Harness />);
  await userEvent.type(screen.getByLabelText('Amount'), '1234567');
  expect(screen.getByLabelText('Amount')).toHaveValue('1,234,567');
});
test('keeps one dot and at most two decimals', async () => {
  render(<Harness />);
  await userEvent.type(screen.getByLabelText('Amount'), '1500.509');
  expect(screen.getByLabelText('Amount')).toHaveValue('1,500.50');
});
test('ignores letters and stray symbols', async () => {
  render(<Harness />);
  await userEvent.type(screen.getByLabelText('Amount'), '1a2b3');
  expect(screen.getByLabelText('Amount')).toHaveValue('123');
});
test('formats a value it is given, so prefilled amounts show commas', () => {
  render(<Harness initial="5000.00" />);
  expect(screen.getByLabelText('Amount')).toHaveValue('5,000.00');
});
test('keeps the caret after the digit just typed, not at the end', async () => {
  const user = userEvent.setup();
  render(<Harness initial="1000000" />);
  const input = screen.getByLabelText('Amount');
  input.setSelectionRange(0, 0);
  await user.type(input, '9', { initialSelectionStart: 0, initialSelectionEnd: 0 });
  expect(input).toHaveValue('91,000,000');
  expect(input.selectionStart).toBe(1);
});
