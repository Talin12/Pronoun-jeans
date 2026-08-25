import React, { useState } from 'react';
import { Loader, Plus, X } from 'lucide-react';
import { addAttributeOption } from '../../api/adminApi';

const labelCls = 'block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1.5';

/**
 * Fit, fabric, length and the rest, picked as tags rather than typed.
 *
 * These are the lines that used to be retyped into the description on every
 * product ("Fabric: Oxford Lycra"), which is how the same fabric ended up
 * spelled three ways. Picking from a shared list means one value everywhere,
 * and the storefront can render them as a spec table instead of prose.
 *
 * Props:
 *   attributes  [{ id, name, multi_select, options: [{id, value}] }]
 *   selected    option ids currently on the product
 *   onChange    next option ids
 *   onAttributesChange  refresh callback, after an option is created here
 */
export default function AttributePicker({ attributes, selected, onChange, onAttributesChange }) {
  if (!attributes.length) {
    return (
      <p className="text-sm text-gray-400 dark:text-zinc-500">
        No attributes set up yet — add them under Attributes in the sidebar.
      </p>
    );
  }

  const toggle = (attribute, option) => {
    if (selected.includes(option.id)) {
      onChange(selected.filter(id => id !== option.id));
      return;
    }
    if (attribute.multi_select) {
      onChange([...selected, option.id]);
      return;
    }
    // Single-select: picking replaces rather than adds. The server refuses two
    // values here anyway, so silently letting both be selected would only
    // surface as a save error further down the form.
    const others = attribute.options.map(o => o.id);
    onChange([...selected.filter(id => !others.includes(id)), option.id]);
  };

  return (
    <div className="space-y-4">
      {attributes.map(attribute => (
        <AttributeRow
          key={attribute.id}
          attribute={attribute}
          selected={selected}
          onToggle={(option) => toggle(attribute, option)}
          onAttributesChange={onAttributesChange}
        />
      ))}
    </div>
  );
}

function AttributeRow({ attribute, selected, onToggle, onAttributesChange }) {
  const [adding, setAdding] = useState(false);
  const [value, setValue]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  const create = () => {
    const next = value.trim();
    if (!next) return;
    setBusy(true); setError('');
    addAttributeOption(attribute, next)
      .then(updated => {
        onAttributesChange(updated);
        setValue(''); setAdding(false);
      })
      .catch(() => setError('Could not add that option.'))
      .finally(() => setBusy(false));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className={labelCls}>
          {attribute.name}
          {attribute.multi_select && (
            <span className="ml-1.5 normal-case font-semibold text-gray-400 dark:text-zinc-500">
              (pick any)
            </span>
          )}
        </label>
        <button type="button" onClick={() => { setAdding(a => !a); setError(''); }}
          className="text-xs font-bold text-accent hover:underline mb-1.5">
          {adding ? 'Cancel' : '+ New'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {attribute.options.map(option => {
          const on = selected.includes(option.id);
          return (
            <button key={option.id} type="button" onClick={() => onToggle(option)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
                on ? 'bg-accent text-white border-accent'
                   : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-zinc-300 hover:border-accent'
              }`}>
              {option.value}
              {on && <X size={12} className="inline ml-1.5 -mt-0.5" />}
            </button>
          );
        })}
        {!attribute.options.length && !adding && (
          <p className="text-sm text-gray-400 dark:text-zinc-500">
            No options yet — add the first with “+ New”.
          </p>
        )}
      </div>

      {adding && (
        <div className="flex items-center gap-2 mt-2">
          <input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create(); } }}
            placeholder={`New ${attribute.name.toLowerCase()}…`}
            className="flex-1 max-w-xs px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40" />
          <button type="button" onClick={create} disabled={busy || !value.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-white text-sm font-bold disabled:opacity-50">
            {busy ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} Add
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
