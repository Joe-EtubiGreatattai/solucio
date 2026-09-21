import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategorySelect from './CategorySelect';

const CATS = [
  { type: 'Recurrent', groups: [{ name: 'Tax and Dues', items: ['PAYE', 'WHT', 'Others'] }, { name: 'Staff Wages', items: [] }] },
  { type: 'Capital', groups: [{ name: 'Equipment', items: ['Radiology'] }] },
];
function Harness() {
  const [v, setV] = useState({ type: '', group: '', item: '' });
  return <CategorySelect categories={CATS} value={v} onChange={setV} />;
}

test('groups appear after choosing a type, items after choosing a group with items', async () => {
  render(<Harness />);
  expect(screen.queryByLabelText('Group')).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText('Category type'), 'Recurrent');
  expect(screen.getByLabelText('Group')).toBeInTheDocument();
  expect(screen.queryByLabelText('Item')).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText('Group'), 'Tax and Dues');
  const options = screen.getByLabelText('Item').querySelectorAll('option');
  expect([...options].map((o) => o.textContent)).toEqual(['Choose…', 'PAYE', 'WHT', 'Others']);
});

test('leaf groups show no item select', async () => {
  render(<Harness />);
  await userEvent.selectOptions(screen.getByLabelText('Category type'), 'Recurrent');
  await userEvent.selectOptions(screen.getByLabelText('Group'), 'Staff Wages');
  expect(screen.queryByLabelText('Item')).toBeNull();
});

test('changing the type resets group and item', async () => {
  render(<Harness />);
  await userEvent.selectOptions(screen.getByLabelText('Category type'), 'Recurrent');
  await userEvent.selectOptions(screen.getByLabelText('Group'), 'Tax and Dues');
  await userEvent.selectOptions(screen.getByLabelText('Category type'), 'Capital');
  expect(screen.getByLabelText('Group')).toHaveValue('');
});
