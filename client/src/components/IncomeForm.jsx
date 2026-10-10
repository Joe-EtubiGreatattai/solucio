import { useState } from 'react';
import Field from './Field';
import AmountInput from './AmountInput';
import CategorySelect from './CategorySelect';
import { nairaToKobo } from '../utils/money';
import { lagosToday } from '../utils/dates';
import { accountLabel } from '../utils/labels';
import { useStoredState } from '../hooks/useStoredState';

const AMOUNT_HINT = 'Enter a valid amount, e.g. 1500 or 1500.50';

export default function IncomeForm({ accounts, categories = [], onSubmit }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(lagosToday());
  const [method, setMethod] = useStoredState('solucio:last-income-method', 'transfer');
  const [accountId, setAccountId] = useStoredState('solucio:last-income-account', '');
  const [cat, setCat] = useState({ type: '', group: '', item: '' });
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
    if (!kobo) errs.amount = AMOUNT_HINT;
    if (!accountId) errs.accountId = 'Choose the account paid into';
    if (!date) errs.date = 'Choose a date';
    // Category is optional, but once a type is chosen it must be completed like an expense.
    if (cat.type) {
      const group = ((categories.find((c) => c.type === cat.type) || {}).groups || []).find((g) => g.name === cat.group);
      if (!cat.group) errs.group = 'Choose a group';
      else if (group && group.items.length > 0 && !cat.item) errs.item = 'Choose an item';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const category = cat.type ? { type: cat.type, group: cat.group, item: cat.item || null } : {};
      await onSubmit({ amount: kobo, date, method, accountId, ...category });
      setAmount('');
      setCat({ type: '', group: '', item: '' });
    } catch (err) {
      setErrors({ ...err.fields, form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card grid" onSubmit={submit}>
      <Field label="Amount (₦)" error={errors.amount}>
        <AmountInput placeholder="0.00" value={amount} onChange={setAmount} onBlur={checkAmount} />
      </Field>
      <Field label="Date" error={errors.date}>
        <input type="date" max={lagosToday()} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Method" error={errors.method}>
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="transfer">Bank transfer</option>
          <option value="pos">POS</option>
          <option value="cash">Cash</option>
        </select>
      </Field>
      <Field label="Account" error={errors.accountId}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Choose account…</option>
          {accounts.map((a) => <option key={a._id} value={a._id}>{accountLabel(a)}</option>)}
        </select>
      </Field>
      {categories.length > 0 && <CategorySelect categories={categories} value={cat} onChange={setCat} errors={errors} />}
      <button disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</button>
      {errors.form && <p className="error" role="alert">{errors.form}</p>}
    </form>
  );
}
