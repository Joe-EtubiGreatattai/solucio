import { act, render, screen } from '@testing-library/react';
import { AuthContext } from '../auth/AuthContext';
import { RealtimeProvider, useLiveRefresh, useRealtime } from './RealtimeProvider';
import { setToken } from '../api';
import { fakeSocket, renderLive } from '../test/live';

function Probe({ resources = ['incomes'] }) {
  const tick = useLiveRefresh(resources);
  const { status } = useRealtime();
  return <p>tick:{tick} status:{status}</p>;
}
const change = (resource) => ({ resource, action: 'create', id: 'x' });
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

test('connects when signed in, with a token supplied fresh on every (re)connect', () => {
  const connect = vi.fn(() => fakeSocket());
  setToken('abc');
  render(
    <AuthContext.Provider value={{ user: { _id: 'u1' }, refreshAccess: vi.fn(), logout: vi.fn() }}>
      <RealtimeProvider connect={connect}><Probe /></RealtimeProvider>
    </AuthContext.Provider>
  );
  expect(connect).toHaveBeenCalledTimes(1);
  const [, options] = connect.mock.calls[0];
  const answer = vi.fn();
  options.auth(answer);
  expect(answer).toHaveBeenCalledWith({ token: 'abc' });
  setToken('newer');
  options.auth(answer);
  expect(answer).toHaveBeenLastCalledWith({ token: 'newer' });
});

test('does nothing when signed out, and disconnects when signed out or unmounted', () => {
  const connect = vi.fn(() => fakeSocket());
  const signedOut = render(
    <AuthContext.Provider value={{ user: null }}><RealtimeProvider connect={connect}><Probe /></RealtimeProvider></AuthContext.Provider>
  );
  expect(connect).not.toHaveBeenCalled();
  expect(screen.getByText(/status:offline/)).toBeInTheDocument();
  signedOut.unmount();

  const socket = fakeSocket();
  const { unmount } = renderLive(<Probe />, { socket });
  unmount();
  expect(socket.disconnect).toHaveBeenCalled();
});

test('status follows the connection', () => {
  const { socket } = renderLive(<Probe />);
  expect(screen.getByText(/status:offline/)).toBeInTheDocument();
  act(() => socket.fire('connect'));
  expect(screen.getByText(/status:live/)).toBeInTheDocument();
  act(() => socket.fire('disconnect'));
  expect(screen.getByText(/status:offline/)).toBeInTheDocument();
  act(() => socket.fire('connect'));
  act(() => socket.fire('connect_error'));
  expect(screen.getByText(/status:offline/)).toBeInTheDocument();
});

describe('useLiveRefresh', () => {
  test('changes only when a matching resource is announced, after a short pause', () => {
    const { socket } = renderLive(<Probe resources={['incomes']} />);
    expect(screen.getByText(/tick:0/)).toBeInTheDocument();
    act(() => socket.fire('data:changed', change('expenses')));
    advance(500);
    expect(screen.getByText(/tick:0/)).toBeInTheDocument(); // not ours
    act(() => socket.fire('data:changed', change('incomes')));
    expect(screen.getByText(/tick:0/)).toBeInTheDocument(); // waits a moment first
    advance(400);
    expect(screen.getByText(/tick:1/)).toBeInTheDocument();
  });

  test('a burst of changes causes one refresh, not many', () => {
    const { socket } = renderLive(<Probe resources={['incomes']} />);
    for (let i = 0; i < 6; i += 1) act(() => { socket.fire('data:changed', change('incomes')); vi.advanceTimersByTime(50); });
    advance(500);
    expect(screen.getByText(/tick:1/)).toBeInTheDocument();
  });

  test('listens for several resources', () => {
    const { socket } = renderLive(<Probe resources={['users', 'roles']} />);
    act(() => socket.fire('data:changed', change('roles')));
    advance(400);
    expect(screen.getByText(/tick:1/)).toBeInTheDocument();
  });

  test('after a dropped connection comes back, everything refreshes to catch up', () => {
    const { socket } = renderLive(<Probe resources={['incomes']} />);
    act(() => socket.fire('connect'));
    act(() => socket.fire('disconnect'));
    act(() => socket.fire('connect'));
    advance(400);
    expect(screen.getByText(/tick:1/)).toBeInTheDocument();
  });

  test('the first connection does not cause a needless refresh', () => {
    const { socket } = renderLive(<Probe />);
    act(() => socket.fire('connect'));
    advance(500);
    expect(screen.getByText(/tick:0/)).toBeInTheDocument();
  });

  test('outside a provider it is inert', () => {
    render(<Probe />);
    expect(screen.getByText(/tick:0 status:offline/)).toBeInTheDocument();
  });
});

describe('changes to your own access', () => {
  test('access:changed re-reads who you are and what you may do', () => {
    const { socket, auth } = renderLive(<Probe />);
    act(() => socket.fire('access:changed'));
    expect(auth.refreshAccess).toHaveBeenCalledTimes(1);
  });
  test('access:revoked signs you out', () => {
    const { socket, auth } = renderLive(<Probe />);
    act(() => socket.fire('access:revoked'));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});
