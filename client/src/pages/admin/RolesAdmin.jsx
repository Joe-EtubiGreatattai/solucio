import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useLiveRefresh } from '../../realtime/RealtimeProvider';
import Field from '../../components/Field';
import TableWrap from '../../components/TableWrap';

const EMPTY = { name: '', description: '', permissions: [] };

export default function RolesAdmin() {
  const live = useLiveRefresh(['roles', 'users']);
  const [data, setData] = useState({ roles: [], permissions: [] });
  const [form, setForm] = useState(EMPTY);
  const [editingKey, setEditingKey] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmKey, setConfirmKey] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletingKey, setDeletingKey] = useState(null);

  const load = useCallback(() => {
    api.get('/roles').then(setData).catch((e) => setError(e.message));
  }, [live]);
  useEffect(load, [load]);

  // The permission list comes from the server, grouped for display in the order it sends them.
  const groups = [];
  for (const p of data.permissions) {
    let group = groups.find((g) => g.name === p.group);
    if (!group) { group = { name: p.group, items: [] }; groups.push(group); }
    group.items.push(p);
  }

  const toggle = (key) => setForm((f) => ({
    ...f,
    permissions: f.permissions.includes(key) ? f.permissions.filter((k) => k !== key) : [...f.permissions, key],
  }));
  const reset = () => { setForm(EMPTY); setEditingKey(null); setErrors({}); setShowForm(false); };
  const edit = (role) => {
    setEditingKey(role.key);
    setShowForm(true);
    setForm({ name: role.name, description: role.description || '', permissions: [...role.permissions] });
    setErrors({});
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setErrors({ name: 'Give the role a name' });
    setBusy(true);
    try {
      const body = { name: form.name.trim(), description: form.description.trim(), permissions: form.permissions };
      if (editingKey) await api.patch(`/roles/${editingKey}`, body);
      else await api.post('/roles', body);
      reset();
      setError('');
      load();
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (role) => {
    setDeletingKey(role.key);
    try {
      await api.delete(`/roles/${role.key}`);
      setConfirmKey(null);
      setError('');
      load();
    } catch (err) {
      setConfirmKey(null);
      setError(err.message);
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <>
      <details className="workspace-disclosure" open={showForm} onToggle={(e) => setShowForm(e.currentTarget.open)}>
        <summary>{editingKey ? 'Edit role' : 'New role'}</summary>
        <form className="card" onSubmit={submit}>
        <h2>{editingKey ? `Edit role: ${data.roles.find((r) => r.key === editingKey)?.name || ''}` : 'New role'}</h2>
        <div className="grid">
          <Field label="Role name" error={errors.name}>
            <input value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Description" error={errors.description}>
            <input value={form.description} maxLength={200} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
        <div className="permissions">
          {groups.map((g) => (
            <fieldset key={g.name}>
              <legend>{g.name}</legend>
              {g.items.map((p) => (
                <label key={p.key} className="check">
                  <input type="checkbox" checked={form.permissions.includes(p.key)} onChange={() => toggle(p.key)} />
                  <span>{p.label}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <div className="row">
          <button disabled={busy}>{editingKey ? 'Update role' : 'Save role'}</button>
          {editingKey && <button type="button" className="secondary" onClick={reset}>Cancel</button>}
        </div>
        </form>
      </details>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="card">
        <TableWrap label="Roles">
          <table>
            <thead>
              <tr><th>Role</th><th>Description</th><th className="num">Users</th><th>Access</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {data.roles.map((r) => (
                <tr key={r.key}>
                  <td>{r.name}{r.builtIn && <small className="muted"> Built-in</small>}</td>
                  <td>{r.description}</td>
                  <td className="num">{r.userCount}</td>
                  <td>{`${r.permissions.length} of ${data.permissions.length}`}</td>
                  <td className="row actions">
                    {r.key === 'admin' && <span className="muted">Locked</span>}
                    {r.key !== 'admin' && (
                      <button type="button" className="link" aria-label={`Edit ${r.name}`} onClick={() => edit(r)}>Edit</button>
                    )}
                    {r.key !== 'admin' && !r.builtIn && confirmKey !== r.key && (
                      <button type="button" className="link danger-text" aria-label={`Delete ${r.name}`} onClick={() => setConfirmKey(r.key)}>Delete</button>
                    )}
                    {confirmKey === r.key && (
                      <>
                        <button type="button" className="link danger-text" aria-label={`Confirm delete ${r.name}`} disabled={deletingKey === r.key} onClick={() => remove(r)}>{deletingKey === r.key ? 'Deleting…' : 'Confirm delete'}</button>
                        <button type="button" className="link" aria-label="Cancel delete" disabled={deletingKey === r.key} onClick={() => setConfirmKey(null)}>Cancel</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </>
  );
}
