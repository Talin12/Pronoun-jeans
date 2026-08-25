import React, { useEffect, useState } from 'react';
import {
  AlertCircle, Check, Loader, Plus, Tags, Trash2, X,
} from 'lucide-react';
import {
  createAttribute, deleteAttribute, listAttributes, updateAttribute,
} from '../../api/adminApi';

// text-base on phones: anything under 16px makes iOS Safari zoom in on focus.
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40';
const labelCls = 'block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1.5';
const btnPrimary = 'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-50';
const btnGhost = 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-bold text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/5 transition';

const errMsg = (err, fallback) => {
  const d = err.response?.data;
  if (!d) return fallback;
  if (typeof d === 'string') return d;
  if (d.error) return d.error;
  return Object.entries(d)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${[].concat(v).join(' ')}`)
    .join(' • ') || fallback;
};

/**
 * Product attributes — the spec lines every product is tagged with.
 *
 * "Fit" is an attribute; "Slim Fit" is one of its options. They exist so those
 * lines stop being retyped into each product's description, where the same
 * fabric ended up spelled three different ways and nothing could be filtered on.
 *
 * Attributes in use are deactivated, never deleted: the link to products is an
 * M2M, so deleting one silently strips that spec line off every product
 * carrying it. The API refuses that and this page surfaces the refusal.
 */
export default function AdminAttributes() {
  const [attributes, setAttributes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [adding, setAdding]   = useState(false);

  const load = () => {
    setLoading(true);
    // include_inactive: a retired attribute has to stay visible here, or there
    // is no way to switch it back on.
    listAttributes(true)
      .then(setAttributes)
      .catch(() => setAttributes([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const replace = (updated) =>
    setAttributes(list => list.map(a => (a.id === updated.id ? updated : a)));

  const remove = (attribute) => {
    if (!window.confirm(`Delete "${attribute.name}"?`)) return;
    setError('');
    deleteAttribute(attribute.id)
      .then(load)
      .catch(err => setError(errMsg(err, `Could not delete "${attribute.name}".`)));
  };

  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-accent text-xs font-black uppercase tracking-widest mb-1">Admin Panel</p>
      <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100 mb-1">Product Attributes</h1>
      <p className="text-gray-500 dark:text-zinc-400 text-sm mb-6">
        The spec lines products are tagged with — Fit, Fabric, Length. Pick them on a
        product instead of typing them into its description.
      </p>

      {error && (
        <div className="flex items-start gap-2 mb-4 px-4 py-3 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-sm font-semibold text-red-700 dark:text-red-400">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {adding ? (
        <AttributeForm
          onCancel={() => setAdding(false)}
          onSaved={(created) => { setAttributes(list => [...list, created]); setAdding(false); }}
        />
      ) : (
        <button onClick={() => { setError(''); setAdding(true); }} className={`${btnPrimary} mb-6`}>
          <Plus size={16} /> New attribute
        </button>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader className="animate-spin" /></div>
      ) : !attributes.length ? (
        <div className="text-center py-16 text-gray-400">
          <Tags size={38} className="mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No attributes yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {attributes.map(attribute => (
            <AttributeCard key={attribute.id} attribute={attribute}
              onChange={replace} onDelete={() => remove(attribute)} onError={setError} />
          ))}
        </div>
      )}
    </div>
  );
}

function AttributeCard({ attribute, onChange, onDelete, onError }) {
  const [value, setValue] = useState('');
  const [busy, setBusy]   = useState(false);

  const save = (patch) => {
    setBusy(true); onError('');
    updateAttribute(attribute.id, patch)
      .then(onChange)
      .catch(err => onError(errMsg(err, 'Could not save.')))
      .finally(() => setBusy(false));
  };

  // The API reconciles the whole options list on write, so every option has to
  // be sent back — anything left out is treated as removed.
  const allOptions = () => attribute.options.map(o => ({ id: o.id, value: o.value, order: o.order }));

  const addOption = () => {
    const next = value.trim();
    if (!next) return;
    save({ options: [...allOptions(), { value: next }] });
    setValue('');
  };

  const removeOption = (option) =>
    save({ options: allOptions().filter(o => o.id !== option.id) });

  return (
    <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-5">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h2 className="font-black text-gray-900 dark:text-zinc-100">{attribute.name}</h2>
        {attribute.multi_select && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
            multiple allowed
          </span>
        )}
        {!attribute.is_active && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-zinc-400">
            hidden from editor
          </span>
        )}
        <span className="text-xs text-gray-400 dark:text-zinc-500">
          {attribute.product_count} product{attribute.product_count === 1 ? '' : 's'}
        </span>

        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => save({ is_active: !attribute.is_active })} disabled={busy}
            className={btnGhost}>
            {attribute.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button onClick={onDelete} aria-label={`Delete ${attribute.name}`}
            className="p-2.5 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {attribute.options.map(option => (
          <span key={option.id}
            className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-gray-100 dark:bg-white/5 text-sm text-gray-700 dark:text-zinc-300">
            {option.value}
            <button onClick={() => removeOption(option)} disabled={busy}
              aria-label={`Remove ${option.value}`}
              className="w-6 h-6 rounded-full hover:bg-red-100 dark:hover:bg-red-500/20 text-gray-400 hover:text-red-500 flex items-center justify-center">
              <X size={12} />
            </button>
          </span>
        ))}
        {!attribute.options.length && (
          <p className="text-sm text-gray-400 dark:text-zinc-500">No options yet.</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
          placeholder={`Add a ${attribute.name.toLowerCase()}…`}
          className="flex-1 max-w-xs px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40" />
        <button onClick={addOption} disabled={busy || !value.trim()} className={btnPrimary}>
          {busy ? <Loader size={15} className="animate-spin" /> : <Plus size={15} />} Add
        </button>
      </div>
    </div>
  );
}

function AttributeForm({ onCancel, onSaved }) {
  const [name, setName]   = useState('');
  const [multi, setMulti] = useState(false);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  const save = () => {
    setBusy(true); setError('');
    createAttribute({ name: name.trim(), multi_select: multi })
      .then(onSaved)
      .catch(err => setError(errMsg(err, 'Could not create that attribute.')))
      .finally(() => setBusy(false));
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-accent/30 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-black text-gray-900 dark:text-zinc-100">New attribute</h3>
        <button onClick={onCancel}><X size={18} className="text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200" /></button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

      <label className={labelCls}>Name</label>
      <input className={inputCls} value={name} onChange={e => setName(e.target.value)}
        placeholder="e.g. Wash, Pocket Style" />

      <label className="flex items-center gap-2 mt-3 text-sm text-gray-600 dark:text-zinc-300 cursor-pointer">
        <input type="checkbox" checked={multi} onChange={e => setMulti(e.target.checked)} className="accent-accent" />
        Allow more than one value per product
      </label>
      <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
        Leave off for things a product has exactly one of, like Fit. Turn on for
        ones it can have several of, like Length.
      </p>

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onCancel} className={btnGhost}>Cancel</button>
        <button onClick={save} disabled={busy || !name.trim()} className={btnPrimary}>
          {busy ? <Loader size={15} className="animate-spin" /> : <Check size={15} />} Create
        </button>
      </div>
    </div>
  );
}
