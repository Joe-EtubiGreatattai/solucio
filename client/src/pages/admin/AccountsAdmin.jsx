import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useLiveRefresh } from '../../realtime/RealtimeProvider';
import Field from '../../components/Field';
import TableWrap from '../../components/TableWrap';
import { formatNaira, koboToNaira, nairaToKobo } from '../../utils/money';

const EMPTY = { name: '', type: 'bank', bankName: '', accountNumber: '', opening: '0' };

export default function AccountsAdmin() {
  const live = useLiveRefresh(['accounts']);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/accounts').then(setAccounts).catch((e) => setError(e.message));
  }, [live]);
  useEffect(load, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    const opening = nairaToKobo(form.opening === '' ? '0' : form.opening);
    if (!form.name.trim()) errs.name = 'Enter a name';
    if (opening === null) errs.opening = 'Enter a valid amount';
    if (form.type === 'bank') {
      if (!form.bankName.trim()) errs.bankName = 'Enter the bank name';
      if (!/^\d{4,20}$/.test(form.accountNumber.trim())) errs.accountNumber = 'Enter the account number (4-20 digits)';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = { name: form.name.trim(), openingBalance: opening };
    if (form.type === 'bank') Object.assign(body, { bankName: form.bankName.trim(), accountNumber: form.accountNumber.trim() });
    try {
      if (editingId) await api.patch(`/accounts/${editingId}`, body);
      else await api.post('/accounts', { ...body, type: form.type });
      setForm(EMPTY);
      setEditingId(null);
      setShowForm(false);
      setError('');
      load();
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.message);
    }
  };

  const edit = (a) => {
    setEditingId(a._id);
    setShowForm(true);
    setForm({ name: a.name, type: a.type, bankName: a.bankName || '', accountNumber: a.accountNumber || '', opening: koboToNaira(a.openingBalance) });
  };
  const toggle = (a) => api.patch(`/accounts/${a._id}`, { active: !a.active }).then(load).catch((e) => setError(e.message));

  return (
    <>
      <details className="workspace-disclosure" open={showForm} onToggle={(e) => setShowForm(e.currentTarget.open)}>
        <summary>{editingId ? 'Edit account' : 'Add account'}</summary>
        <form className="card grid" onSubmit={submit}>
        <Field label="Name" error={errors.name}><input value={form.name} onChange={set('name')} /></Field>
        <Field label="Type">
          <select value={form.type} onChange={set('type')} disabled={!!editingId}>
            <option value="bank">Bank</option><option value="cash">Cash</option>
          </select>
        </Field>
        {form.type === 'bank' && (
          <>
            <Field label="Bank name" error={errors.bankName}><input value={form.bankName} onChange={set('bankName')} /></Field>
            <Field label="Account number" error={errors.accountNumber}><input value={form.accountNumber} onChange={set('accountNumber')} /></Field>
          </>
        )}
        <Field label="Opening balance (₦)" error={errors.opening || errors.openingBalance}><input inputMode="decimal" value={form.opening} onChange={set('opening')} /></Field>
        <div className="row">
          <button>{editingId ? 'Update account' : 'Save account'}</button>
          {editingId && <button type="button" className="secondary" onClick={() => { setEditingId(null); setForm(EMPTY); setShowForm(false); }}>Cancel</button>}
        </div>
        </form>
      </details>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="card">
        <TableWrap label="Accounts">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Bank</th><th className="num">Opening balance</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a._id}>
                <td>{a.name}</td><td>{a.type}</td>
                <td>{a.type === 'bank' ? `${a.bankName} ${a.accountNumber}` : '-'}</td>
                <td className="num">{formatNaira(a.openingBalance)}</td>
                <td>{a.active ? 'Active' : 'Inactive'}</td>
                <td className="row actions">
                  <button className="link" aria-label={`Edit ${a.name}`} onClick={() => edit(a)}>Edit</button>
                  <button className="link" aria-label={`${a.active ? 'Deactivate' : 'Activate'} ${a.name}`} onClick={() => toggle(a)}>{a.active ? 'Deactivate' : 'Activate'}</button>
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
