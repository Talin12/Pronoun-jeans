import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Loader, Trash2, FolderTree, AlertCircle, ChevronRight, ImageOff, Package,
} from 'lucide-react';
import {
  listCategories, createCategory, deleteCategory, listProducts,
} from '../../api/adminApi';

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40';

/** The products filed under one category, revealed by clicking its tag. */
const ProductPanel = ({ state, onOpenProduct }) => {
  if (!state || state.loading) {
    return <div className="flex items-center gap-2 py-4 text-sm text-gray-400"><Loader size={15} className="animate-spin" /> Loading products…</div>;
  }
  if (state.error) {
    return <div className="flex items-center gap-2 py-4 text-sm text-red-600 dark:text-red-400"><AlertCircle size={15} /> {state.error}</div>;
  }
  if (!state.results.length) {
    return <div className="flex items-center gap-2 py-4 text-sm text-gray-400"><Package size={15} /> No products in this category yet.</div>;
  }
  return (
    <div className="space-y-1.5 py-2">
      {state.results.map(p => (
        <button key={p.id} onClick={() => onOpenProduct(p.id)}
          className="w-full flex items-center gap-3 text-left px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition">
          <span className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center">
            {p.thumb ? <img src={p.thumb} alt={p.name} className="w-full h-full object-cover" />
                     : <ImageOff size={14} className="text-gray-300" />}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-sm text-gray-900 dark:text-zinc-100 truncate">{p.name}</span>
            <span className="block text-xs text-gray-500 dark:text-zinc-400 truncate">
              {p.variation_count} variation{p.variation_count !== 1 ? 's' : ''} · MOQ {p.moq}
            </span>
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
            p.is_active
              ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400'
              : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-zinc-400'
          }`}>{p.is_active ? 'Active' : 'Inactive'}</span>
        </button>
      ))}
      {state.count > state.results.length && (
        <p className="text-xs text-gray-400 px-2 pt-1">
          Showing {state.results.length} of {state.count} — open Products to see the rest.
        </p>
      )}
    </div>
  );
};

export default function AdminCategories() {
  const [cats, setCats]     = useState([]);
  const [loading, setLoad]  = useState(true);
  const [name, setName]     = useState('');
  const [parent, setParent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [openId, setOpen]   = useState(null);   // category tag currently expanded
  const [prods, setProds]   = useState({});     // { [categoryId]: {loading,results,count,error} }
  const navigate = useNavigate();

  const load = () => {
    setLoad(true);
    listCategories().then(setCats).finally(() => setLoad(false));
  };
  useEffect(load, []);

  // Click a tag to reveal its products; click again to collapse. Results are
  // cached per category so re-opening a tag is instant.
  const toggleOpen = (id) => {
    if (openId === id) { setOpen(null); return; }
    setOpen(id);
    if (prods[id] && !prods[id].error) return;
    setProds(s => ({ ...s, [id]: { loading: true, results: [], count: 0 } }));
    listProducts({ category: id, page_size: 100 })
      .then(d => setProds(s => ({ ...s, [id]: { loading: false, results: d.results || [], count: d.count || 0 } })))
      .catch(() => setProds(s => ({ ...s, [id]: { loading: false, results: [], count: 0, error: 'Could not load products.' } })));
  };

  const add = () => {
    if (!name.trim()) return;
    setSaving(true); setError('');
    createCategory({ name: name.trim(), parent: parent || null })
      .then(() => { setName(''); setParent(''); load(); })
      .catch(e => setError(e.response?.data ? JSON.stringify(e.response.data) : 'Failed to add.'))
      .finally(() => setSaving(false));
  };

  const remove = (id) => {
    if (!window.confirm('Delete this category?')) return;
    deleteCategory(id)
      .then(() => { setOpen(null); setProds({}); load(); })
      .catch(() => alert('Could not delete — it may be in use by products.'));
  };

  const mains = cats.filter(c => !c.parent);

  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-accent text-xs font-black uppercase tracking-widest mb-1">Admin Panel</p>
      <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100 mb-6">Categories</h1>

      {/* Add form */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-5 mb-6">
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1.5">Name</label>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Men, Jeans" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1.5">Parent (for sub-category)</label>
            <select className={inputCls} value={parent} onChange={e => setParent(e.target.value)}>
              <option value="">— None (main category) —</option>
              {mains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button onClick={add} disabled={saving || !name.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-50">
            {saving ? <Loader size={16} className="animate-spin" /> : <Plus size={16} />} Add
          </button>
        </div>
        {error && (
          <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-sm mt-3">
            <AlertCircle size={15} className="mt-0.5" /> <span>{error}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader className="animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {mains.map(main => {
            const subs = cats.filter(c => c.parent === main.id);
            return (
              <div key={main.id} className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <button onClick={() => toggleOpen(main.id)} aria-expanded={openId === main.id}
                    className="flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100 hover:text-accent transition text-left">
                    <FolderTree size={16} className="text-accent" /> {main.name}
                    <ChevronRight size={15} className={`text-gray-400 transition-transform ${openId === main.id ? 'rotate-90' : ''}`} />
                  </button>
                  <button onClick={() => remove(main.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>

                {openId === main.id && (
                  <div className="mt-2 pl-6 border-t border-gray-100 dark:border-white/5">
                    <ProductPanel state={prods[main.id]} onOpenProduct={id => navigate(`/admin/products/${id}`)} />
                  </div>
                )}

                {subs.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pl-6">
                    {subs.map(s => (
                      <span key={s.id}
                        className={`inline-flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full text-sm transition ${
                          openId === s.id
                            ? 'bg-accent/10 text-accent'
                            : 'bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-zinc-300'
                        }`}>
                        <button onClick={() => toggleOpen(s.id)} aria-expanded={openId === s.id}
                          className="inline-flex items-center gap-1 pl-2 hover:opacity-70">
                          {s.name}
                          <ChevronRight size={13} className={`transition-transform ${openId === s.id ? 'rotate-90' : ''}`} />
                        </button>
                        <button onClick={() => remove(s.id)} className="w-5 h-5 rounded-full hover:bg-red-100 dark:hover:bg-red-500/20 text-gray-400 hover:text-red-500 flex items-center justify-center">×</button>
                      </span>
                    ))}
                  </div>
                )}

                {subs.some(s => s.id === openId) && (
                  <div className="mt-2 pl-6 border-t border-gray-100 dark:border-white/5">
                    <ProductPanel state={prods[openId]} onOpenProduct={id => navigate(`/admin/products/${id}`)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
