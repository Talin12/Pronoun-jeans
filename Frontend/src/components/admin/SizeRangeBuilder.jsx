import React, { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import {
  LETTER_SCALE, countPieces, defaultStep, detectScale, expandRange, suggestName,
  toBreakdownString,
} from './sizeScale';

/**
 * Build a size breakdown from a range instead of typed strings.
 *
 * You give it the smallest and largest size ("30" → "36", or "L" → "3XL"); it
 * works out whether the range is numeric or lettered, lists every size in
 * between, and you tick the ones in the set and set how many of each. The
 * breakdown string and the article count are derived, never typed — the old
 * form let those two disagree, and pieces drive variation pricing.
 *
 * The range/scale logic lives in ./sizeScale so it stays testable on its own.
 *
 * Emits via onChange: { sizes, breakdownString, pieces, suggestedName, scale }.
 */

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40';
const labelCls = 'block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1.5';

export default function SizeRangeBuilder({ onChange }) {
  const [from, setFrom]     = useState('');
  const [to, setTo]         = useState('');
  const [step, setStep]     = useState(2);
  const [qty, setQty]       = useState({});     // size -> qty; absent = not in the set
  const [extras, setExtras] = useState([]);     // sizes outside the range, e.g. "FS"
  const [extraOpen, setExtraOpen] = useState(false);

  const scale = detectScale(from, to);
  const range = useMemo(
    () => expandRange(from, to, scale === 'numeric' ? step : 1),
    [from, to, step, scale],
  );

  // Everything in range starts selected at 1 — the common case is "one of each".
  // Quantities already set are kept when the range shifts under them.
  useEffect(() => {
    setQty(prev => {
      const next = {};
      range.forEach(s => { next[s] = prev[s] !== undefined ? prev[s] : 1; });
      return next;
    });
  }, [range.join('|')]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Numeric ranges in this catalogue step by 2 (28, 30, 32…). Odd ends mean
  // someone wants every size, so fall back to 1.
  useEffect(() => {
    if (scale === 'numeric') setStep(defaultStep(from, to));
  }, [from, to, scale]);

  const selected = useMemo(() => ([
    ...range.filter(s => Number(qty[s]) > 0).map(s => ({ size: s, qty: Number(qty[s]) })),
    ...extras.filter(e => e.size.trim() && Number(e.qty) > 0)
             .map(e => ({ size: e.size.trim(), qty: Number(e.qty) })),
  ]), [range, qty, extras]);

  const breakdownString = toBreakdownString(selected);
  const pieces          = countPieces(selected);

  useEffect(() => {
    onChange?.({
      sizes: selected, breakdownString, pieces,
      suggestedName: suggestName(from, to), scale,
    });
  }, [breakdownString, pieces, from, to, scale]);   // eslint-disable-line react-hooks/exhaustive-deps

  const bump = (size, delta) =>
    setQty(q => ({ ...q, [size]: Math.max(0, (Number(q[size]) || 0) + delta) }));

  const allOn = range.length > 0 && range.every(s => Number(qty[s]) > 0);
  const toggleAll = () =>
    setQty(q => {
      const next = { ...q };
      range.forEach(s => { next[s] = allOn ? 0 : (Number(q[s]) > 0 ? q[s] : 1); });
      return next;
    });

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Smallest size</label>
          <input className={inputCls} value={from} onChange={e => setFrom(e.target.value)}
                 placeholder="e.g. 30 or L" list="size-suggestions" />
        </div>
        <div>
          <label className={labelCls}>Largest size</label>
          <input className={inputCls} value={to} onChange={e => setTo(e.target.value)}
                 placeholder="e.g. 36 or 3XL" list="size-suggestions" />
        </div>
      </div>
      <datalist id="size-suggestions">
        {[...LETTER_SCALE, '28', '30', '32', '34', '36', '38', '40', '42', '44'].map(s => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {from.trim() && to.trim() && !scale && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
          Use two numbers (30 to 36) or two letter sizes (L to 3XL) — not one of each.
        </p>
      )}

      {range.length > 0 && (
        <>
          <div className="flex items-center justify-between mt-4 mb-2 gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
              Sizes in this set
            </span>
            <div className="flex items-center gap-3">
              {scale === 'numeric' && (
                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 text-[11px] font-bold">
                  {[1, 2].map(n => (
                    <button key={n} type="button" onClick={() => setStep(n)}
                      className={`px-2 py-1 transition ${step === n
                        ? 'bg-accent text-white'
                        : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                      {n === 1 ? 'Every size' : 'Every 2nd'}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={toggleAll}
                      className="text-xs font-bold text-accent hover:underline">
                {allOn ? 'Clear all' : 'Select all'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {range.map(size => {
              const n = Number(qty[size]) || 0;
              const on = n > 0;
              return (
                <div key={size}
                     className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 transition-colors ${
                       on ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-white/10'
                     }`}>
                  <button type="button" onClick={() => bump(size, on ? -n : 1)}
                          aria-pressed={on} aria-label={`${on ? 'Remove' : 'Add'} size ${size}`}
                          className={`flex-1 min-w-0 truncate text-left text-sm font-bold ${
                            on ? 'text-accent' : 'text-gray-500 dark:text-zinc-400'
                          }`}>
                    {size}
                  </button>
                  {on && (
                    <span className="flex items-center gap-0.5 shrink-0">
                      <button type="button" onClick={() => bump(size, -1)} aria-label={`One fewer ${size}`}
                              className="w-6 h-6 rounded-md text-gray-400 hover:text-accent hover:bg-white dark:hover:bg-white/10 flex items-center justify-center">
                        <Minus size={13} />
                      </button>
                      <span className="w-5 text-center text-sm font-bold text-gray-900 dark:text-zinc-100">{n}</span>
                      <button type="button" onClick={() => bump(size, 1)} aria-label={`One more ${size}`}
                              className="w-6 h-6 rounded-md text-gray-400 hover:text-accent hover:bg-white dark:hover:bg-white/10 flex items-center justify-center">
                        <Plus size={13} />
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Escape hatch for anything the range can't express — "FS", "One Size". */}
      {extraOpen || extras.length > 0 ? (
        <div className="mt-3 space-y-2">
          {extras.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={inputCls} value={e.size} placeholder="Size (e.g. FS)"
                     onChange={ev => setExtras(xs => xs.map((x, j) => j === i ? { ...x, size: ev.target.value } : x))} />
              <span className="text-gray-400">×</span>
              <input type="number" min="1" className={`${inputCls} w-16 sm:w-20`} value={e.qty}
                     onChange={ev => setExtras(xs => xs.map((x, j) => j === i ? { ...x, qty: ev.target.value } : x))} />
              <button type="button" onClick={() => setExtras(xs => xs.filter((_, j) => j !== i))}
                      aria-label="Remove size" className="p-1.5 text-gray-400 hover:text-red-500">
                <X size={16} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setExtras(xs => [...xs, { size: '', qty: 1 }])}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            <Plus size={15} /> Add another
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => { setExtraOpen(true); setExtras([{ size: '', qty: 1 }]); }}
                className="mt-3 text-xs font-semibold text-gray-400 hover:text-accent">
          + Add a size outside this range
        </button>
      )}

      {pieces > 0 && (
        <div className="mt-4 rounded-xl bg-gray-50 dark:bg-zinc-800 px-3 py-2.5">
          <p className="text-sm text-gray-700 dark:text-zinc-300 font-semibold break-words">{breakdownString}</p>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
            <span className="font-bold text-accent">{pieces}</span> article{pieces === 1 ? '' : 's'} per set
            {' · '}{selected.length} size{selected.length === 1 ? '' : 's'}
          </p>
        </div>
      )}
    </div>
  );
}
