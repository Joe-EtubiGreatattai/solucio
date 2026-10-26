import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthContext } from '../auth/AuthContext';
import UpdateAnnouncement, { UPDATE_ID, SEEN_KEY } from './UpdateAnnouncement';

const renderWith = (auth) =>
  render(
    <AuthContext.Provider value={{ can: () => false, isAdmin: false, user: { name: 'Ada' }, ...auth }}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="*" element={<UpdateAnnouncement />} />
          <Route path="/reports" element={<p>Reports Page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

beforeEach(() => localStorage.clear());

test('shows the update to an admin who has not seen it yet', async () => {
  renderWith({ isAdmin: true });
  expect(await screen.findByRole('dialog')).toHaveTextContent(/categor/i);
});

test('is not shown to non-admins', () => {
  renderWith({ isAdmin: false, can: () => false });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('is not shown again once dismissed, and remembers that across renders', async () => {
  const { unmount } = renderWith({ isAdmin: true });
  await screen.findByRole('dialog');
  await userEvent.click(screen.getByRole('button', { name: /got it/i }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(localStorage.getItem(SEEN_KEY)).toContain(UPDATE_ID);

  unmount();
  renderWith({ isAdmin: true });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('the "view it" action dismisses the modal and goes to the Reports page', async () => {
  renderWith({ isAdmin: true });
  await screen.findByRole('dialog');
  await userEvent.click(screen.getByRole('button', { name: /reports/i }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('Reports Page')).toBeInTheDocument();
  expect(localStorage.getItem(SEEN_KEY)).toContain(UPDATE_ID);
});
