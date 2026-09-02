import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag, Search, Loader, ChevronLeft, ChevronRight,
  BadgeCheck, Clock, Truck, Package, XCircle, CheckCircle2, Briefcase,
} from 'lucide-react';
import { listOrders } from '../../api/adminApi';
import { STATUS_TONES, PAYMENT_TONES, money } from './orderPresentation';

const FILTERS = [
  { key: 'attention', label: 'Needs verifying', params: { unverified: 'true' } },
  { key: 'all',       label: 'All orders',      params: {} },
  { key: 'approved',  label: 'Approved',        params: { status: 'APPROVED' } },
  { key: 'shipped',   label: 'Shipped',         params: { status: 'SHIPPED' } },
  { key: 'delivered', label: 'Delivered',       params: { status: 'DELIVERED' } },
  { key: 'cancelled', label: 'Cancelled',       params: { status: 'CANCELLED' } },
];

const STATUS_ICONS = {
  PENDING_VERIFICATION: Clock,
  PENDING:              Clock,
  APPROVED:             CheckCircle2,
  SHIPPED:              Truck,
  DELIVERED:            Package,
  CANCELLED:            XCircle,
};

/**
 * The order queue.
 *
 * "Needs verifying" is the default view rather than "All orders": a direct-UPI
 * order sits at PENDING_VERIFICATION until someone confirms the money arrived,
 * and that is the only part of this list where nothing happens without an
 * admin. Everything else is here to be looked up.
 */
export default function AdminOrders() {
  const [data, setData]     = useState({ results: [], count: 0 });
  const [loading, setLoad]  = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('attention');
  const [page, setPage]     = useState(1);
  const navigate = useNavigate();

  const fetch = useCallback(() => {
    setLoad(true);
    const params = FILTERS.find(f => f.key === filter)?.params || {};
    listOrders({ search, page, ...params })
      .then(setData)
      .catch(() => setData({ results: [], count: 0 }))
      .finally(() => setLoad(false));
  }, [search, page, filter]);

  useEffect(() => {
    const t = setTimeout(fetch, 200);
    return () => clearTimeout(t);
  }, [fetch]);

  const pageSize   = 24;
  const totalPages = Math.max(1, Math.ceil((data.count || 0) / pageSize));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="text-accent text-xs font-black uppercase tracking-widest mb-1">Admin Panel</p>
        <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100">Orders</h1>
        <p className="text-gray-500 dark:text-zinc-400 text-sm mt-1">
          {loading ? '—' : `${data.count} order${data.count !== 1 ? 's' : ''} in this view`}
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-4 pb-1">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => { setPage(1); setFilter(f.key); }}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold border whitespace-nowrap transition ${
              filter === f.key
                ? 'bg-accent/10 text-accent border-accent/30'
                : 'text-gray-600 dark:text-zinc-400 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
            }`}>{f.label}</button>
        ))}
      </div>

      <div className="relative mb-6 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => { setPage(1); setSearch(e.target.value); }}
          placeholder="Search order no., email, company, UTR or tracking…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader className="animate-spin" /></div>
      ) : !data.results.length ? (
        <div className="text-center py-20 text-gray-400">
          <ShoppingBag size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-semibold">
            {filter === 'attention' ? 'Nothing waiting on you' : 'No orders match this view'}
          </p>
          {filter === 'attention' && (
            <p className="text-sm mt-1">Every payment has been checked off.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {data.results.map(o => {
            const StatusIcon = STATUS_ICONS[o.status] || Clock;
            return (
              <button key={o.id} onClick={() => navigate(`/admin/orders/${o.id}`)}
                className="text-left flex flex-wrap items-center gap-x-4 gap-y-3 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-4 transition-shadow hover:shadow-md">

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-gray-900 dark:text-zinc-100">#{o.id}</span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_TONES[o.status] || STATUS_TONES.PENDING}`}>
                      <StatusIcon size={11} />{o.status_display}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${PAYMENT_TONES[o.payment_status] || PAYMENT_TONES.pending}`}>
                      {o.payment_verified && <BadgeCheck size={11} />}
                      {o.payment_status}
                    </span>
                    {o.agent_email && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                        <Briefcase size={11} /> via agent
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-bold text-gray-700 dark:text-zinc-200 truncate mt-1.5">
                    {o.company_name || o.user_email || 'Deleted account'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-zinc-400 truncate">
                    {o.item_count} line{o.item_count !== 1 ? 's' : ''}
                    {o.coupon_code ? ` · ${o.coupon_code}` : ''}
                    {o.tracking_number ? ` · ${o.courier_name || 'Tracking'} ${o.tracking_number}` : ''}
                    {' · '}{new Date(o.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="font-black text-gray-900 dark:text-zinc-100">{money(o.grand_total)}</p>
                  {Number(o.balance_due) > 0 && (
                    <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                      {money(o.balance_due)} due
                    </p>
                  )}
                </div>

                <ChevronRight size={18} className="text-gray-300 dark:text-zinc-600 shrink-0" />
              </button>
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
