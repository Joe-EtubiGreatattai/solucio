import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import Field from '../../components/Field';

const ROLES = ['cashier', 'accountant', 'admin'];
const EMPTY = { name: '', email: '', password: '', role: 'cashier' };

export default function UsersAdmin() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/users').then(setUsers).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', form);
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
      <form className="card grid" onSubmit={submit}>
        <Field label="Name" error={errors.name}><input value={form.name} onChange={set('name')} required /></Field>
        <Field label="Email" error={errors.email}><input type="email" value={form.email} onChange={set('email')} required /></Field>
        <Field label="Password" error={errors.password}><input type="password" value={form.password} onChange={set('password')} required /></Field>
        <Field label="Role">
          <select value={form.role} onChange={set('role')}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
        </Field>
        <button>Add user</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {users.map((u) => {
              const self = u._id === me._id;
              return (
                <tr key={u._id}>
                  <td>{u.name}</td><td>{u.email}</td>
                  <td>
                    <select value={u.role} disabled={self} onChange={(e) => patch(u, { role: e.target.value })}>
                      {ROLES.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>{u.active ? 'Active' : 'Inactive'}</td>
                  <td><button className="secondary" disabled={self} onClick={() => patch(u, { active: !u.active })}>{u.active ? 'Deactivate' : 'Activate'}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
