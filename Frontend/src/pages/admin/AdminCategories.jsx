import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Loader, Trash2, FolderTree, AlertCircle, ChevronRight, Check, X, PackageOpen,
} from 'lucide-react';
import { listCategories, createCategory, deleteCategory, updateCategory } from '../../api/adminApi';
import { SeoSection, FieldHeader, GooglePreview } from '../../components/admin/SeoFields';
import { effectiveCategorySeo, META_DESCRIPTION_MAX } from '../../config/seoCopy';
import { SITE_URL } from '../../config/site';
import { CATEGORY_CONTENT } from '../../content/seoContent';

// text-base on phones: anything under 16px makes iOS Safari zoom in on focus.
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40';

export default function AdminCategories() {
  const [cats, setCats]     = useState([]);
  const [loading, setLoad]  = useState(true);
  const [name, setName]     = useState('');
  const [parent, setParent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  // The category a delete was refused for, with the products standing in the
  // way: { category, count, names }.
  const [blocked, setBlocked] = useState(null);
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

  const remove = (cat) => {
    if (!window.confirm(`Delete "${cat.name}"?`)) return;
    deleteCategory(cat.id)
      .then(load)
      .catch(err => {
        // 409 is the server refusing because products are still filed here —
        // it comes back with the count, so say which category and how many
        // rather than the old blanket "it may be in use".
        const data = err.response?.data;
        if (err.response?.status === 409 && (data?.product_count || data?.child_count)) {
          setBlocked({ category: cat, ...data });
        } else {
          setError(data?.error || `Could not delete "${cat.name}".`);
        }
      });
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
                  <button onClick={() => remove(main)} aria-label={`Delete ${main.name}`}
                    className="p-2.5 -mr-1 text-gray-400 hover:text-red-500 shrink-0"><Trash2 size={15} /></button>
                </div>

                <CategorySeoPanel category={main} />

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
                        <button onClick={() => remove(s)} aria-label={`Delete ${s.name}`}
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

      {blocked && (
        <NotEmptyDialog
          {...blocked}
          onView={() => navigate(`/admin/categories/${blocked.category.id}`)}
          onClose={() => setBlocked(null)}
        />
      )}
    </div>
  );
}

/**
 * Why a category could not be deleted.
 *
 * A category is deletable only when it is completely empty, so there are two
 * reasons it can be refused and they can both apply at once. Each is listed
 * separately with what it contains, because "not empty" leaves an admin
 * guessing which of the two to go and fix.
 *
 * The counts come from the server rather than the loaded category list: a
 * sub-category's products are not on this page, and a stale count on a refusal
 * dialog is worse than none.
 */
function NotEmptyDialog({
  category, child_count = 0, product_count = 0,
  child_names = [], product_names = [], onView, onClose,
}) {
  const label = category.parent ? 'sub-category' : 'category';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-base font-black text-gray-900 dark:text-zinc-100">
            Can&apos;t delete &ldquo;{category.name}&rdquo;
          </h3>
          <button onClick={onClose} className="p-1.5 -mt-1 text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 shrink-0">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mb-4">
          A {label} can only be deleted once it is completely empty.
        </p>

        {child_count > 0 && (
          <Blocker
            icon={FolderTree}
            heading={`${child_count} sub-categor${child_count === 1 ? 'y' : 'ies'}`}
            instruction="Empty and delete these first."
            names={child_names}
            total={child_count}
          />
        )}

        {product_count > 0 && (
          <Blocker
            icon={PackageOpen}
            heading={`${product_count} product${product_count === 1 ? '' : 's'}`}
            instruction={`Edit ${product_count === 1 ? 'it' : 'them'} and remove this ${label}.`}
            names={product_names}
            total={product_count}
          />
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-bold text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/5">
            Close
          </button>
          {product_count > 0 && (
            <button onClick={onView}
              className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition">
              View products
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** One reason the category is not empty, with a sample of what is in it. */
function Blocker({ icon: Icon, heading, instruction, names, total }) {
  return (
    <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-800 dark:text-amber-300 mb-2.5">
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p><span className="font-bold">{heading}</span> inside. {instruction}</p>
        {names.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-amber-700/90 dark:text-amber-300/70">
            {names.map(n => <li key={n} className="truncate">• {n}</li>)}
            {total > names.length && <li>…and {total - names.length} more</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Per-category SEO, folded away until asked for.
 *
 * Only main categories get one: /catalog/:slug resolves top-level categories
 * only (CategoryViewSet filters parent__isnull=True), so a sub-category has no
 * page of its own to describe.
 *
 * Saves on its own button rather than with the add form above it — this is
 * editing an existing row, and nothing else on this page does that.
 */
function CategorySeoPanel({ category }) {
  const initial = {
    description: category.description || '',
    content: category.content || '',
    faqs: Array.isArray(category.faqs) ? category.faqs : [],
  };
  const [open, setOpen]         = useState(false);
  const [form, setForm]         = useState(initial);
  const [saved, setSaved]       = useState(initial);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [justSaved, setJustSaved] = useState(false);

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const setFaq = (i, key, value) =>
    set('faqs', form.faqs.map((f, j) => (j === i ? { ...f, [key]: value } : f)));

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const preview = effectiveCategorySeo({ name: category.name, description: form.description });
  const fallback = CATEGORY_CONTENT[category.slug];
  const words = form.content.trim() ? form.content.trim().split(/\s+/).length : 0;
  const overridden = [saved.description, saved.content].filter(v => v.trim()).length
    + (saved.faqs.length ? 1 : 0);

  const save = () => {
    setSaving(true); setError(''); setJustSaved(false);
    const faqs = form.faqs.filter(f => (f.q || '').trim() && (f.a || '').trim());
    updateCategory(category.id, { description: form.description, content: form.content, faqs })
      .then(c => {
        const next = {
          description: c.description || '',
          content: c.content || '',
          faqs: Array.isArray(c.faqs) ? c.faqs : [],
        };
        setSaved(next); setForm(next);
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2500);
      })
      .catch(e => setError(e.response?.data ? JSON.stringify(e.response.data) : 'Could not save.'))
      .finally(() => setSaving(false));
  };

  return (
    <SeoSection
      open={open}
      onToggle={() => setOpen(o => !o)}
      overridden={overridden}
      subtitle={`How /catalog/${category.slug} appears in Google, plus the page copy and FAQs. Optional — blank uses the default.`}
    >
      <div>
        <FieldHeader label="Meta description" value={form.description} max={META_DESCRIPTION_MAX} soft={140} />
        <textarea
          rows={3}
          maxLength={META_DESCRIPTION_MAX}
          className={inputCls}
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder={preview.generatedDescription ? 'Generated — type here to override' : ''}
        />
      </div>

      <GooglePreview
        url={`${SITE_URL.replace(/^https?:\/\//, '')}/catalog/${category.slug}`}
        title={preview.title}
        description={preview.description}
        generatedDescription={preview.generatedDescription}
      />

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Page copy</label>
          <span className={`text-xs font-semibold ${words && (words < 150 || words > 300) ? 'text-amber-600' : 'text-gray-400'}`}>
            {words ? `${words} words · aim for 150–300` : 'Using default copy'}
          </span>
        </div>
        <textarea
          rows={8}
          className={inputCls}
          value={form.content}
          onChange={e => set('content', e.target.value)}
          placeholder={fallback ? fallback.paragraphs.join('\n\n') : 'Fabric, sizes, MOQ, who it is for, dispatch. Separate paragraphs with a blank line.'}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">FAQs</label>
          <span className="text-xs text-gray-400">{form.faqs.length ? `${form.faqs.length} written` : `Using ${fallback?.faqs.length ?? 3} default FAQs`}</span>
        </div>
        {form.faqs.map((f, i) => (
          <div key={i} className="space-y-2 p-3 rounded-xl border border-gray-200 dark:border-white/10">
            <div className="flex gap-2">
              <input className={inputCls} value={f.q || ''} placeholder="Question"
                onChange={e => setFaq(i, 'q', e.target.value)} />
              <button type="button" onClick={() => set('faqs', form.faqs.filter((_, j) => j !== i))}
                className="shrink-0 p-2 rounded-xl text-gray-400 hover:text-red-600" aria-label="Remove FAQ">
                <X size={16} />
              </button>
            </div>
            <textarea rows={2} className={inputCls} value={f.a || ''} placeholder="Answer"
              onChange={e => setFaq(i, 'a', e.target.value)} />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => set('faqs', [...form.faqs, { q: '', a: '' }])}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-700 dark:text-zinc-300">
            <Plus size={14} /> Add FAQ
          </button>
          {!form.faqs.length && fallback && (
            <button type="button" onClick={() => set('faqs', fallback.faqs.map(f => ({ ...f })))}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-700 dark:text-zinc-300">
              Start from default FAQs
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={15} className="mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {justSaved && (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-600 dark:text-green-400">
            <Check size={14} /> Saved
          </span>
        )}
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-50"
        >
          {saving ? <Loader size={15} className="animate-spin" /> : <Check size={15} />} Save
        </button>
      </div>
    </SeoSection>
  );
}
