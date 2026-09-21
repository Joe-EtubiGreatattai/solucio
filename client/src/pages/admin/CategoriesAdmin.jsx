import { useEffect, useState } from 'react';
import { api } from '../../api';
import Field from '../../components/Field';

export default function CategoriesAdmin() {
  const [tree, setTree] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [fieldError, setFieldError] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/categories/all').then(setTree).catch((e) => setError(e.message));
  }, []);

  const setDraft = (key, value) => setDrafts((d) => ({ ...d, [key]: value }));
  // Every change returns the whole tree, so the screen always shows exactly what the server has.
  const run = async (request, clearKey) => {
    try {
      setTree(await request());
      setError('');
      if (clearKey) setDraft(clearKey, '');
    } catch (err) {
      setError(err.message);
    }
  };
  const add = (key, path, body) => (e) => {
    e.preventDefault();
    const name = (drafts[key] || '').trim();
    if (!name) return setFieldError({ [key]: 'Enter a name' });
    setFieldError({});
    return run(() => api.post(path, { ...body, name }), key);
  };
  const toggle = (body, active) => run(() => api.patch('/categories/active', { ...body, active }));
  const input = (key, label) => (
    <input aria-label={label} value={drafts[key] || ''} maxLength={60} onChange={(e) => setDraft(key, e.target.value)} />
  );
  const showHide = (node, label, body) => (
    <button type="button" className="link" aria-label={`${node.active ? 'Hide' : 'Show'} ${label}`} onClick={() => toggle(body, !node.active)}>
      {node.active ? 'Hide' : 'Show'}
    </button>
  );

  return (
    <>
      <p className="muted">
        Add the categories, groups and items your expenses need. Something you hide disappears from new expenses;
        past expenses keep it, so nothing is ever lost.
      </p>
      <details className="workspace-disclosure">
        <summary>Add category</summary>
        <form className="card row category-add" onSubmit={add('new-category', '/categories/types', {})}>
          <Field label="New category" error={fieldError['new-category']}>
            {input('new-category', 'New category')}
          </Field>
          <button>Add category</button>
        </form>
      </details>
      {error && <p className="error" role="alert">{error}</p>}
      {tree.map((c) => (
        <details key={c.type} className={`card category category-disclosure${c.active ? '' : ' is-hidden'}`}>
          <summary>{c.type}{!c.active && ' (hidden)'}</summary>
          <section>
          <div className="row category-head">
            <h2>{c.type}</h2>
            {!c.active && <small className="muted">Hidden</small>}
            {showHide(c, `category ${c.type}`, { type: c.type })}
          </div>
          <ul className="tree">
            {c.groups.map((g) => (
              <li key={g.name} className={g.active ? '' : 'is-hidden'}>
                <div className="row">
                  <b>{g.name}</b>
                  {!g.active && <small className="muted">Hidden</small>}
                  {showHide(g, `group ${g.name} in ${c.type}`, { type: c.type, group: g.name })}
                </div>
                <ul className="items">
                  {g.items.map((i) => (
                    <li key={i.name} className={i.active ? '' : 'is-hidden'}>
                      <span>{i.name}</span>
                      {!i.active && <small className="muted">Hidden</small>}
                      {showHide(i, `item ${i.name} in ${g.name}`, { type: c.type, group: g.name, item: i.name })}
                    </li>
                  ))}
                </ul>
                <form className="row add-inline" onSubmit={add(`${c.type}|${g.name}`, '/categories/items', { type: c.type, group: g.name })}>
                  <Field label={`New item in ${g.name}`} error={fieldError[`${c.type}|${g.name}`]}>
                    {input(`${c.type}|${g.name}`, `New item in ${g.name}`)}
                  </Field>
                  <button className="secondary" aria-label={`Add item to ${g.name}`}>Add item</button>
                </form>
              </li>
            ))}
          </ul>
          <form className="row add-inline" onSubmit={add(c.type, '/categories/groups', { type: c.type })}>
            <Field label={`New group in ${c.type}`} error={fieldError[c.type]}>
              {input(c.type, `New group in ${c.type}`)}
            </Field>
            <button className="secondary" aria-label={`Add group to ${c.type}`}>Add group</button>
          </form>
          </section>
        </details>
      ))}
    </>
  );
}
