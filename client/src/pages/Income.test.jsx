import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Income from './Income';
import { api } from '../api';

vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

test('shows an alert when accounts fail to load', async () => {
  api.get.mockImplementation((path) => (path === '/accounts' ? Promise.reject(new Error('Accounts unavailable')) : Promise.resolve({ items: [], total: 0 })));
  render(<MemoryRouter><Income /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Accounts unavailable');
});
