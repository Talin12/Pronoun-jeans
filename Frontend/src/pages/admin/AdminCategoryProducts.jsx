import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader, Package, ImageOff, Pencil, Plus, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { listProducts, updateProduct, getCategory } from '../../api/adminApi';
import StatusToggle from '../../components/admin/StatusToggle';

/**
 * Every product filed under one category, as a grid of boxes.
 * Reached by clicking a category tag on /admin/categories.
 */
export default function AdminCategoryProducts() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [cat, setCat]      = useState(null);
  const [data, setData]    = useState({ results: [], count: 0 });
  const [loading, setLoad] = useState(true);
  const [page, setPage]    = useState(1);
  const [busyId, setBusy]  = useState(null);
  const [error, setError]  = useState('');

  useEffect(() => {
    getCategory(id).then(setCat).catch(() => setCat(null));
  }, [id]);

  const fetch = useCallback(() => {
    setLoad(true);
    listProducts({ category: id, page })
      .then(setData)
      .catch(() => setData({ results: [], count: 0 }))
      .finally(() => setLoad(false));
  }, [id, page]);

  useEffect(fetch, [fetch]);

  const setActive = (pid, value) =>
    setData(d => ({ ...d, results: d.results.map(r => (r.id === pid ? { ...r, is_active: value } : r)) }));

  // Optimistic: flip the tag immediately, roll it back if the PATCH fails.
  const toggleActive = async (p) => {
    const next = !p.is_active;
    setBusy(p.id);
    setError('');
    setActive(p.id, next);
    try {
      await updateProduct(p.id, { is_active: next });
    } catch {
      setActive(p.id, p.is_active);
      setError(`Could not ${next ? 'activate' : 'deactivate'} “${p.name}”. Please try again.`);
    } finally {
      setBusy(null);
    }
  };

  const pageSize   = 24;
  const totalPages = Math.max(1, Math.ceil((data.count || 0) / pageSize));

  return (
    <div className="max-w-6xl mx-auto">
      <button onClick={() => navigate('/admin/categories')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 dark:text-zinc-400 hover:text-accent transition mb-4">
        <ArrowLeft size={16} /> All categories
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-accent text-xs font-black uppercase tracking-widest mb-1">Category</p>
          <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100">
            {cat ? (cat.parent_name ? `${cat.parent_name} → ${cat.name}` : cat.name) : '…'}
          </h1>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mt-1">
            {loading ? '—' : `${data.count} product${data.count !== 1 ? 's' : ''} in this category`}
          </p>
        </div>
        {/* Starts the upload wizard with this category already selected. */}
        <button onClick={() => navigate(`/admin/products/new?category=${id}`)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition shadow-sm shrink-0">
          <Plus size={18} /> Add Product to {cat?.name || 'this category'}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-sm font-semibold text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader className="animate-spin" /></div>
      ) : !data.results.length ? (
        <div className="text-center py-20 text-gray-400">
          <Package size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No products in this category yet</p>
          <button onClick={() => navigate(`/admin/products/new?category=${id}`)}
            className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition">
            <Plus size={18} /> Add the first one
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* A compact row on phones, a picture-led box from sm up. */}
          {data.results.map(p => (
            <div key={p.id}
              className="flex flex-row sm:flex-col bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
              <button onClick={() => navigate(`/admin/products/${p.id}`)}
                className="w-28 shrink-0 sm:w-full sm:aspect-square bg-gray-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                {p.thumb ? <img src={p.thumb} alt={p.name} className="w-full h-full object-cover" />
                         : <ImageOff size={24} className="text-gray-300" />}
              </button>
              <div className="p-3 flex flex-col gap-2 flex-1 min-w-0">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 dark:text-zinc-100 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                    {p.variation_count} variation{p.variation_count !== 1 ? 's' : ''} · MOQ {p.moq}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 mt-auto">
                  <StatusToggle active={p.is_active} busy={busyId === p.id}
                    onToggle={() => toggleActive(p)} />
                  <button onClick={() => navigate(`/admin/products/${p.id}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-white/10 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-white/5 transition">
                    <Pencil size={13} /> Edit
                  </button>
                </div>
              </div>
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
