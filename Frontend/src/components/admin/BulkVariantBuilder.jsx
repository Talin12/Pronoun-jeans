import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, Loader, Plus, Palette, Ruler, Image as ImageIcon,
  IndianRupee, AlertCircle, X,
} from 'lucide-react';
import { bulkCreateVariations, attachMedia } from '../../api/adminApi';
import { LibraryModal } from './MediaPicker';

const labelCls = 'block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1.5';
// text-base on phones: anything under 16px makes iOS Safari zoom in on focus.
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40';

const money = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const btnPrimary = 'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-50';
const btnGhost   = 'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-bold text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/5 transition';

const STEPS = [
  { key: 'colors', label: 'Colours', icon: Palette },
  { key: 'sizes',  label: 'Sizes',   icon: Ruler },
  { key: 'images', label: 'Images',  icon: ImageIcon },
  { key: 'price',  label: 'Price',   icon: IndianRupee },
];

/**
 * Builds every variant of a product in one pass: pick the colours, pick the
 * size ranges, add images per colour, set one price — and the colour × size
 * grid is created for you, instead of filling the same form N times.
 *
 * Images are collected as media ids here and attached once the variants exist,
 * to every variant of that colour (photos differ by colour, not by size).
 */
export default function BulkVariantBuilder({
  productId, productName, categoryId, colors, sizeSets,
  onCreated, onCancel, onAddColor, onAddSizeSet,
}) {
  const [step, setStep]       = useState('colors');
  const [pickedC, setPickedC] = useState([]);   // colour ids
  const [pickedS, setPickedS] = useState([]);   // [{ size_set, size_breakdown }]
  const [imgs, setImgs]       = useState({});   // { [colorId]: [{id, thumb_url}] }
  const [modalFor, setModal]  = useState(null); // colour id whose picker is open
  const [price, setPrice]     = useState({ per_piece_price: '', mrp_per_piece: '', stock_quantity: 0 });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [progress, setProg]   = useState('');

  const toggleColor = (id) =>
    setPickedC(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  const toggleSize = (sizeSetId) =>
    setPickedS(p => {
      if (p.some(s => s.size_set === sizeSetId)) return p.filter(s => s.size_set !== sizeSetId);
      const set = sizeSets.find(s => s.id === sizeSetId);
      // Pre-pick the only breakdown when there is no choice to make.
      const only = set?.breakdowns?.length === 1 ? set.breakdowns[0].id : '';
      return [...p, { size_set: sizeSetId, size_breakdown: only }];
    });

  const setBreakdown = (sizeSetId, breakdownId) =>
    setPickedS(p => p.map(s => (s.size_set === sizeSetId ? { ...s, size_breakdown: breakdownId } : s)));

  const combos = useMemo(() => {
    const cs = pickedC.length ? pickedC : [null];
    const ss = pickedS.length ? pickedS : [null];
    return cs.flatMap(c => ss.map(s => ({ color: c, size: s })));
  }, [pickedC, pickedS]);

  const colorName = (id) => colors.find(c => c.id === id)?.name || '—';
  const sizeName  = (id) => sizeSets.find(s => s.id === id)?.name || '—';

  // Pieces for a chosen breakdown — 1 when the set has none, matching
  // ProductVariation.pieces on the server.
  const piecesFor = (size) => {
    if (!size) return 1;
    const set = sizeSets.find(s => s.id === size.size_set);
    return set?.breakdowns?.find(b => b.id === Number(size.size_breakdown))?.pieces || 1;
  };

  // The set total for one row: per-piece price × that row's pieces.
  const rowSetPrice = (combo) => {
    const per = Number(price.per_piece_price);
    return per > 0 ? per * piecesFor(combo.size) : null;
  };

  const stepIndex = STEPS.findIndex(s => s.key === step);
  const canNext =
    (step === 'colors' && true) ||       // colours are optional (a one-colour product)
    (step === 'sizes'  && pickedS.every(s => {
      const set = sizeSets.find(x => x.id === s.size_set);
      return !set?.breakdowns?.length || s.size_breakdown;
    })) ||
    step === 'images' || step === 'price';

  const create = async () => {
    setSaving(true); setError(''); setProg('Creating variants…');
    try {
      const res = await bulkCreateVariations({
        product: productId,
        colors: pickedC,
        size_sets: pickedS.map(s => ({
          size_set: s.size_set,
          size_breakdown: s.size_breakdown || null,
        })),
        per_piece_price: price.per_piece_price,
        mrp_per_piece: price.mrp_per_piece || null,
        stock_quantity: Number(price.stock_quantity) || 0,
      });

      const created = res.created || [];

      // Attach each colour's images to every variant of that colour.
      const withImages = created.filter(v => (imgs[v.color_palette] || []).length);
      if (withImages.length) {
        setProg(`Attaching images to ${withImages.length} variant${withImages.length !== 1 ? 's' : ''}…`);
        await Promise.all(withImages.map(v =>
          attachMedia('variation', v.id, imgs[v.color_palette].map(a => a.id), 'gallery')
            .catch(() => null)));   // a failed attach must not lose the variants
      }

      onCreated(created, res.skipped || []);
    } catch (err) {
      const d = err.response?.data;
      setError(d && typeof d === 'object'
        ? Object.entries(d).map(([k, v]) => `${k}: ${[].concat(v).join(' ')}`).join('  •  ')
        : 'Could not create the variants.');
    } finally {
      setSaving(false); setProg('');
    }
  };

  return (
    <div className="border border-accent/30 rounded-2xl bg-accent/[0.03] overflow-hidden">
      {/* Steps */}
      <div className="flex gap-1 overflow-x-auto px-3 py-2.5 border-b border-accent/20">
        {STEPS.map((s, i) => (
          <button key={s.key} onClick={() => setStep(s.key)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              s.key === step ? 'bg-accent text-white'
              : i < stepIndex ? 'text-accent' : 'text-gray-400 dark:text-zinc-500'
            }`}>
            <s.icon size={13} /> {s.label}
          </button>
        ))}
        <button onClick={onCancel} className="ml-auto p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 shrink-0">
          <X size={16} />
        </button>
      </div>

      <div className="p-4">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm rounded-xl px-4 py-3 mb-4">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}

        {/* ── 1. Colours ── */}
        {step === 'colors' && (
          <>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mb-3">
              Pick every colour this product comes in. Leave empty for a product with no colour options.
            </p>
            <div className="flex flex-wrap gap-2">
              {colors.map(c => {
                const on = pickedC.includes(c.id);
                return (
                  <button key={c.id} type="button" onClick={() => toggleColor(c.id)}
                    className={`inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full text-sm font-semibold border transition ${
                      on ? 'bg-accent text-white border-accent' : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-zinc-300 hover:border-accent'
                    }`}>
                    <span className="w-5 h-5 rounded-full border border-black/10 shrink-0"
                      style={{ background: c.hex_code || '#e5e7eb' }} />
                    {c.name}
                    {on && <Check size={14} />}
                  </button>
                );
              })}
              <button type="button" onClick={onAddColor}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold text-accent border border-dashed border-accent/40 hover:bg-accent/10">
                <Plus size={14} /> New colour
              </button>
            </div>
          </>
        )}

        {/* ── 2. Size ranges ── */}
        {step === 'sizes' && (
          <>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mb-3">
              Pick every size range. Each one is paired with each colour you chose.
            </p>
            <div className="space-y-2">
              {sizeSets.map(s => {
                const picked = pickedS.find(x => x.size_set === s.id);
                return (
                  <div key={s.id} className={`rounded-xl border transition ${
                    picked ? 'border-accent/40 bg-white dark:bg-zinc-900' : 'border-gray-200 dark:border-white/10'
                  }`}>
                    <button type="button" onClick={() => toggleSize(s.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                        picked ? 'bg-accent border-accent text-white' : 'border-gray-300 dark:border-white/20'
                      }`}>{picked && <Check size={13} />}</span>
                      <span className="font-semibold text-sm text-gray-900 dark:text-zinc-100">{s.name}</span>
                    </button>
                    {picked && s.breakdowns?.length > 0 && (
                      <div className="px-3 pb-3 pl-11">
                        <label className={labelCls}>Set breakdown</label>
                        <select className={inputCls} value={picked.size_breakdown || ''}
                          onChange={e => setBreakdown(s.id, e.target.value ? Number(e.target.value) : '')}>
                          <option value="">— Select —</option>
                          {s.breakdowns.map(b => (
                            <option key={b.id} value={b.id}>{b.label} ({b.pieces} pcs)</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={onAddSizeSet}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold text-accent border border-dashed border-accent/40 hover:bg-accent/10">
                <Plus size={14} /> New size set
              </button>
            </div>
          </>
        )}

        {/* ── 3. Images per colour ── */}
        {step === 'images' && (
          <>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mb-3">
              Images are per colour — every size of that colour shares them. Optional; you can add them later.
            </p>
            {!pickedC.length ? (
              <p className="text-sm text-gray-400">
                No colours selected, so there is nothing to illustrate here. Add images to the variants after they are created.
              </p>
            ) : (
              <div className="space-y-3">
                {pickedC.map(cid => (
                  <div key={cid} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900">
                    <span className="w-6 h-6 rounded-full border border-black/10 shrink-0"
                      style={{ background: colors.find(c => c.id === cid)?.hex_code || '#e5e7eb' }} />
                    <span className="font-semibold text-sm text-gray-900 dark:text-zinc-100 w-24 truncate">{colorName(cid)}</span>
                    <div className="flex-1 flex flex-wrap gap-1.5">
                      {(imgs[cid] || []).map(a => (
                        <img key={a.id} src={a.thumb_url} alt=""
                          className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-white/10" />
                      ))}
                    </div>
                    <button type="button" onClick={() => setModal(cid)}
                      className="text-xs font-bold text-accent hover:underline shrink-0">
                      {(imgs[cid] || []).length ? 'Change' : 'Add images'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── 4. Price + preview ── */}
        {step === 'price' && (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Per-piece price ₹ *</label>
                <input type="number" step="0.01" className={inputCls} value={price.per_piece_price}
                  onChange={e => setPrice(p => ({ ...p, per_piece_price: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>MRP per piece ₹</label>
                <input type="number" step="0.01" className={inputCls} value={price.mrp_per_piece}
                  onChange={e => setPrice(p => ({ ...p, mrp_per_piece: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Stock per variant</label>
                <input type="number" min="0" className={inputCls} value={price.stock_quantity}
                  onChange={e => setPrice(p => ({ ...p, stock_quantity: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2">
              The set total is calculated from the per-piece price and the breakdown. Prices apply to every variant — edit individual ones afterwards.
            </p>

            <div className="mt-4 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 overflow-hidden">
              <p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-white/5">
                {combos.length} variant{combos.length !== 1 ? 's' : ''} will be created
              </p>
              <ul className="max-h-52 overflow-y-auto divide-y divide-gray-50 dark:divide-white/5">
                {combos.map((c, i) => (
                  <li key={i} className="px-3 py-2 text-sm text-gray-700 dark:text-zinc-300 flex items-center gap-2">
                    {c.color !== null && (
                      <span className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0"
                        style={{ background: colors.find(x => x.id === c.color)?.hex_code || '#e5e7eb' }} />
                    )}
                    <span className="truncate">
                      {c.color !== null ? colorName(c.color) : 'No colour'}
                      {c.size ? ` · ${sizeName(c.size.size_set)}` : ''}
                    </span>
                    <span className="ml-auto flex items-center gap-2 shrink-0">
                      {(imgs[c.color] || []).length > 0 && (
                        <span className="text-xs text-gray-400">
                          {imgs[c.color].length} image{imgs[c.color].length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {rowSetPrice(c) !== null && (
                        <span className="text-xs font-bold text-accent">{money(rowSetPrice(c))}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2">
              SKUs are generated from {productName ? `“${productName}”` : 'the product'}, the colour and the size. Combinations that already exist are skipped.
            </p>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-accent/20">
        {stepIndex > 0 ? (
          <button onClick={() => setStep(STEPS[stepIndex - 1].key)} className={btnGhost}>
            <ArrowLeft size={16} /> Back
          </button>
        ) : (
          <button onClick={onCancel} className={btnGhost}>Cancel</button>
        )}

        {step !== 'price' ? (
          <button onClick={() => setStep(STEPS[stepIndex + 1].key)} disabled={!canNext} className={btnPrimary}>
            Next <ArrowRight size={16} />
          </button>
        ) : (
          <button onClick={create} disabled={saving || !price.per_piece_price || !combos.length}
            className={btnPrimary}>
            {saving ? <Loader size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? (progress || 'Working…') : `Create ${combos.length} variant${combos.length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {modalFor !== null && (
        <LibraryModal
          folder="variations/gallery"
          categoryId={categoryId}
          onClose={() => setModal(null)}
          onConfirm={(ids, assets) => {
            setImgs(m => ({ ...m, [modalFor]: assets || ids.map(id => ({ id })) }));
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
