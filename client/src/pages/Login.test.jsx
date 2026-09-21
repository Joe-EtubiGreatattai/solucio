import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthContext } from '../auth/AuthContext';
import Login from './Login';

const renderLogin = () =>
  render(
    <AuthContext.Provider value={{ login: vi.fn() }}>
      <Login />
    </AuthContext.Provider>
  );

test('password is hidden by default and can be revealed and hidden again', async () => {
  renderLogin();
  const password = screen.getByLabelText('Password');
  const toggle = screen.getByLabelText('Show password');
  expect(password).toHaveAttribute('type', 'password');

  await userEvent.type(password, 'secret123');
  await userEvent.click(toggle);
  expect(password).toHaveAttribute('type', 'text');
  expect(password).toHaveValue('secret123');

  await userEvent.click(toggle);
  expect(password).toHaveAttribute('type', 'password');
});
