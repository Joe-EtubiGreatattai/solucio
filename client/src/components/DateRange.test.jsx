import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DateRange from './DateRange';

test('presets call onChange with a from/to range', async () => {
  const onChange = vi.fn();
  render(<DateRange value={{ from: '2026-01-01', to: '2026-01-31' }} onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', { name: 'Today' }));
  const arg = onChange.mock.calls[0][0];
  expect(arg.from).toBe(arg.to);
  expect(arg.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('editing a date input keeps the other end', async () => {
  const onChange = vi.fn();
  render(<DateRange value={{ from: '2026-01-01', to: '2026-01-31' }} onChange={onChange} />);
  const from = screen.getByLabelText('From');
  fireEvent.change(from, { target: { value: '2026-01-05' } });
  expect(onChange).toHaveBeenLastCalledWith({ from: '2026-01-05', to: '2026-01-31' });
});
