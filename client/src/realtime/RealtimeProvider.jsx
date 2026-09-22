import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE, getToken } from '../api';
import { useAuth } from '../auth/AuthContext';

// Live updates. The server only announces WHAT changed ("incomes", "created"); the screen then re-fetches
// through the normal API, so permissions and data stay exactly as they are everywhere else.
const INERT = { status: 'offline', subscribe: () => () => {} };
const RealtimeContext = createContext(INERT);
export const useRealtime = () => useContext(RealtimeContext);

const defaultConnect = (url, options) => io(url, options);

export function RealtimeProvider({ children, connect = defaultConnect }) {
  const { user, refreshAccess, logout } = useAuth();
  const [status, setStatus] = useState('offline');
  const listeners = useRef(new Set());
  const latest = useRef({});
  latest.current = { refreshAccess, logout };
  const subscribe = useCallback((listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);
  const userId = user && user._id;

  useEffect(() => {
    if (!userId) {
      setStatus('offline');
      return undefined;
    }
    // The token is read again on every (re)connect, so a fresh sign-in is always used.
    const socket = connect(API_BASE || undefined, { auth: (send) => send({ token: getToken() }), transports: ['websocket', 'polling'] });
    const notify = (event) => listeners.current.forEach((listener) => listener(event));
    let connectedBefore = false;

    socket.on('connect', () => {
      setStatus('live');
      // Coming back after a gap means changes were missed, so every screen catches up.
      if (connectedBefore) notify({ resource: '*', action: 'resync' });
      connectedBefore = true;
    });
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('connect_error', () => setStatus('offline'));
    socket.on('data:changed', notify);
    socket.on('access:changed', () => latest.current.refreshAccess && latest.current.refreshAccess());
    socket.on('access:revoked', () => latest.current.logout && latest.current.logout());

    return () => {
      socket.disconnect();
      setStatus('offline');
    };
  }, [userId, connect]);

  return <RealtimeContext.Provider value={{ status, subscribe }}>{children}</RealtimeContext.Provider>;
}

// Returns a number that goes up whenever one of the named resources changes on the server.
// Put it in a data-loading effect's dependencies and that data reloads by itself.
// Bursts are grouped, so ten quick changes cause one reload.
export function useLiveRefresh(resources) {
  const { subscribe } = useRealtime();
  const [tick, setTick] = useState(0);
  const key = resources.join(',');
  useEffect(() => {
    let timer;
    const unsubscribe = subscribe((event) => {
      if (event.resource !== '*' && !resources.includes(event.resource)) return;
      clearTimeout(timer);
      timer = setTimeout(() => setTick((t) => t + 1), 250);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [subscribe, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return tick;
}
