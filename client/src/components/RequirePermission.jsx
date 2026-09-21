import { useAuth } from '../auth/AuthContext';

export default function RequirePermission({ check, children }) {
  const access = useAuth();
  return check(access) ? children : <p className="error">You are not allowed to view this page.</p>;
}
