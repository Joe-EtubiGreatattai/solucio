import { render, screen } from '@testing-library/react';
import TableWrap from './TableWrap';

test('wraps a table in a focusable, labelled scroll region', () => {
  render(<TableWrap label="Income entries"><table><tbody><tr><td>x</td></tr></tbody></table></TableWrap>);
  const region = screen.getByRole('region', { name: 'Income entries' });
  expect(region).toHaveAttribute('tabindex', '0');
  expect(region).toHaveClass('table-wrap');
  expect(region.querySelector('table')).not.toBeNull();
});
