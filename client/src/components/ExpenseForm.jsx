import { useState } from 'react';
import Field from './Field';
import CategorySelect from './CategorySelect';
import { nairaToKobo } from '../utils/money';
import { lagosToday } from '../utils/dates';
import { accountLabel } from '../utils/labels';

const AMOUNT_HINT = 'Enter a valid amount, e.g. 1500 or 1500.50';

export default function ExpenseForm({ accounts, categories, onSubmit }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(lagosToday());
  const [accountId, setAccountId] = useState('');
  const [cat, setCat] = useState({ type: '', group: '', item: '' });
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // Check the amount as soon as the field is left; an empty field is left for submit to flag.
  const checkAmount = () => {
    if (!amount.trim()) return;
    setErrors(({ amount: _previous, ...rest }) => (nairaToKobo(amount) ? rest : { ...rest, amount: AMOUNT_HINT }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    const kobo = nairaToKobo(amount);
    const group = ((categories.find((c) => c.type === cat.type) || {}).groups || []).find((g) => g.name === cat.group);
    if (!kobo) errs.amount = AMOUNT_HINT;
    if (!accountId) errs.accountId = 'Choose the account paid from';
    if (!date) errs.date = 'Choose a date';
    if (!cat.type) errs.type = 'Choose a category type';
    else if (!cat.group) errs.group = 'Choose a group';
    else if (group && group.items.length > 0 && !cat.item) errs.item = 'Choose an item';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onSubmit({ amount: kobo, date, accountId, type: cat.type, group: cat.group, item: cat.item || null, note: note.trim() || undefined });
      setAmount('');
      setNote('');
    } catch (err) {
      setErrors({ ...err.fields, form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card grid" onSubmit={submit}>
      <Field label="Amount (₦)" error={errors.amount}>
        <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={checkAmount} />
      </Field>
      <Field label="Date" error={errors.date}>
        <input type="date" max={lagosToday()} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Account" error={errors.accountId}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Choose account…</option>
          {accounts.map((a) => <option key={a._id} value={a._id}>{accountLabel(a)}</option>)}
        </select>
      </Field>
      <CategorySelect categories={categories} value={cat} onChange={setCat} errors={{ ...errors, type: errors.type || errors.category }} />
      <Field label="Note (optional)" error={errors.note}>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>
      <button disabled={busy}>{busy ? 'Saving…' : 'Record expense'}</button>
      {errors.form && <p className="error" role="alert">{errors.form}</p>}
    </form>
  );
}
