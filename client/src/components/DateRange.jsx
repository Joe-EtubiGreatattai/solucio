import Field from './Field';
import { rangeFor } from '../utils/dates';

export default function DateRange({ value, onChange }) {
  return (
    <div className="card row date-range-controls">
      <button type="button" className="secondary" onClick={() => onChange(rangeFor('today'))}>Today</button>
      <button type="button" className="secondary" onClick={() => onChange(rangeFor('week'))}>This week</button>
      <button type="button" className="secondary" onClick={() => onChange(rangeFor('month'))}>This month</button>
      <Field label="From"><input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} /></Field>
      <Field label="To"><input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} /></Field>
    </div>
  );
}
