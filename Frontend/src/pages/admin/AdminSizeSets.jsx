import React, { useEffect, useState } from 'react';
import {
  AlertCircle, Check, Loader, Plus, Ruler, Trash2, X,
} from 'lucide-react';
import {
  createSizeSet, deleteSizeSet, listSizeSets, updateSizeSet,
} from '../../api/adminApi';

// text-base on phones: anything under 16px makes iOS Safari zoom in on focus.
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40';
const labelCls = 'block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1.5';
const btnPrimary = 'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-50';
const btnGhost = 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-bold text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/5 transition';

/** "2xL, 1xXL" from [{qty:2,size:'L'},{qty:1,size:'XL'}] — the stored form. */
const toBreakdownString = (rows) =>
  rows.filter(r => r.size.trim() && Number(r.qty) > 0)
      .map(r => `${Number(r.qty)}x${r.size.trim()}`).join(', ');

const countPieces = (rows) =>
  rows.filter(r => r.size.trim() && Number(r.qty) > 0)
      .reduce((sum, r) => sum + Number(r.qty), 0);

/**
 * Size sets and their breakdowns.
 *
 * A set ("L TO 3XL") names a range; its breakdowns are the distributions a
 * variation can be sold in ("1xL, 1xXL, 1xXXL, 1x3XL" = 4 pieces). Pieces drive
 * variation pricing, so they are derived from the size/qty rows rather than
 * typed — a breakdown whose pieces disagree with its string would misprice.
 *
 * Sets in use are deactivated, never deleted: ProductVariation.size_set is
 * SET_NULL, so deleting one would strip the size from live products. The API
 * refuses it and this page surfaces that.
 */
export default function AdminSizeSets() {
  const [sets, setSets]    = useState([]);
  const [loading, setLoad] = useState(true);
  const [error, setError]  = useState('');

  const load = () => {
    setLoad(true);
    listSizeSets(true)
      .then(d => setSets(Array.isArray(d) ? d : (d.results || [])))
      .finally(() => setLoad(false));
  };
  useEffect(load, []);

  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-accent text-xs font-black uppercase tracking-widest mb-1">Admin Panel</p>
      <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100 mb-1">Size Sets</h1>
      <p className="text-sm text-gray-400 dark:text-zinc-500 mb-6">
        Build the size ranges your variants are sold in. These fill the Size set dropdown in the product editor.
      </p>

      {error && (
        <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-sm mb-4">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      <CreateSizeSetCard onCreated={load} onError={setError} />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader className="animate-spin" /></div>
      ) : !sets.length ? (
        <p className="text-center text-sm text-gray-400 py-12">No size sets yet — create your first one above.</p>
      ) : (
        <div className="space-y-3">
          {sets.map(s => (
            <SizeSetCard key={s.id} sizeSet={s} onChanged={load} onError={setError} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create ────────────────────────────────────────────────────────────────────

function CreateSizeSetCard({ onCreated, onError }) {
  const [open, setOpen]     = useState(false);
  const [name, setName]     = useState('');
  const [rows, setRows]     = useState([{ size: '', qty: 1 }]);
  const [saving, setSaving] = useState(false);

  const breakdownString = toBreakdownString(rows);
  const pieces          = countPieces(rows);
  const canSave         = name.trim() && pieces > 0;

  const reset = () => { setName(''); setRows([{ size: '', qty: 1 }]); setOpen(false); };

  const save = () => {
    if (!canSave) return;
    setSaving(true); onError('');
    createSizeSet({
      name: name.trim(),
      breakdowns: [{ label: breakdownString, breakdown_string: breakdownString, pieces }],
    })
      .then(() => { reset(); onCreated(); })
      .catch(e => onError(readError(e, 'Could not create the size set.')))
      .finally(() => setSaving(false));
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full mb-6 py-4 rounded-2xl border-2 border-dashed border-gray-300 dark:border-white/15 text-gray-500 dark:text-zinc-400 hover:border-accent hover:text-accent font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors">
        <Plus size={17} /> New size set
      </button>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-5 mb-6">
      <div className="mb-4">
        <label className={labelCls}>Size set name</label>
        <input className={inputCls} value={name} autoFocus
               onChange={e => setName(e.target.value)} placeholder='e.g. "L TO 3XL" or "30 TO 36"' />
      </div>
      <label className={labelCls}>First breakdown — sizes & quantities per set</label>
      <SizeQtyRows rows={rows} onChange={setRows} />
      {pieces > 0 && <BreakdownPreview string={breakdownString} pieces={pieces} />}
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={reset} className={btnGhost}>Cancel</button>
        <button onClick={save} disabled={saving || !canSave} className={btnPrimary}>
          {saving ? <Loader size={15} className="animate-spin" /> : <Check size={15} />} Create size set
        </button>
      </div>
    </div>
  );
}

// ── One set ───────────────────────────────────────────────────────────────────

function SizeSetCard({ sizeSet, onChanged, onError }) {
  const [name, setName]     = useState(sizeSet.name);
  const [adding, setAdding] = useState(false);
  const [rows, setRows]     = useState([{ size: '', qty: 1 }]);
  const [busy, setBusy]     = useState(false);

  const inUse      = sizeSet.variation_count > 0;
  const nameDirty  = name.trim() && name.trim() !== sizeSet.name;
  const breakdowns = sizeSet.breakdowns || [];

  // Existing breakdowns are always sent back with their ids, so untouched rows
  // keep them — variations point at breakdown ids and would be orphaned if the
  // server had to recreate them.
  const keep = () => breakdowns.map(b => ({
    id: b.id, label: b.label, breakdown_string: b.breakdown_string, pieces: b.pieces,
  }));

  const patch = (body, fallback) => {
    setBusy(true); onError('');
    updateSizeSet(sizeSet.id, body)
      .then(() => { setAdding(false); setRows([{ size: '', qty: 1 }]); onChanged(); })
      .catch(e => onError(readError(e, fallback)))
      .finally(() => setBusy(false));
  };

  const addBreakdown = () => {
    const string = toBreakdownString(rows);
    const pieces = countPieces(rows);
    if (!pieces) return;
    patch({ breakdowns: [...keep(), { label: string, breakdown_string: string, pieces }] },
          'Could not add the breakdown.');
  };

  const removeBreakdown = (id) =>
    patch({ breakdowns: keep().filter(b => b.id !== id) },
          'Could not remove the breakdown.');

  const remove = () => {
    if (!window.confirm(`Delete the size set "${sizeSet.name}"?`)) return;
    setBusy(true); onError('');
    deleteSizeSet(sizeSet.id)
      .then(onChanged)
      .catch(e => onError(readError(e, 'Could not delete the size set.')))
      .finally(() => setBusy(false));
  };

  return (
    <div className={`bg-white dark:bg-zinc-900 border rounded-2xl p-4 transition-opacity ${
      sizeSet.is_active ? 'border-gray-100 dark:border-white/5' : 'border-gray-200 dark:border-white/10 opacity-60'
    }`}>
      <div className="flex items-start gap-2">
        <Ruler size={16} className="text-accent shrink-0 mt-3" />
        <input value={name} onChange={e => setName(e.target.value)}
               aria-label={`Name of ${sizeSet.name}`}
               className="flex-1 min-w-0 px-2 py-2 rounded-lg bg-transparent font-bold text-gray-900 dark:text-zinc-100 border border-transparent hover:border-gray-200 dark:hover:border-white/10 focus:border-accent focus:outline-none text-base sm:text-sm" />
        {nameDirty && (
          <button onClick={() => patch({ name: name.trim() }, 'Could not rename.')} disabled={busy}
                  className="p-2.5 text-accent hover:brightness-110 shrink-0" aria-label="Save name">
            <Check size={16} />
          </button>
        )}
        <button onClick={() => patch({ is_active: !sizeSet.is_active }, 'Could not change status.')}
                disabled={busy} title={sizeSet.is_active ? 'Hide from the size dropdown' : 'Show in the size dropdown'}
                className={`px-2.5 py-1.5 mt-1 rounded-full text-[11px] font-bold shrink-0 transition ${
                  sizeSet.is_active
                    ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-zinc-400'
                }`}>
          {sizeSet.is_active ? 'Active' : 'Inactive'}
        </button>
        <button onClick={remove} disabled={busy} aria-label={`Delete ${sizeSet.name}`}
                title={inUse ? 'In use — deactivate instead' : 'Delete'}
                className="p-2.5 mt-1 text-gray-400 hover:text-red-500 disabled:opacity-30 shrink-0">
          <Trash2 size={15} />
        </button>
      </div>

      {inUse && (
        <p className="text-xs text-gray-400 dark:text-zinc-500 pl-6 mt-0.5">
          Used by {sizeSet.variation_count} variant{sizeSet.variation_count === 1 ? '' : 's'}
        </p>
      )}

      <div className="pl-6 mt-3 space-y-1.5">
        {breakdowns.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-zinc-500">
            No breakdowns yet — add one so this set can be priced.
          </p>
        )}
        {breakdowns.map(b => (
          <div key={b.id}
               className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-zinc-800">
            <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-zinc-300">{b.label}</span>
            <span className="text-xs font-bold text-gray-400 shrink-0">{b.pieces} pcs</span>
            <button onClick={() => removeBreakdown(b.id)} disabled={busy}
                    aria-label={`Remove breakdown ${b.label}`}
                    className="w-7 h-7 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-500/20 flex items-center justify-center shrink-0">
              <X size={14} />
            </button>
          </div>
        ))}

        {adding ? (
          <div className="pt-2">
            <SizeQtyRows rows={rows} onChange={setRows} />
            {countPieces(rows) > 0 && (
              <BreakdownPreview string={toBreakdownString(rows)} pieces={countPieces(rows)} />
            )}
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => { setAdding(false); setRows([{ size: '', qty: 1 }]); }} className={btnGhost}>
                Cancel
              </button>
              <button onClick={addBreakdown} disabled={busy || !countPieces(rows)} className={btnPrimary}>
                {busy ? <Loader size={15} className="animate-spin" /> : <Check size={15} />} Add breakdown
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            <Plus size={15} /> Add breakdown
          </button>
        )}
      </div>
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function SizeQtyRows({ rows, onChange }) {
  const setRow = (i, k, val) => onChange(rows.map((r, idx) => idx === i ? { ...r, [k]: val } : r));
  const addRow = () => onChange([...rows, { size: '', qty: 1 }]);
  const delRow = (i) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input className={inputCls} value={r.size} placeholder="Size (e.g. 30 or L)"
                   onChange={e => setRow(i, 'size', e.target.value)} />
            <span className="text-gray-400">×</span>
            <input type="number" min="1" className={`${inputCls} w-16 sm:w-24`} value={r.qty}
                   onChange={e => setRow(i, 'qty', e.target.value)} />
            <span className="text-xs text-gray-400 w-8 shrink-0">pcs</span>
            <button onClick={() => delRow(i)} disabled={rows.length === 1}
                    aria-label="Remove size"
                    className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      <button onClick={addRow}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
        <Plus size={15} /> Add size
      </button>
    </>
  );
}

function BreakdownPreview({ string, pieces }) {
  return (
    <p className="text-xs text-gray-500 dark:text-zinc-400 mt-3">
      Breakdown: <span className="font-semibold text-gray-700 dark:text-zinc-200">{string}</span> · {pieces} pieces/set
    </p>
  );
}

/** Pull the server's message out — the API explains *why* a delete was refused. */
function readError(e, fallback) {
  const d = e.response?.data;
  if (!d) return fallback;
  if (typeof d === 'string') return d;
  if (d.error) return d.error;
  if (Array.isArray(d.breakdowns)) return d.breakdowns.join(' ');
  if (d.name) return `Name: ${[].concat(d.name).join(' ')}`;
  return JSON.stringify(d);
}
