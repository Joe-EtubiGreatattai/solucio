import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useLiveRefresh } from '../../realtime/RealtimeProvider';
import Field from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';

export default function CategoriesAdmin() {
  const live = useLiveRefresh(['categories']);
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [fieldError, setFieldError] = useState({});
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [editing, setEditing] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [kind, setKind] = useState('expense');
  const noun = kind === 'income' ? 'income' : 'expenses';

  useEffect(() => {
    setLoading(true);
    api.get('/categories/all', { kind }).then(setTree).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [live, kind]);

  // Income and expense keep separate trees; switching clears any half-typed drafts.
  const chooseKind = (next) => { setKind(next); setDrafts({}); setConfirming(null); setError(''); setFieldError({}); };

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
    return run(() => api.post(path, { ...body, name, kind }), key);
  };
  const toggle = (body, active) => run(() => api.patch('/categories/active', { ...body, active, kind }));
  // Removing is permanent, so it takes a second click; the server refuses anything an expense still uses.
  const remove = async (label, body) => {
    setRemoving(label);
    await run(() => api.post('/categories/remove', { ...body, kind }));
    setRemoving(null);
    setConfirming(null);
  };
  // Renaming cascades to past records on the server, so the whole tree comes back changed.
  const startRename = (label, current) => { setError(''); setConfirming(null); setRenameDraft(current); setEditing(label); };
  const submitRename = async (label, body) => {
    const name = (renameDraft || '').trim();
    if (!name) return;
    setRenaming(true);
    try {
      setTree(await api.post('/categories/rename', { ...body, name, kind }));
      setError('');
      setEditing(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setRenaming(false);
    }
  };
  const renameControls = (label, body, current) => (editing === label ? (
    <span className="rename-inline">
      <input aria-label={`New name for ${label}`} value={renameDraft} maxLength={60} autoFocus onChange={(e) => setRenameDraft(e.target.value)} />
      <button type="button" className="link" disabled={renaming} onClick={() => submitRename(label, body)}>{renaming ? 'Saving…' : 'Save'}</button>
      <button type="button" className="link" disabled={renaming} onClick={() => setEditing(null)}>Cancel</button>
    </span>
  ) : (
    <button type="button" className="link" aria-label={`Rename ${label}`} onClick={() => startRename(label, current)}>Edit</button>
  ));
  const removeControls = (label, body) => (confirming === label ? (
    <>
      <button type="button" className="link danger-text" aria-label={`Confirm remove ${label}`} disabled={removing === label} onClick={() => remove(label, body)}>
        {removing === label ? 'Removing…' : 'Confirm remove'}
      </button>
      <button type="button" className="link" aria-label="Cancel remove" disabled={removing === label} onClick={() => setConfirming(null)}>Cancel</button>
    </>
  ) : (
    <button type="button" className="link danger-text" aria-label={`Remove ${label}`} onClick={() => { setError(''); setConfirming(label); }}>Remove</button>
  ));
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
      <div className="ledger-switch" role="tablist" aria-label="Category ledger">
        <button type="button" role="tab" aria-selected={kind === 'expense'} className={`ledger-tab ${kind === 'expense' ? 'active' : ''}`} onClick={() => chooseKind('expense')}>Expense categories</button>
        <button type="button" role="tab" aria-selected={kind === 'income'} className={`ledger-tab ${kind === 'income' ? 'active' : ''}`} onClick={() => chooseKind('income')}>Income categories</button>
      </div>
      <p className="muted">
        Add the categories, groups and items your {noun} need. Something you hide disappears from new {noun};
        past records keep it, so nothing is ever lost. Remove is only for things nothing uses yet, like a typo.
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
      {loading ? (
        <div className="category-loading" aria-busy="true">
          <Skeleton label="Loading categories…" />
          <span className="skeleton" aria-hidden="true" />
          <span className="skeleton" aria-hidden="true" />
        </div>
      ) : tree.map((c) => (
        <details key={c.type} className={`card category category-disclosure${c.active ? '' : ' is-hidden'}`}>
          <summary>{c.type}{!c.active && ' (hidden)'}</summary>
          <section>
          <div className="row category-head">
            <h2>{c.type}</h2>
            {!c.active && <small className="muted">Hidden</small>}
            {showHide(c, `category ${c.type}`, { type: c.type })}
            {renameControls(`category ${c.type}`, { type: c.type }, c.type)}
            {removeControls(`category ${c.type}`, { type: c.type })}
          </div>
          <ul className="tree">
            {c.groups.map((g) => (
              <li key={g.name} className={g.active ? '' : 'is-hidden'}>
                <div className="row">
                  <b>{g.name}</b>
                  {!g.active && <small className="muted">Hidden</small>}
                  {showHide(g, `group ${g.name} in ${c.type}`, { type: c.type, group: g.name })}
                  {renameControls(`group ${g.name} in ${c.type}`, { type: c.type, group: g.name }, g.name)}
                  {removeControls(`group ${g.name} in ${c.type}`, { type: c.type, group: g.name })}
                </div>
                <ul className="items">
                  {g.items.map((i) => (
                    <li key={i.name} className={i.active ? '' : 'is-hidden'}>
                      <span>{i.name}</span>
                      {!i.active && <small className="muted">Hidden</small>}
                      {showHide(i, `item ${i.name} in ${g.name}`, { type: c.type, group: g.name, item: i.name })}
                      {renameControls(`item ${i.name} in ${g.name}`, { type: c.type, group: g.name, item: i.name }, i.name)}
                      {removeControls(`item ${i.name} in ${g.name}`, { type: c.type, group: g.name, item: i.name })}
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
