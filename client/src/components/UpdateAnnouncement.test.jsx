import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthContext } from '../auth/AuthContext';
import UpdateAnnouncement, { UPDATE_ID } from './UpdateAnnouncement';

const renderWith = (auth) =>
  render(
    <AuthContext.Provider value={{ can: () => false, isAdmin: false, user: { name: 'Ada', seenUpdates: [] }, markUpdateSeen: vi.fn(), ...auth }}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="*" element={<UpdateAnnouncement />} />
          <Route path="/reports" element={<p>Reports Page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

test('shows the update to an admin who has not seen it yet', async () => {
  renderWith({ isAdmin: true });
  expect(await screen.findByRole('dialog')).toHaveTextContent(/categor/i);
});

test('is not shown to non-admins', () => {
  renderWith({ isAdmin: false, can: () => false });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('is not shown when the user has already seen it (stored on their record)', () => {
  renderWith({ isAdmin: true, user: { name: 'Ada', seenUpdates: [UPDATE_ID] } });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('dismissing hides it and records it against the user', async () => {
  const markUpdateSeen = vi.fn();
  renderWith({ isAdmin: true, markUpdateSeen });
  await screen.findByRole('dialog');
  await userEvent.click(screen.getByRole('button', { name: /got it/i }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(markUpdateSeen).toHaveBeenCalledWith(UPDATE_ID);
});

test('the "view it" action records it, hides the modal and goes to the Reports page', async () => {
  const markUpdateSeen = vi.fn();
  renderWith({ isAdmin: true, markUpdateSeen });
  await screen.findByRole('dialog');
  await userEvent.click(screen.getByRole('button', { name: /reports/i }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('Reports Page')).toBeInTheDocument();
  expect(markUpdateSeen).toHaveBeenCalledWith(UPDATE_ID);
});
