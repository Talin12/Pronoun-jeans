import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Loader, Package, ChevronLeft, ChevronRight, ImageOff, Pencil,
} from 'lucide-react';
import { listProducts } from '../../api/adminApi';

const StatusPill = ({ active }) =>
  active ? (
    <span className="inline-flex items-center bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20 text-xs font-bold px-2.5 py-0.5 rounded-full">Active</span>
  ) : (
    <span className="inline-flex items-center bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-zinc-400 border border-gray-200 dark:border-white/10 text-xs font-bold px-2.5 py-0.5 rounded-full">Inactive</span>
  );

export default function AdminProducts() {
  const [data, setData]     = useState({ results: [], count: 0 });
  const [loading, setLoad]  = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage]     = useState(1);
  const navigate = useNavigate();

  const fetch = useCallback(() => {
    setLoad(true);
    listProducts({ search, page })
      .then(setData)
      .catch(() => setData({ results: [], count: 0 }))
      .finally(() => setLoad(false));
  }, [search, page]);

  useEffect(() => {
    const t = setTimeout(fetch, 200);
    return () => clearTimeout(t);
  }, [fetch]);

  const pageSize = 24;
  const totalPages = Math.max(1, Math.ceil((data.count || 0) / pageSize));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-accent text-xs font-black uppercase tracking-widest mb-1">Admin Panel</p>
          <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100">Products</h1>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mt-1">
            {loading ? '—' : `${data.count} product${data.count !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={() => navigate('/admin/products/new')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition shadow-sm">
          <Plus size={18} /> Upload New Product
        </button>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => { setPage(1); setSearch(e.target.value); }}
          placeholder="Search by product name or SKU…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader className="animate-spin" /></div>
      ) : !data.results.length ? (
        <div className="text-center py-20 text-gray-400">
          <Package size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No products found</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {data.results.map(p => (
            <div key={p.id}
              className="flex items-center gap-4 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-3 hover:shadow-md transition-shadow">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center">
                {p.thumb ? <img src={p.thumb} alt={p.name} className="w-full h-full object-cover" />
                         : <ImageOff size={20} className="text-gray-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-zinc-100 truncate">{p.name}</p>
                <p className="text-sm text-gray-500 dark:text-zinc-400 truncate">
                  {p.category_name || 'No category'} · {p.variation_count} variation{p.variation_count !== 1 ? 's' : ''} · MOQ {p.moq}
                </p>
              </div>
              <StatusPill active={p.is_active} />
              <button onClick={() => navigate(`/admin/products/${p.id}`)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-white/5 transition shrink-0">
                <Pencil size={15} /> Edit
              </button>
            </div>
          ))}
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
