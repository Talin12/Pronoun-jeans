import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Loader, Package, ChevronLeft, ChevronRight, ImageOff, Pencil,
  ArrowUpDown, FolderTree, ToggleLeft, X,
} from 'lucide-react';
import { listCategories, listProducts, updateProduct } from '../../api/adminApi';
import StatusToggle from '../../components/admin/StatusToggle';

// Every sort the list offers, as the `ordering` value the API expects. Kept as
// one list so the dropdown and the request cannot disagree about what "Newest"
// means — the API orders by -created_at, and a label that drifts from that is
// a bug nobody notices.
const SORTS = [
  { value: '-created_at',      label: 'Newest first' },
  { value: 'created_at',       label: 'Oldest first' },
  { value: 'name',             label: 'Name A–Z' },
  { value: '-name',            label: 'Name Z–A' },
  { value: '-variation_count', label: 'Most variations' },
  { value: 'variation_count',  label: 'Fewest variations' },
];

const selectCls = 'appearance-none pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 '
  + 'dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm font-semibold '
  + 'text-gray-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-accent/40';

/** A select with a leading icon, matching the search field's height. */
const FilterSelect = ({ icon: Icon, value, onChange, children, label }) => (
  <div className="relative">
    <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}
      className={selectCls}>
      {children}
    </select>
  </div>
);

export default function AdminProducts() {
  const [data, setData]     = useState({ results: [], count: 0 });
  const [loading, setLoad]  = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');   // '' = every category
  const [status, setStatus]     = useState('');   // '' = active and inactive
  const [sort, setSort]         = useState(SORTS[0].value);
  const [categories, setCategories] = useState([]);
  const [page, setPage]     = useState(1);
  const [busyId, setBusy]   = useState(null);
  const [error, setError]   = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const fetch = useCallback(() => {
    setLoad(true);
    // Empty values are dropped rather than sent blank: the API treats an
    // unrecognised is_active as "no filter", but a blank category would be
    // parsed as an id and match nothing.
    listProducts({
      search, page, ordering: sort,
      ...(category ? { category } : {}),
      ...(status ? { is_active: status } : {}),
    })
      .then(setData)
      .catch(() => setData({ results: [], count: 0 }))
      .finally(() => setLoad(false));
  }, [search, page, sort, category, status]);

  useEffect(() => {
    const t = setTimeout(fetch, 200);
    return () => clearTimeout(t);
  }, [fetch]);

  const setActive = (id, value) =>
    setData(d => ({ ...d, results: d.results.map(r => (r.id === id ? { ...r, is_active: value } : r)) }));

  // Optimistic: flip the pill immediately, roll it back if the PATCH fails.
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

  // Sort is excluded on purpose: reordering the list hides nothing, so
  // offering to "clear" it would imply results are being kept back.
  const filtered = Boolean(search || category || status);

  const clearFilters = () => {
    setPage(1); setSearch(''); setCategory(''); setStatus('');
  };

  const pageSize = 24;
  const totalPages = Math.max(1, Math.ceil((data.count || 0) / pageSize));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-accent text-xs font-black uppercase tracking-widest mb-1">Admin Panel</p>
          <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100">Products</h1>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mt-1">
            {loading ? '—'
              : `${data.count} product${data.count !== 1 ? 's' : ''}${filtered ? ' match' : ''}`}
          </p>
        </div>
        <button onClick={() => navigate('/admin/products/new')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition shadow-sm">
          <Plus size={18} /> Upload New Product
        </button>
      </div>

      {/* Search, filters and sort on one line, wrapping to their own rows on a
          phone. Every one of them resets to page 1 — filtering while on page 3
          otherwise lands on an empty list that looks like "no results". */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* text-base on phones: under 16px makes iOS Safari zoom in on focus. */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => { setPage(1); setSearch(e.target.value); }}
            placeholder="Search by product name or SKU…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40" />
        </div>

        <FilterSelect icon={FolderTree} label="Filter by category"
          value={category} onChange={v => { setPage(1); setCategory(v); }}>
          <option value="">All categories</option>
          {categories.filter(c => !c.parent).map(main => (
            <optgroup key={main.id} label={main.name}>
              <option value={main.id}>{main.name} (all)</option>
              {categories.filter(c => c.parent === main.id).map(sub => (
                <option key={sub.id} value={sub.id}>{main.name} → {sub.name}</option>
              ))}
            </optgroup>
          ))}
        </FilterSelect>

        <FilterSelect icon={ToggleLeft} label="Filter by status"
          value={status} onChange={v => { setPage(1); setStatus(v); }}>
          <option value="">Active &amp; inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </FilterSelect>

        <FilterSelect icon={ArrowUpDown} label="Sort products"
          value={sort} onChange={v => { setPage(1); setSort(v); }}>
          {SORTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </FilterSelect>

        {filtered && (
          <button onClick={clearFilters}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-500 dark:text-zinc-400 hover:text-accent transition">
            <X size={15} /> Clear
          </button>
        )}
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
          <p className="font-semibold">No products found</p>
          {/* Without this an admin who filtered to an empty combination has no
              hint that the catalogue is not simply empty. */}
          {filtered && (
            <button onClick={clearFilters} className="mt-3 text-sm font-bold text-accent hover:underline">
              Clear search and filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {data.results.map(p => (
            <div key={p.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-3 hover:shadow-md transition-shadow">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-gray-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center">
                {p.thumb ? <img src={p.thumb} alt={p.name} className="w-full h-full object-cover" />
                         : <ImageOff size={20} className="text-gray-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-zinc-100 truncate">{p.name}</p>
                <p className="text-sm text-gray-500 dark:text-zinc-400 truncate">
                  {p.category_name || 'No category'} · {p.variation_count} variation{p.variation_count !== 1 ? 's' : ''} · MOQ {p.moq}
                </p>
              </div>
              {/* On a phone these drop to a full-width row of their own rather
                  than squeezing the product name to nothing. */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <StatusToggle active={p.is_active} busy={busyId === p.id}
                  onToggle={() => toggleActive(p)} />
                <button onClick={() => navigate(`/admin/products/${p.id}`)}
                  className="inline-flex items-center justify-center gap-1.5 ml-auto sm:ml-0 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-white/5 transition shrink-0">
                  <Pencil size={15} /> Edit
                </button>
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
