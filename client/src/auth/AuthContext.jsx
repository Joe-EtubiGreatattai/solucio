import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../api';

// Outside a provider nobody is allowed to do anything. The server enforces access; this only decides what to show.
const NONE = { user: null, permissions: [], roleName: '', isAdmin: false, can: () => false, loading: false };
export const AuthContext = createContext(NONE);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [access, setAccess] = useState({ permissions: [], roleName: '' });
  const [loading, setLoading] = useState(!!getToken());

  const startSession = (r) => {
    setUser(r.user);
    setAccess({ permissions: r.permissions || [], roleName: r.roleName || '' });
  };
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setAccess({ permissions: [], roleName: '' });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return;
    api.get('/auth/me').then(startSession).catch(logout).finally(() => setLoading(false));
  }, [logout]);

  const login = async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    setToken(r.token);
    startSession(r);
  };

  const value = useMemo(() => ({
    user,
    loading,
    login,
    logout,
    roleName: access.roleName,
    permissions: access.permissions,
    isAdmin: !!user && user.role === 'admin',
    can: (permission) => access.permissions.includes(permission),
  }), [user, access, loading, logout]); // eslint-disable-line react-hooks/exhaustive-deps

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
