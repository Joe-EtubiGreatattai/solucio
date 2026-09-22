import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useLiveRefresh } from '../../realtime/RealtimeProvider';
import { useAuth } from '../../auth/AuthContext';
import Field from '../../components/Field';
import TableWrap from '../../components/TableWrap';

const ADMIN = 'admin';
const EMPTY = { name: '', email: '', password: '', role: '' };

export default function UsersAdmin() {
  const usersLive = useLiveRefresh(['users']);
  const rolesLive = useLiveRefresh(['roles']);
  const { user: me, isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/users').then(setUsers).catch((e) => setError(e.message));
  }, [usersLive]);
  useEffect(load, [load]);
  useEffect(() => {
    api.get('/roles').then((d) => setRoles(d.roles)).catch((e) => setError(e.message));
  }, [rolesLive]);

  // Only an admin can hand out the Admin role; everyone else who manages users never sees it.
  const choices = isAdmin ? roles : roles.filter((r) => r.key !== ADMIN);
  const roleValue = form.role || (choices[0] && choices[0].key) || '';
  // A user's current role always appears, even if that role has since been deleted.
  const optionsFor = (u) => (choices.some((r) => r.key === u.role)
    ? choices
    : [...choices, { key: u.role, name: (roles.find((r) => r.key === u.role) || {}).name || u.role }]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', { ...form, role: roleValue });
      setForm(EMPTY);
      setErrors({});
      setError('');
      load();
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.message);
    }
  };
  const patch = (u, body) => api.patch(`/users/${u._id}`, body).then(load).catch((e) => setError(e.message));

  return (
    <>
      <details className="workspace-disclosure">
        <summary>Add user</summary>
        <form className="card grid" onSubmit={submit}>
          <Field label="Name" error={errors.name}><input value={form.name} onChange={set('name')} required /></Field>
          <Field label="Email" error={errors.email}><input type="email" value={form.email} onChange={set('email')} required /></Field>
          <Field label="Password" error={errors.password}><input type="password" value={form.password} onChange={set('password')} required /></Field>
          <Field label="Role" error={errors.role}>
            <select value={roleValue} onChange={set('role')}>
              {choices.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
          </Field>
          <button>Add user</button>
        </form>
      </details>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="card">
        <TableWrap label="Users">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {users.map((u) => {
              // You cannot change yourself, and only an admin can change an admin.
              const locked = u._id === me._id || (!isAdmin && u.role === ADMIN);
              return (
                <tr key={u._id}>
                  <td>{u.name}</td><td>{u.email}</td>
                  <td>
                    <select aria-label={`Role for ${u.name}`} value={u.role} disabled={locked} onChange={(e) => patch(u, { role: e.target.value })}>
                      {optionsFor(u).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                    </select>
                  </td>
                  <td>{u.active ? 'Active' : 'Inactive'}</td>
                  <td><button className="link" aria-label={`${u.active ? 'Deactivate' : 'Activate'} ${u.name}`} disabled={locked} onClick={() => patch(u, { active: !u.active })}>{u.active ? 'Deactivate' : 'Activate'}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </TableWrap>
      </div>
    </>
  );
}
