import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Loader, Trash2, FolderTree, AlertCircle, ChevronRight,
} from 'lucide-react';
import { listCategories, createCategory, deleteCategory } from '../../api/adminApi';

// text-base on phones: anything under 16px makes iOS Safari zoom in on focus.
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40';

export default function AdminCategories() {
  const [cats, setCats]     = useState([]);
  const [loading, setLoad]  = useState(true);
  const [name, setName]     = useState('');
  const [parent, setParent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const navigate = useNavigate();

  const load = () => {
    setLoad(true);
    listCategories().then(setCats).finally(() => setLoad(false));
  };
  useEffect(load, []);

  // A tag is a link — it opens that category's own products page.
  const open = (id) => navigate(`/admin/categories/${id}`);

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
    deleteCategory(id).then(load).catch(() => alert('Could not delete — it may be in use by products.'));
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
                  <button onClick={() => open(main.id)} title={`View products in ${main.name}`}
                    className="flex items-center gap-2 min-w-0 py-1 font-bold text-gray-900 dark:text-zinc-100 hover:text-accent transition text-left">
                    <FolderTree size={16} className="text-accent shrink-0" />
                    <span className="truncate">{main.name}</span>
                    <ChevronRight size={15} className="text-gray-400 shrink-0" />
                  </button>
                  <button onClick={() => remove(main.id)} aria-label={`Delete ${main.name}`}
                    className="p-2.5 -mr-1 text-gray-400 hover:text-red-500 shrink-0"><Trash2 size={15} /></button>
                </div>

                {subs.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pl-6">
                    {subs.map(s => (
                      <span key={s.id}
                        className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full bg-gray-100 dark:bg-white/5 text-sm text-gray-700 dark:text-zinc-300">
                        <button onClick={() => open(s.id)} title={`View products in ${s.name}`}
                          className="inline-flex items-center gap-1 pl-2 hover:text-accent transition">
                          {s.name}
                          <ChevronRight size={13} className="text-gray-400" />
                        </button>
                        <button onClick={() => remove(s.id)} aria-label={`Delete ${s.name}`}
                          className="w-7 h-7 rounded-full hover:bg-red-100 dark:hover:bg-red-500/20 text-gray-400 hover:text-red-500 flex items-center justify-center shrink-0">×</button>
                      </span>
                    ))}
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
