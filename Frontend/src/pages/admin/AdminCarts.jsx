import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Search, Loader, ChevronLeft, ChevronRight, ChevronDown,
  BadgeCheck, AlertTriangle, PackageX,
} from 'lucide-react';
import { getCart, listCarts } from '../../api/adminApi';
import { money } from './orderPresentation';

/**
 * Live carts — who is close to ordering, and whether what they picked can still
 * be shipped.
 *
 * Read-only by design: a cart belongs to the buyer filling it, and an admin
 * editing one under them is how a customer ends up paying for something they
 * never chose. Rows expand in place rather than routing to a detail page —
 * there is nothing to do here but look, and a cart is short.
 */
export default function AdminCarts() {
  const [data, setData]     = useState({ results: [], count: 0 });
  const [loading, setLoad]  = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage]     = useState(1);
  const [openId, setOpen]   = useState(null);
  const [details, setDetails] = useState({});   // cart id → detail payload
  const navigate = useNavigate();

  const fetch = useCallback(() => {
    setLoad(true);
    listCarts({ search, page })
      .then(setData)
      .catch(() => setData({ results: [], count: 0 }))
      .finally(() => setLoad(false));
  }, [search, page]);

  useEffect(() => {
    const t = setTimeout(fetch, 200);
    return () => clearTimeout(t);
  }, [fetch]);

  const toggle = (cart) => {
    if (openId === cart.id) { setOpen(null); return; }
    setOpen(cart.id);
    // Lines are fetched once per cart and kept — reopening a row should not
    // cost another request.
    if (!details[cart.id]) {
      getCart(cart.id)
        .then(d => setDetails(m => ({ ...m, [cart.id]: d })))
        .catch(() => setDetails(m => ({ ...m, [cart.id]: { items: [], failed: true } })));
    }
  };

  const pageSize   = 24;
  const totalPages = Math.max(1, Math.ceil((data.count || 0) / pageSize));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <p className="text-accent text-xs font-black uppercase tracking-widest mb-1">Admin Panel</p>
        <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100">Live Carts</h1>
        <p className="text-gray-500 dark:text-zinc-400 text-sm mt-1">
          {loading ? '—' : `${data.count} cart${data.count !== 1 ? 's' : ''} with something in them`}
        </p>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => { setPage(1); setSearch(e.target.value); }}
          placeholder="Search by email or company…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader className="animate-spin" /></div>
      ) : !data.results.length ? (
        <div className="text-center py-20 text-gray-400">
          <ShoppingCart size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No carts with anything in them</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {data.results.map(c => {
            const open   = openId === c.id;
            const detail = details[c.id];
            return (
              <div key={c.id} className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl overflow-hidden">
                <button onClick={() => toggle(c)}
                  className="w-full text-left flex flex-wrap items-center gap-x-4 gap-y-2 p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
                      {c.company_name || c.user_email}
                      {c.is_verified_b2b && (
                        <BadgeCheck size={14} className="text-green-600 dark:text-green-400 shrink-0" />
                      )}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-zinc-400 truncate">
                      {c.company_name ? `${c.user_email} · ` : ''}{c.user_phone || 'No phone'}
                      {' · updated '}{new Date(c.updated_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-black text-gray-900 dark:text-zinc-100">{money(c.estimated_value)}</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">
                      {c.item_count} line{c.item_count !== 1 ? 's' : ''} · {c.total_quantity} pcs
                    </p>
                  </div>

                  <ChevronDown size={18}
                    className={`text-gray-300 dark:text-zinc-600 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="border-t border-gray-100 dark:border-white/5 p-4">
                    {!detail ? (
                      <div className="flex justify-center py-6 text-gray-400"><Loader size={18} className="animate-spin" /></div>
                    ) : detail.failed ? (
                      <p className="text-sm text-red-500">Could not load these lines.</p>
                    ) : (
                      <>
                        <div className="space-y-3">
                          {detail.items.map(it => (
                            <div key={it.id} className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 shrink-0">
                                {it.thumb_url ? <img src={it.thumb_url} alt="" className="w-full h-full object-cover" /> : null}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 dark:text-zinc-100 truncate">{it.product_name}</p>
                                <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                                  {it.sku}{it.size ? ` · ${it.size}` : ''}{it.color_name ? ` · ${it.color_name}` : ''}
                                </p>
                                {/* The two reasons this cart might not convert. */}
                                {it.unavailable && (
                                  <p className="flex items-center gap-1 text-[11px] font-bold text-red-500 mt-0.5">
                                    <PackageX size={11} /> This product no longer exists
                                  </p>
                                )}
                                {it.out_of_stock && (
                                  <p className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                                    <AlertTriangle size={11} /> Not enough stock for this quantity
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">
                                  {it.line_total === null ? '—' : money(it.line_total)}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-zinc-400">
                                  {it.quantity} × {it.unit_price === null ? '—' : money(it.unit_price)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-100 dark:border-white/5">
                          <p className="text-xs text-gray-400 dark:text-zinc-500">
                            Valued at today’s prices — nothing here has been charged.
                          </p>
                          <button onClick={() => navigate(`/admin/users/${c.user}`)}
                            className="text-xs font-bold text-accent hover:underline shrink-0">
                            Open profile
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="p-2 rounded-lg border border-gray-200 dark:border-white/10 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-white/5"><ChevronLeft size={18} /></button>
          <span className="text-sm text-gray-600 dark:text-zinc-400 font-semibold">Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="p-2 rounded-lg border border-gray-200 dark:border-white/10 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-white/5"><ChevronRight size={18} /></button>
        </div>
      )}
    </div>
  );
}
