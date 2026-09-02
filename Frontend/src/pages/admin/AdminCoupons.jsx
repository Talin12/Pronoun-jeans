import React, { useCallback, useEffect, useState } from 'react';
import {
  Ticket, Plus, Loader, Trash2, X, Check, CircleSlash,
} from 'lucide-react';
import {
  createCoupon, deleteCoupon, listCoupons, updateCoupon,
} from '../../api/adminApi';

/** datetime-local wants "YYYY-MM-DDTHH:mm"; DRF sends ISO with a zone. */
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const blankCoupon = () => {
  const now   = new Date();
  const month = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    code: '', discount_type: 'percentage', discount_value: '',
    min_order_value: '0', is_active: true,
    valid_from: toLocalInput(now.toISOString()),
    valid_to:   toLocalInput(month.toISOString()),
  };
};

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState(null);
  const [draft, setDraft]     = useState(null);   // null = form closed
  const [editId, setEditId]   = useState(null);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');

  const load = useCallback(() => {
    listCoupons()
      .then(setCoupons)
      .catch(() => { setCoupons([]); setError('Could not load the coupons.'); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setEditId(null); setDraft(blankCoupon()); setError(''); };
  const openEdit = (c) => {
    setEditId(c.id); setError('');
    setDraft({
      code: c.code, discount_type: c.discount_type,
      discount_value: c.discount_value, min_order_value: c.min_order_value,
      is_active: c.is_active,
      valid_from: toLocalInput(c.valid_from), valid_to: toLocalInput(c.valid_to),
    });
  };

  const submit = (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const body = {
      ...draft,
      // datetime-local has no zone; the browser's own offset is the one the
      // admin means when they type a date.
      valid_from: new Date(draft.valid_from).toISOString(),
      valid_to:   new Date(draft.valid_to).toISOString(),
    };
    const call = editId ? updateCoupon(editId, body) : createCoupon(body);
    call
      .then(() => { setDraft(null); setEditId(null); load(); })
      .catch(err => {
        const detail = err.response?.data;
        setError(detail && typeof detail === 'object'
          ? Object.entries(detail).map(([k, v]) => `${k}: ${[].concat(v).join(' ')}`).join(' · ')
          : 'Could not save that coupon.');
      })
      .finally(() => setBusy(false));
  };

  const toggleActive = (c) => {
    const before = coupons;
    setCoupons(cs => cs.map(x => (x.id === c.id ? { ...x, is_active: !x.is_active } : x)));
    updateCoupon(c.id, { is_active: !c.is_active })
      .then(load)
      .catch(() => { setCoupons(before); setError('Could not change that coupon.'); });
  };

  const remove = (c) => {
    setError('');
    deleteCoupon(c.id)
      .then(load)
      // A redeemed coupon comes back 409 with a message explaining why —
      // showing the server's wording keeps the panel and the API in step.
      .catch(err => setError(err.response?.data?.error || 'Could not delete that coupon.'));
  };

  const field = (patch) => setDraft(d => ({ ...d, ...patch }));
  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40';

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-accent text-xs font-black uppercase tracking-widest mb-1">Admin Panel</p>
          <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100">Coupons</h1>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mt-1">
            {coupons === null ? '—'
              : `${coupons.filter(c => c.is_currently_valid).length} usable right now · ${coupons.length} total`}
          </p>
        </div>
        <button onClick={openNew}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition shadow-sm shrink-0">
          <Plus size={18} /> New Coupon
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-sm font-semibold text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {draft && (
        <form onSubmit={submit}
          className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-gray-900 dark:text-zinc-100">
              {editId ? 'Edit coupon' : 'New coupon'}
            </h2>
            <button type="button" onClick={() => { setDraft(null); setEditId(null); }}
              className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200"><X size={18} /></button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block sm:col-span-2">
              <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 mb-1 block">Code</span>
              <input required value={draft.code}
                onChange={e => field({ code: e.target.value.toUpperCase() })}
                placeholder="SUMMER10"
                className={`${inputCls} font-black tracking-wide`} />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 mb-1 block">Discount type</span>
              <select value={draft.discount_type} onChange={e => field({ discount_type: e.target.value })}
                className={inputCls}>
                <option value="percentage">Percentage</option>
                <option value="fixed_amount">Fixed amount</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 mb-1 block">
                {draft.discount_type === 'percentage' ? 'Percent off' : 'Rupees off'}
              </span>
              <input required type="number" step="0.01" min="0"
                max={draft.discount_type === 'percentage' ? 100 : undefined}
                value={draft.discount_value}
                onChange={e => field({ discount_value: e.target.value })}
                className={inputCls} />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 mb-1 block">Minimum order value</span>
              <input type="number" step="0.01" min="0" value={draft.min_order_value}
                onChange={e => field({ min_order_value: e.target.value })}
                className={inputCls} />
            </label>

            <label className="flex items-center gap-2 sm:mt-6">
              <input type="checkbox" checked={draft.is_active}
                onChange={e => field({ is_active: e.target.checked })}
                className="w-4 h-4 accent-green-600" />
              <span className="text-sm font-bold text-gray-900 dark:text-zinc-100">Active</span>
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 mb-1 block">Valid from</span>
              <input required type="datetime-local" value={draft.valid_from}
                onChange={e => field({ valid_from: e.target.value })} className={inputCls} />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 mb-1 block">Valid until</span>
              <input required type="datetime-local" value={draft.valid_to}
                onChange={e => field({ valid_to: e.target.value })} className={inputCls} />
            </label>
          </div>

          <button type="submit" disabled={busy}
            className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition shadow-sm disabled:opacity-60">
            {busy ? <Loader size={16} className="animate-spin" /> : <Check size={16} />}
            {editId ? 'Save changes' : 'Create coupon'}
          </button>
        </form>
      )}

      {coupons === null ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader className="animate-spin" /></div>
      ) : !coupons.length ? (
        <div className="text-center py-20 text-gray-400">
          <Ticket size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No coupons yet</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {coupons.map(c => (
            <div key={c.id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-3 bg-white dark:bg-zinc-900 border rounded-2xl p-4 ${
                c.is_currently_valid
                  ? 'border-gray-100 dark:border-white/5'
                  : 'border-dashed border-gray-300 dark:border-white/15 opacity-75'
              }`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black tracking-wide text-gray-900 dark:text-zinc-100">{c.code}</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                    {c.discount_type === 'percentage' ? `${c.discount_value}% off` : `₹${c.discount_value} off`}
                  </span>
                  {/* is_active alone does not say whether checkout accepts it —
                      an on coupon can still be outside its window. */}
                  {!c.is_currently_valid && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-zinc-400">
                      <CircleSlash size={11} />
                      {c.is_active ? 'Outside its dates' : 'Switched off'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                  {Number(c.min_order_value) > 0 ? `Min ₹${c.min_order_value} · ` : ''}
                  {new Date(c.valid_from).toLocaleDateString()} – {new Date(c.valid_to).toLocaleDateString()}
                  {' · '}{c.order_count} use{c.order_count !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button onClick={() => toggleActive(c)}
                  className={`px-3 py-2 rounded-xl border text-xs font-bold transition ${
                    c.is_active
                      ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20'
                      : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-zinc-400 border-gray-200 dark:border-white/10'
                  }`}>
                  {c.is_active ? 'On' : 'Off'}
                </button>
                <button onClick={() => openEdit(c)}
                  className="px-4 py-2 rounded-xl border border-gray-200 dark:border-white/10 text-xs font-bold text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-white/5 transition">
                  Edit
                </button>
                <button onClick={() => remove(c)}
                  title={c.order_count ? 'Used on real orders — switch it off instead' : 'Delete'}
                  className="p-2 rounded-xl border border-gray-200 dark:border-white/10 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition ml-auto sm:ml-0">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
