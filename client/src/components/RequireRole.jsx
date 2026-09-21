import { useAuth } from '../auth/AuthContext';

export default function RequireRole({ roles, children }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <p className="error">You are not allowed to view this page.</p>;
}
