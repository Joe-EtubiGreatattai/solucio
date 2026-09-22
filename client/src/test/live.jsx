import { render } from '@testing-library/react';
import { AuthContext } from '../auth/AuthContext';
import { RealtimeProvider } from '../realtime/RealtimeProvider';

// A stand-in for the live connection that tests can fire events through.
export function fakeSocket() {
  const handlers = {};
  return {
    handlers,
    on: (event, fn) => { handlers[event] = fn; },
    disconnect: vi.fn(),
    fire: (event, payload) => handlers[event] && handlers[event](payload),
  };
}

export function renderLive(ui, { auth = {}, socket = fakeSocket() } = {}) {
  const value = {
    user: { _id: 'u1', name: 'Ada', role: 'x' },
    can: () => true, permissions: [], isAdmin: false,
    refreshAccess: vi.fn(), logout: vi.fn(),
    ...auth,
  };
  const utils = render(
    <AuthContext.Provider value={value}>
      <RealtimeProvider connect={() => socket}>{ui}</RealtimeProvider>
    </AuthContext.Provider>
  );
  return { socket, auth: value, ...utils };
}
