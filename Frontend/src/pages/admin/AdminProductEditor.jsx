import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader, Save, Trash2, Plus, Check, Image as ImageIcon, Layers, FileText, AlertCircle,
} from 'lucide-react';
import {
  createProduct, getProduct, updateProduct,
  listCategories, listColors, listSizeSets,
  createVariation, deleteVariation,
} from '../../api/adminApi';
import MediaPicker from '../../components/admin/MediaPicker';

const card = 'bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-5 sm:p-6';
const labelCls = 'block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1.5';
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40';

const SectionHead = ({ icon: Icon, title, sub, done }) => (
  <div className="flex items-center gap-3 mb-5">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${done ? 'bg-green-100 dark:bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-accent/10 text-accent'}`}>
      {done ? <Check size={18} /> : <Icon size={18} />}
    </div>
    <div>
      <h2 className="text-base font-black text-gray-900 dark:text-zinc-100">{title}</h2>
      {sub && <p className="text-xs text-gray-400 dark:text-zinc-500">{sub}</p>}
    </div>
  </div>
);

export default function AdminProductEditor() {
  const { id } = useParams();
  const isNew  = !id || id === 'new';
  const navigate = useNavigate();

  const [loading, setLoad]   = useState(!isNew);
  const [saving, setSaving]  = useState(false);
  const [error, setError]    = useState('');
  const [categories, setCategories] = useState([]);
  const [colors, setColors]  = useState([]);
  const [sizeSets, setSizeSets] = useState([]);
  const [variations, setVariations] = useState([]);

  const [form, setForm] = useState({
    name: '', category: '', subcategories: [], description: '',
    fabric_details: '', moq: 10, is_active: false,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const loadRefs = useCallback(() => {
    Promise.all([listCategories(), listColors(), listSizeSets()])
      .then(([cats, cols, ss]) => { setCategories(cats); setColors(cols); setSizeSets(ss); });
  }, []);

  const loadProduct = useCallback(() => {
    if (isNew) return;
    setLoad(true);
    getProduct(id)
      .then(p => {
        setForm({
          name: p.name || '', category: p.category || '',
          subcategories: p.subcategories || [], description: p.description || '',
          fabric_details: p.fabric_details || '', moq: p.moq ?? 10, is_active: p.is_active,
        });
        setVariations(p.variations || []);
      })
      .catch(() => setError('Failed to load product.'))
      .finally(() => setLoad(false));
  }, [id, isNew]);

  useEffect(() => { loadRefs(); loadProduct(); }, [loadRefs, loadProduct]);

  const mainCategories = categories.filter(c => !c.parent);
  const subCategories  = categories.filter(c => c.parent === Number(form.category));

  const saveBase = () => {
    setSaving(true); setError('');
    const payload = { ...form, category: form.category || null, moq: Number(form.moq) || 0 };
    const req = isNew ? createProduct(payload) : updateProduct(id, payload);
    req.then(p => {
      if (isNew) navigate(`/admin/products/${p.id}`, { replace: true });
    }).catch(err => {
      const d = err.response?.data;
      setError(d ? Object.entries(d).map(([k, v]) => `${k}: ${v}`).join('  •  ') : 'Save failed.');
    }).finally(() => setSaving(false));
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader className="animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <button onClick={() => navigate('/admin/products')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 mb-4">
        <ArrowLeft size={16} /> Back to products
      </button>

      <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100 mb-1">
        {isNew ? 'Upload New Product' : form.name || 'Edit Product'}
      </h1>
      <p className="text-gray-500 dark:text-zinc-400 text-sm mb-6">
        {isNew ? 'Fill in the basics and save — then add images and variants.' : 'Edit details, images, and variants.'}
      </p>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm rounded-xl px-4 py-3 mb-5">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      <div className="space-y-5">
        {/* ── Base details ── */}
        <div className={card}>
          <SectionHead icon={FileText} title="Base Details" sub="Name, category and basics" done={!isNew} />
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Product name *</label>
              <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Urban Rise Track Pant" />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select className={inputCls} value={form.category} onChange={e => set('category', e.target.value ? Number(e.target.value) : '')}>
                <option value="">— Select —</option>
                {mainCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>MOQ (min order qty)</label>
              <input type="number" min="1" className={inputCls} value={form.moq} onChange={e => set('moq', e.target.value)} />
            </div>
            {subCategories.length > 0 && (
              <div className="sm:col-span-2">
                <label className={labelCls}>Sub-categories</label>
                <div className="flex flex-wrap gap-2">
                  {subCategories.map(sc => {
                    const on = form.subcategories.includes(sc.id);
                    return (
                      <button key={sc.id} type="button"
                        onClick={() => set('subcategories', on ? form.subcategories.filter(x => x !== sc.id) : [...form.subcategories, sc.id])}
                        className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition ${on ? 'bg-accent text-white border-accent' : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-zinc-300 hover:border-accent'}`}>
                        {sc.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className={labelCls}>Description</label>
              <textarea rows={3} className={inputCls} value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Fabric details</label>
              <textarea rows={2} className={inputCls} value={form.fabric_details} onChange={e => set('fabric_details', e.target.value)} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)}
                className="w-4 h-4 rounded accent-[color:var(--tw-accent,#e11d48)]" />
              <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300">Active (visible on storefront)</span>
            </label>
          </div>
          <div className="mt-5 flex justify-end">
            <button onClick={saveBase} disabled={saving || !form.name}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-50">
              {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
              {isNew ? 'Save & continue' : 'Save details'}
            </button>
          </div>
        </div>

        {/* ── Images ── */}
        <div className={card}>
          <SectionHead icon={ImageIcon} title="Images" sub="Upload once, choose from the library" />
          {isNew ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500 border border-dashed border-gray-200 dark:border-white/10 rounded-xl px-4 py-6 text-center">
              Save the base details first — then a Cover and Gallery picker appear here.
            </p>
          ) : (
            <div className="space-y-6">
              <div>
                <label className={labelCls}>Cover image (shown first to buyers)</label>
                <MediaPicker type="product" id={Number(id)} role="primary" single folder="products" label="cover image" />
              </div>
              <div>
                <label className={labelCls}>Gallery (drag to reorder)</label>
                <MediaPicker type="product" id={Number(id)} role="gallery" folder="products/gallery" label="gallery images" />
              </div>
            </div>
          )}
        </div>

        {/* ── Variants ── */}
        <div className={card}>
          <SectionHead icon={Layers} title="Variants & Pricing" sub="Size sets, colours, price and stock" />
          {isNew ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500 border border-dashed border-gray-200 dark:border-white/10 rounded-xl px-4 py-6 text-center">
              Save the base details first to add variants.
            </p>
          ) : (
            <VariantsEditor
              productId={Number(id)} colors={colors} sizeSets={sizeSets}
              variations={variations} onChange={setVariations} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Variants editor ──────────────────────────────────────────────────────────
function VariantsEditor({ productId, colors, sizeSets, variations, onChange }) {
  const [adding, setAdding] = useState(false);

  const remove = (vid) => {
    if (!window.confirm('Delete this variant?')) return;
    deleteVariation(vid).then(() => onChange(variations.filter(v => v.id !== vid)));
  };

  return (
    <div>
      {variations.length > 0 && (
        <div className="overflow-x-auto -mx-2 mb-4">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-zinc-500">
                <th className="px-2 py-2">SKU</th><th className="px-2 py-2">Size set</th>
                <th className="px-2 py-2">Colour</th><th className="px-2 py-2">Per-piece</th>
                <th className="px-2 py-2">Set price</th><th className="px-2 py-2">Stock</th><th></th>
              </tr>
            </thead>
            <tbody>
              {variations.map(v => (
                <tr key={v.id} className="border-t border-gray-100 dark:border-white/5">
                  <td className="px-2 py-2.5 font-semibold text-gray-900 dark:text-zinc-100">{v.sku}</td>
                  <td className="px-2 py-2.5 text-gray-600 dark:text-zinc-300">{v.size_name || '—'}</td>
                  <td className="px-2 py-2.5 text-gray-600 dark:text-zinc-300">{v.color_name || v.color || '—'}</td>
                  <td className="px-2 py-2.5 text-gray-600 dark:text-zinc-300">₹{v.per_piece_price ?? '—'}</td>
                  <td className="px-2 py-2.5 text-gray-600 dark:text-zinc-300">₹{v.b2b_price ?? '—'}</td>
                  <td className="px-2 py-2.5 text-gray-600 dark:text-zinc-300">{v.stock_quantity}</td>
                  <td className="px-2 py-2.5 text-right">
                    <button onClick={() => remove(v.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <VariantForm
          productId={productId} colors={colors} sizeSets={sizeSets}
          onCancel={() => setAdding(false)}
          onSaved={(v) => { onChange([...variations, v]); setAdding(false); }} />
      ) : (
        <button onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-semibold text-accent hover:bg-accent/5 transition">
          <Plus size={16} /> Add variant
        </button>
      )}
    </div>
  );
}

function VariantForm({ productId, colors, sizeSets, onCancel, onSaved }) {
  const [v, setV] = useState({
    size_set: '', size_breakdown: '', color_palette: '', sku: '',
    per_piece_price: '', mrp_per_piece: '', stock_quantity: 0,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, val) => setV(s => ({ ...s, [k]: val }));

  const breakdowns = sizeSets.find(s => s.id === Number(v.size_set))?.breakdowns || [];

  const save = () => {
    setSaving(true); setErr('');
    createVariation({
      product: productId,
      size_set: v.size_set || null,
      size_breakdown: v.size_breakdown || null,
      color_palette: v.color_palette || null,
      sku: v.sku,
      per_piece_price: v.per_piece_price || null,
      mrp_per_piece: v.mrp_per_piece || null,
      stock_quantity: Number(v.stock_quantity) || 0,
    }).then(onSaved).catch(e => {
      const d = e.response?.data;
      setErr(d ? Object.entries(d).map(([k, val]) => `${k}: ${val}`).join(' • ') : 'Failed to save variant.');
    }).finally(() => setSaving(false));
  };

  return (
    <div className="border border-gray-200 dark:border-white/10 rounded-2xl p-4 bg-gray-50/50 dark:bg-white/[0.02]">
      {err && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{err}</p>}
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>SKU *</label>
          <input className={inputCls} value={v.sku} onChange={e => set('sku', e.target.value)} placeholder="Unique code" />
        </div>
        <div>
          <label className={labelCls}>Size set</label>
          <select className={inputCls} value={v.size_set} onChange={e => { set('size_set', e.target.value); set('size_breakdown', ''); }}>
            <option value="">— None —</option>
            {sizeSets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Set breakdown</label>
          <select className={inputCls} value={v.size_breakdown} disabled={!breakdowns.length} onChange={e => set('size_breakdown', e.target.value)}>
            <option value="">— None —</option>
            {breakdowns.map(b => <option key={b.id} value={b.id}>{b.label} ({b.pieces} pcs)</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Colour</label>
          <select className={inputCls} value={v.color_palette} onChange={e => set('color_palette', e.target.value)}>
            <option value="">— None —</option>
            {colors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Per-piece price ₹</label>
          <input type="number" step="0.01" className={inputCls} value={v.per_piece_price} onChange={e => set('per_piece_price', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>MRP per piece ₹</label>
          <input type="number" step="0.01" className={inputCls} value={v.mrp_per_piece} onChange={e => set('mrp_per_piece', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Stock</label>
          <input type="number" min="0" className={inputCls} value={v.stock_quantity} onChange={e => set('stock_quantity', e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2">Set total price is calculated automatically from per-piece × pieces in the breakdown.</p>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onCancel} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-white/5">Cancel</button>
        <button onClick={save} disabled={saving || !v.sku}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-50">
          {saving ? <Loader size={15} className="animate-spin" /> : <Check size={15} />} Save variant
        </button>
      </div>
    </div>
  );
}
