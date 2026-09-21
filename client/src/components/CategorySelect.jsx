import Field from './Field';

export default function CategorySelect({ categories, value, onChange, errors = {} }) {
  const groups = (categories.find((c) => c.type === value.type) || {}).groups || [];
  const items = (groups.find((g) => g.name === value.group) || {}).items || [];
  return (
    <>
      <Field label="Category type" error={errors.type}>
        <select value={value.type} onChange={(e) => onChange({ type: e.target.value, group: '', item: '' })}>
          <option value="">Choose…</option>
          {categories.map((c) => <option key={c.type} value={c.type}>{c.type}</option>)}
        </select>
      </Field>
      {value.type && (
        <Field label="Group" error={errors.group}>
          <select value={value.group} onChange={(e) => onChange({ ...value, group: e.target.value, item: '' })}>
            <option value="">Choose…</option>
            {groups.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
        </Field>
      )}
      {items.length > 0 && (
        <Field label="Item" error={errors.item}>
          <select value={value.item} onChange={(e) => onChange({ ...value, item: e.target.value })}>
            <option value="">Choose…</option>
            {items.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
      )}
    </>
  );
}
