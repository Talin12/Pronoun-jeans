import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Loader, Save, Trash2, Plus, Check, Lock,
  Image as ImageIcon, Layers, FileText, ClipboardCheck, AlertCircle, X, ChevronDown, ChevronUp,
  Pencil,
} from 'lucide-react';
import {
  createProduct, getProduct, updateProduct,
  listCategories, listColors, createColor, listSizeSets, createSizeSet,
  createVariation, updateVariation, deleteVariation,
  setProductOgImage, clearProductOgImage,
} from '../../api/adminApi';
import { SeoSection, FieldHeader, GooglePreview } from '../../components/admin/SeoFields';
import { effectiveProductSeo, META_TITLE_MAX, META_DESCRIPTION_MAX } from '../../config/seoCopy';
import { SITE_URL } from '../../config/site';
import MediaPicker from '../../components/admin/MediaPicker';
import SizeRangeBuilder from '../../components/admin/SizeRangeBuilder';
import BulkVariantBuilder from '../../components/admin/BulkVariantBuilder';

const card    = 'bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-5 sm:p-7';
const labelCls = 'block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1.5';
// text-base on phones: anything under 16px makes iOS Safari zoom in on focus.
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40';
const btnPrimary   = 'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-50';
const btnGhost     = 'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-bold text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/5 transition';

// Mirrors adminapi/skus.py, so what the panel previews is what the server
// stores: CODE_COLOUR_SIZESET_<n>PCS, e.g. 574_BLACK_30TO36_4PCS.
const skuToken = (v, len = 16) => String(v || '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, len);

const buildSku = (code, colour, sizeSet, pieces) => {
  const parts = [skuToken(code) || 'SKU'];
  if (colour)  parts.push(skuToken(colour));
  if (sizeSet) parts.push(skuToken(sizeSet));
  if (pieces)  parts.push(`${pieces}PCS`);
  return parts.filter(Boolean).join('_');
};

// Shown beside the product code — placeholders, since no variant exists yet.
const skuPreview = (code) => `${skuToken(code) || 'SKU'}_COLOUR_SIZESET_nPCS`;

const money = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The set total, worked out the way ProductVariation.save() does it:
 * per-piece price × pieces in the chosen breakdown.
 *
 * Read-only — the set price is never typed. Shown so the multiplication is
 * visible before saving rather than a promise in help text.
 */
function SetPriceSummary({ perPiece, mrpPerPiece, pieces }) {
  const n     = Number(pieces) || 1;
  const price = Number(perPiece);
  const mrp   = Number(mrpPerPiece);

  if (!price && !mrp) {
    return (
      <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2">
        Set price is calculated automatically — per-piece price × pieces in the breakdown.
      </p>
    );
  }
  return (
    <div className="mt-3 rounded-xl bg-gray-50 dark:bg-zinc-800 px-3 py-2.5 text-sm">
      {price > 0 && (
        <p className="text-gray-700 dark:text-zinc-300">
          Set price <span className="font-bold text-accent">{money(price * n)}</span>
          <span className="text-xs text-gray-400 dark:text-zinc-500"> — {money(price)} × {n} pc{n === 1 ? '' : 's'}</span>
        </p>
      )}
      {mrp > 0 && (
        <p className="text-gray-500 dark:text-zinc-400 text-xs mt-0.5">
          Set MRP <span className="font-semibold">{money(mrp * n)}</span> — {money(mrp)} × {n} pc{n === 1 ? '' : 's'}
        </p>
      )}
      {!pieces && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          No breakdown chosen — counted as 1 piece.
        </p>
      )}
    </div>
  );
}

const STEPS = [
  { key: 'base',     label: 'Base Details',       icon: FileText },
  { key: 'images',   label: 'Images',             icon: ImageIcon },
  { key: 'variants', label: 'Variants & Pricing', icon: Layers },
  { key: 'review',   label: 'Review & Publish',   icon: ClipboardCheck },
];

export default function AdminProductEditor() {
  const { id } = useParams();
  const isNew  = !id || id === 'new';
  const navigate = useNavigate();
  // ?category=<id> — set when "Add product" is used from a category page.
  const [params] = useSearchParams();
  const preset = params.get('category');

  const [step, setStep]      = useState('base');
  const [loading, setLoad]   = useState(!isNew);
  const [saving, setSaving]  = useState(false);
  const [error, setError]    = useState('');
  const [categories, setCategories] = useState([]);
  const [colors, setColors]  = useState([]);
  const [sizeSets, setSizeSets] = useState([]);
  const [variations, setVariations] = useState([]);

  const [form, setForm] = useState({
    name: '', code: '', category: '', subcategories: [], description: '',
    fabric_details: '', moq: 10, is_active: false,
    // Part of the base payload on purpose: every save path sends the whole
    // form, so these persist through Save & Next, Save as Draft and Publish
    // alike, and the "Unsaved changes" marker covers them for free.
    meta_title: '', meta_description: '',
  });
  const [seoOpen, setSeoOpen] = useState(false);
  const [slug, setSlug]       = useState('');
  // The share image is a file, saved on its own the moment it is chosen.
  const [ogImageUrl, setOgImageUrl] = useState('');
  const [ogBusy, setOgBusy]         = useState(false);
  // What the server last confirmed. Base edits only persist through "Save &
  // Next", Save as Draft or Publish, so an unsaved change needs to be visible
  // rather than quietly dropped when the step changes.
  const [savedForm, setSavedForm] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // One shape for the Base Details payload, so every save path writes the same
  // fields and the dirty check compares like with like — a raw form against a
  // normalised snapshot would read as dirty the instant it was saved.
  const normalizeBase = (f) => ({
    ...f,
    category: f.category || null,
    moq: Number(f.moq) || 0,
  });
  const basePayload = () => normalizeBase(form);

  const baseDirty = savedForm !== null
    && JSON.stringify(normalizeBase(form)) !== JSON.stringify(savedForm);

  const loadRefs = useCallback(() => {
    listCategories().then(setCategories);
    listColors().then(setColors);
    listSizeSets().then(setSizeSets);
  }, []);

  const loadProduct = useCallback(() => {
    if (isNew) return;
    setLoad(true);
    getProduct(id)
      .then(p => {
        const loaded = {
          name: p.name || '', code: p.code || '', category: p.category || '',
          subcategories: p.subcategories || [], description: p.description || '',
          fabric_details: p.fabric_details || '', moq: p.moq ?? 10, is_active: p.is_active,
          meta_title: p.meta_title || '', meta_description: p.meta_description || '',
        };
        setForm(loaded);
        setSavedForm(normalizeBase(loaded));
        setSlug(p.slug || '');
        setOgImageUrl(p.og_image_url || '');
        setVariations(p.variations || []);
      })
      .catch(() => setError('Failed to load product.'))
      .finally(() => setLoad(false));
  }, [id, isNew]);

  useEffect(() => { loadRefs(); loadProduct(); }, [loadRefs, loadProduct]);

  // Prefill the category when the editor was opened from a category page. A
  // sub-category selects its parent too, since the FK holds the main category.
  useEffect(() => {
    if (!isNew || !preset || !categories.length) return;
    const cat = categories.find(c => c.id === Number(preset));
    if (!cat) return;
    setForm(f => {
      if (f.category) return f;               // never clobber a choice already made
      return cat.parent
        ? { ...f, category: cat.parent, subcategories: [cat.id] }
        : { ...f, category: cat.id };
    });
  }, [isNew, preset, categories]);

  const mainCategories = categories.filter(c => !c.parent);
  const subCategories  = categories.filter(c => c.parent === Number(form.category));

  const errMsg = (err, fallback) => {
    const d = err.response?.data;
    return d && typeof d === 'object'
      ? Object.entries(d).map(([k, v]) => `${k}: ${v}`).join('  •  ')
      : fallback;
  };

  const saveBase = (goNext = true) => {
    setSaving(true); setError('');
    const req = isNew ? createProduct(basePayload()) : updateProduct(id, basePayload());
    return req.then(p => {
      setSavedForm(basePayload());
      if (isNew) { navigate(`/admin/products/${p.id}`, { replace: true }); }
      else if (goNext) setStep('images');
      return p;
    }).catch(err => { setError(errMsg(err, 'Save failed.')); throw err; })
      .finally(() => setSaving(false));
  };

  const publish = (active) => {
    setSaving(true); setError('');
    updateProduct(id, { ...basePayload(), is_active: active })
      .then(() => navigate('/admin/products'))
      .catch(err => setError(errMsg(err, 'Failed to update.')))
      .finally(() => setSaving(false));
  };

  // Saved on its own rather than through basePayload(): a file cannot go in the
  // JSON body, and routing it through the base save would mean the publish
  // path had two shapes again — the exact thing 41824f9 fixed.
  const pickOgImage = (file) => {
    if (!file || isNew) return;
    setOgBusy(true); setError('');
    setProductOgImage(id, file)
      .then(p => setOgImageUrl(p.og_image_url || ''))
      .catch(err => setError(errMsg(err, 'Could not upload the share image.')))
      .finally(() => setOgBusy(false));
  };

  const removeOgImage = () => {
    setOgBusy(true); setError('');
    clearProductOgImage(id)
      .then(() => setOgImageUrl(''))
      .catch(err => setError(errMsg(err, 'Could not remove the share image.')))
      .finally(() => setOgBusy(false));
  };

  // What the storefront would actually render for this product right now,
  // built by the same functions the page uses.
  const seoPreview = effectiveProductSeo({
    name: form.name,
    category_name: mainCategories.find(c => c.id === Number(form.category))?.name || '',
    fabric_details: form.fabric_details,
    moq: form.moq,
    meta_title: form.meta_title,
    meta_description: form.meta_description,
  });
  const seoOverrides = [form.meta_title, form.meta_description].filter(v => v.trim()).length;

  const stepIndex = STEPS.findIndex(s => s.key === step);
  const gotoStep  = (key) => { if (!isNew || key === 'base') setStep(key); };

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader className="animate-spin" /></div>;

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <button onClick={() => navigate('/admin/products')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 mb-4">
        <ArrowLeft size={16} /> Back to products
      </button>

      <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100 mb-1">
        {isNew ? 'Upload New Product' : (form.name || 'Edit Product')}
      </h1>
      <p className="text-gray-500 dark:text-zinc-400 text-sm mb-6">
        {isNew ? 'Start with the basics — the next steps unlock once you save.' : 'Edit any step. Changes save per step.'}
      </p>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm rounded-xl px-4 py-3 mb-5">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-[240px_1fr] gap-6">
        {/* ── Left rail: Upload Progress ── */}
        <aside className="lg:sticky lg:top-6 self-start">
          <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-3 lg:p-4">
            <p className="hidden lg:block text-xs font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 px-2 mb-3">Upload Progress</p>
            {/* A scrollable strip on phones, the usual vertical rail from lg up. */}
            <nav className="flex lg:block gap-1 lg:space-y-1 overflow-x-auto -mx-1 px-1 lg:mx-0 lg:px-0 lg:overflow-visible">
              {STEPS.map((s, i) => {
                const locked  = isNew && s.key !== 'base';
                const current = s.key === step;
                const done    = !isNew && i < stepIndex;
                return (
                  <button key={s.key} onClick={() => gotoStep(s.key)} disabled={locked}
                    className={`shrink-0 lg:w-full flex items-center gap-2 lg:gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors text-left whitespace-nowrap ${
                      current ? 'bg-accent/10 text-accent'
                      : locked ? 'text-gray-300 dark:text-zinc-600 cursor-not-allowed'
                      : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                      done ? 'bg-green-100 dark:bg-green-500/15 text-green-600 dark:text-green-400'
                      : current ? 'bg-accent text-white' : 'bg-gray-100 dark:bg-white/5'}`}>
                      {locked ? <Lock size={12} /> : done ? <Check size={13} /> : <s.icon size={13} />}
                    </span>
                    {/* Only the step you are on is labelled on a phone — four
                        labels side by side would not fit. */}
                    <span className={current ? '' : 'hidden lg:inline'}>{s.label}</span>
                  </button>
                );
              })}
            </nav>

            {!isNew && (
              <div className="mt-3 pt-3 lg:mt-4 lg:pt-4 border-t border-gray-100 dark:border-white/5 grid grid-cols-2 lg:grid-cols-1 gap-2">
                <button onClick={() => publish(false)} disabled={saving} className={`${btnGhost} w-full justify-center`}>
                  Save as Draft
                </button>
                <button onClick={() => publish(true)} disabled={saving} className={`${btnPrimary} w-full justify-center`}>
                  {saving ? <Loader size={16} className="animate-spin" /> : <Check size={16} />} Publish
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ── Right pane ── */}
        <section className="min-w-0">
          {step === 'base' && (
            <div className={card}>
              <h2 className="text-lg font-black text-gray-900 dark:text-zinc-100 mb-5">Base Details</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Product name *</label>
                  <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Urban Rise Track Pant" />
                </div>
                <div>
                  <label className={labelCls}>Product code</label>
                  {/* Upper-cased as you type: this becomes the SKU prefix, and
                      SKUs are upper case everywhere else in the catalogue. */}
                  <input className={inputCls} value={form.code}
                         onChange={e => set('code', e.target.value.toUpperCase())}
                         placeholder="e.g. PJ100" />
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1.5">
                    Used to build SKUs{form.code.trim()
                      ? <> — e.g. <span className="font-semibold text-gray-600 dark:text-zinc-300">{skuPreview(form.code)}</span></>
                      : '. Falls back to the product name if left blank.'}
                  </p>
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
              </div>

              <SeoSection
                open={seoOpen}
                onToggle={() => setSeoOpen(o => !o)}
                overridden={seoOverrides}
                subtitle="How this product appears in Google and when shared. Optional — leave blank and it is written for you."
              >
                <div>
                  <FieldHeader label="Meta title" value={form.meta_title} max={META_TITLE_MAX} soft={55} />
                  <input className={inputCls} value={form.meta_title} maxLength={META_TITLE_MAX}
                         onChange={e => set('meta_title', e.target.value)}
                         placeholder={seoPreview.generatedTitle ? 'Generated — type here to override' : ''} />
                </div>

                <div>
                  <FieldHeader label="Meta description" value={form.meta_description} max={META_DESCRIPTION_MAX} soft={140} />
                  <textarea rows={3} className={inputCls} value={form.meta_description} maxLength={META_DESCRIPTION_MAX}
                            onChange={e => set('meta_description', e.target.value)}
                            placeholder={seoPreview.generatedDescription ? 'Generated — type here to override' : ''} />
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1.5">
                    Aim for 140–160 characters. Shorter gets padded by Google, longer gets cut.
                  </p>
                </div>

                <div>
                  <label className={labelCls}>Share image</label>
                  {isNew ? (
                    <p className="text-xs text-gray-400 dark:text-zinc-500">
                      Save the product first, then a share image can be uploaded.
                    </p>
                  ) : (
                    <div className="flex items-start gap-3 flex-wrap">
                      {ogImageUrl && (
                        <img src={ogImageUrl} alt="Share image preview"
                             className="w-40 h-[84px] object-cover rounded-xl border border-gray-200 dark:border-white/10" />
                      )}
                      <div className="flex items-center gap-2">
                        <label className={`${btnGhost} cursor-pointer`}>
                          {ogBusy ? <Loader size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                          {ogImageUrl ? 'Replace' : 'Upload'}
                          <input type="file" accept="image/*" className="hidden" disabled={ogBusy}
                                 onChange={e => { pickOgImage(e.target.files?.[0]); e.target.value = ''; }} />
                        </label>
                        {ogImageUrl && (
                          <button type="button" onClick={removeOgImage} disabled={ogBusy}
                                  className="p-2.5 text-gray-400 hover:text-red-500 disabled:opacity-50">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1.5">
                    Shown when the product link is sent on WhatsApp. 1200×630 works best.
                    Blank falls back to the cover image.
                  </p>
                </div>

                <GooglePreview
                  url={`${SITE_URL.replace(/^https?:\/\//, '')}/product/${slug || 'product-name'}`}
                  title={seoPreview.title}
                  description={seoPreview.description}
                  generatedTitle={seoPreview.generatedTitle}
                  generatedDescription={seoPreview.generatedDescription}
                />
              </SeoSection>

              <div className="mt-6 flex items-center justify-between gap-3">
                <button onClick={() => navigate('/admin/products')} className={btnGhost}>Cancel</button>
                <div className="flex items-center gap-3">
                  {baseDirty && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                      <AlertCircle size={14} /> Unsaved changes
                    </span>
                  )}
                  <button onClick={() => saveBase(true)} disabled={saving || !form.name} className={btnPrimary}>
                    {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                    {isNew ? 'Save & Continue' : 'Save & Next'} <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'images' && (
            <div className={card}>
              <h2 className="text-lg font-black text-gray-900 dark:text-zinc-100 mb-1">Images</h2>
              <p className="text-sm text-gray-400 dark:text-zinc-500 mb-5">Upload once into the library, then click to choose. Reuse anywhere without re-uploading.</p>
              <div className="space-y-6">
                <div>
                  <label className={labelCls}>Cover image (shown first to buyers)</label>
                  <MediaPicker type="product" id={Number(id)} role="primary" single folder="products" label="cover image"
                    categoryId={Number(form.category) || null} />
                </div>
                <div>
                  <label className={labelCls}>Gallery (drag, or use the arrows on a phone, to reorder)</label>
                  <MediaPicker type="product" id={Number(id)} role="gallery" folder="products/gallery" label="gallery images"
                    categoryId={Number(form.category) || null} />
                </div>
              </div>
              <div className="mt-6 flex justify-between">
                <button onClick={() => setStep('base')} className={btnGhost}><ArrowLeft size={16} /> Back</button>
                <button onClick={() => setStep('variants')} className={btnPrimary}>Next <ArrowRight size={16} /></button>
              </div>
            </div>
          )}

          {step === 'variants' && (
            <div className={card}>
              <h2 className="text-lg font-black text-gray-900 dark:text-zinc-100 mb-1">Variants & Pricing</h2>
              <p className="text-sm text-gray-400 dark:text-zinc-500 mb-5">Add each size-set / colour combination with its price, stock and images.</p>
              <VariantsEditor
                productId={Number(id)} productName={form.name} productCode={form.code}
                colors={colors} sizeSets={sizeSets}
                categoryId={Number(form.category) || null}
                variations={variations} onChange={setVariations}
                onColorsChange={setColors} onSizeSetsChange={setSizeSets} />
              <div className="mt-6 flex justify-between">
                <button onClick={() => setStep('images')} className={btnGhost}><ArrowLeft size={16} /> Back</button>
                <button onClick={() => setStep('review')} className={btnPrimary}>Next <ArrowRight size={16} /></button>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className={card}>
              <h2 className="text-lg font-black text-gray-900 dark:text-zinc-100 mb-5">Review & Publish</h2>
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <Row label="Name" value={form.name} />
                <Row label="Category" value={mainCategories.find(c => c.id === Number(form.category))?.name || '—'} />
                <Row label="MOQ" value={form.moq} />
                <Row label="Variants" value={`${variations.length}`} />
                <Row label="Status" value={form.is_active ? 'Active (live)' : 'Draft (hidden)'} />
              </dl>
              {!variations.length && (
                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm rounded-xl px-4 py-3 mt-5">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" /> No variants yet — buyers won't be able to order. Add at least one in the previous step.
                </div>
              )}
              <div className="mt-6 flex flex-wrap justify-between gap-3">
                <button onClick={() => setStep('variants')} className={btnGhost}><ArrowLeft size={16} /> Back</button>
                <div className="flex gap-2">
                  <button onClick={() => publish(false)} disabled={saving} className={btnGhost}>Save as Draft</button>
                  <button onClick={() => publish(true)} disabled={saving} className={btnPrimary}>
                    {saving ? <Loader size={16} className="animate-spin" /> : <Check size={16} />} Publish
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const Row = ({ label, value }) => (
  <div>
    <dt className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-zinc-500">{label}</dt>
    <dd className="text-gray-900 dark:text-zinc-100 font-semibold mt-0.5">{value || '—'}</dd>
  </div>
);

// ── Variants editor ──────────────────────────────────────────────────────────
function VariantsEditor({ productId, productName, productCode, colors, sizeSets, categoryId, variations, onChange, onColorsChange, onSizeSetsChange }) {
  const [adding, setAdding]   = useState(false);
  const [bulk, setBulk]       = useState(false);
  // Which row has a panel open, and which one: { id, kind: 'edit' | 'images' }.
  // One at a time — the builder already prices a whole grid at once, and two
  // half-filled forms open on different rows is how the wrong one gets saved.
  const [panel, setPanel]     = useState(null);
  const [note, setNote]       = useState('');
  // The builder opens these modals through its own "+ New" buttons.
  const [colorModal, setColorModal] = useState(false);
  const [sizeModal, setSizeModal]   = useState(false);

  const remove = (vid) => {
    if (!window.confirm('Delete this variant?')) return;
    deleteVariation(vid).then(() => onChange(variations.filter(v => v.id !== vid)));
  };

  const openPanel = (id, kind) =>
    setPanel(p => (p?.id === id && p.kind === kind ? null : { id, kind }));

  // The server returns the saved row, including the recalculated set total and
  // any regenerated SKU — so the summary line updates from what was actually
  // stored rather than from what was typed.
  const replaceVariant = (saved) => {
    onChange(variations.map(v => (v.id === saved.id ? saved : v)));
    setPanel(null);
    setNote(`Saved ${saved.sku}`);
  };

  return (
    <div>
      {variations.length > 0 && (
        <div className="space-y-2 mb-4">
          {variations.map(v => (
            <div key={v.id} className="border border-gray-100 dark:border-white/5 rounded-xl overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                <span className="w-8 h-8 rounded-full border border-gray-200 dark:border-white/10 shrink-0"
                      style={{ background: colors.find(c => c.name === (v.color_name || v.color))?.hex_code || '#e5e7eb' }} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 dark:text-zinc-100 truncate">{v.sku}</p>
                  {/* The meta line wraps on a phone rather than being clipped. */}
                  <p className="text-xs text-gray-500 dark:text-zinc-400 sm:truncate">
                    {(v.color_name || v.color || 'No colour')} · {v.size_name || 'No size'} · ₹{v.per_piece_price ?? '—'}/pc · set ₹{v.b2b_price ?? '—'} · stock {v.stock_quantity}
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  <button onClick={() => { setNote(''); openPanel(v.id, 'edit'); }}
                    className="inline-flex items-center gap-1 px-2 py-2 text-xs font-semibold text-accent hover:underline">
                    <Pencil size={14} /> Edit {panel?.id === v.id && panel.kind === 'edit' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button onClick={() => openPanel(v.id, 'images')}
                    className="inline-flex items-center gap-1 px-2 py-2 text-xs font-semibold text-accent hover:underline">
                    <ImageIcon size={14} /> Images {panel?.id === v.id && panel.kind === 'images' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button onClick={() => remove(v.id)} aria-label="Delete variant"
                    className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              </div>
              {panel?.id === v.id && panel.kind === 'edit' && (
                <div className="px-3 pb-3 pt-3 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02]">
                  {/* Keyed on the row so switching rows remounts the form with
                      that variant's values instead of carrying the last one's
                      edits across. */}
                  <VariantForm
                    key={v.id}
                    variation={v}
                    productId={productId} productCode={productCode}
                    colors={colors} sizeSets={sizeSets}
                    onColorsChange={onColorsChange} onSizeSetsChange={onSizeSetsChange}
                    onCancel={() => setPanel(null)}
                    onSaved={replaceVariant} />
                </div>
              )}
              {panel?.id === v.id && panel.kind === 'images' && (
                <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02]">
                  <p className="text-xs text-gray-400 dark:text-zinc-500 my-2">Images for this colour/variant:</p>
                  <MediaPicker type="variation" id={v.id} role="gallery" folder="variations/gallery" label="variant images"
                    categoryId={categoryId} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {note && (
        <p className="text-sm font-semibold text-green-700 dark:text-green-400 mb-3">{note}</p>
      )}

      {bulk ? (
        <BulkVariantBuilder
          productId={productId} productName={productName} categoryId={categoryId}
          colors={colors} sizeSets={sizeSets}
          onAddColor={() => setColorModal(true)}
          onAddSizeSet={() => setSizeModal(true)}
          onCancel={() => setBulk(false)}
          onCreated={(created, skipped) => {
            onChange([...variations, ...created]);
            setBulk(false);
            setNote(
              `Created ${created.length} variant${created.length !== 1 ? 's' : ''}`
              + (skipped.length ? ` · ${skipped.length} already existed and were skipped` : '')
            );
          }} />
      ) : adding ? (
        <VariantForm
          productId={productId} productCode={productCode} colors={colors} sizeSets={sizeSets}
          onColorsChange={onColorsChange} onSizeSetsChange={onSizeSetsChange}
          onCancel={() => setAdding(false)}
          onSaved={(v) => { onChange([...variations, v]); setAdding(false); }} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setNote(''); setBulk(true); }} className={btnPrimary}>
            <Layers size={16} /> Build all variants
          </button>
          <button onClick={() => { setNote(''); setAdding(true); }} className={btnGhost}>
            <Plus size={16} /> Add one variant
          </button>
        </div>
      )}

      {colorModal && (
        <AddColorModal onClose={() => setColorModal(false)}
          onCreated={(c) => {
            onColorsChange(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
            setColorModal(false);
          }} />
      )}
      {sizeModal && (
        <CreateSizeSetModal onClose={() => setSizeModal(false)}
          onCreated={(ss) => { onSizeSetsChange(prev => [...prev, ss]); setSizeModal(false); }} />
      )}
    </div>
  );
}

/**
 * One variant's details — used both to add a new one and to edit an existing
 * one in place.
 *
 * Pass `variation` to edit: the fields prefill from it and saving PATCHes that
 * row instead of creating another. One form for both because the fields are the
 * same fields, and a separate edit form is how the two drift until only one of
 * them knows that the set total is derived.
 *
 * Editing matters because the bulk builder deliberately gives every
 * combination the same price and stock. That is the right way to start a
 * product and the wrong way to leave it: stock moves per colour, and a size set
 * that costs more to cut is priced per row.
 */
function VariantForm({ productId, productCode, colors, sizeSets, variation = null,
                       onColorsChange, onSizeSetsChange, onCancel, onSaved }) {
  const editing = variation !== null;
  const [v, setV] = useState(() => ({
    size_set:        variation?.size_set ?? '',
    size_breakdown:  variation?.size_breakdown ?? '',
    color_palette:   variation?.color_palette ?? '',
    sku:             variation?.sku ?? '',
    per_piece_price: variation?.per_piece_price ?? '',
    mrp_per_piece:   variation?.mrp_per_piece ?? '',
    stock_quantity:  variation?.stock_quantity ?? 0,
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [colorModal, setColorModal] = useState(false);
  const [sizeModal, setSizeModal] = useState(false);
  const set = (k, val) => setV(s => ({ ...s, [k]: val }));

  const breakdowns = sizeSets.find(s => s.id === Number(v.size_set))?.breakdowns || [];

  // What the server will generate if the SKU is left blank. Only shown once a
  // code exists — without one the server falls back to the slug, which the
  // panel does not hold, and a wrong preview is worse than none.
  const autoSku = productCode
    ? buildSku(
        productCode,
        colors.find(c => c.id === Number(v.color_palette))?.name,
        sizeSets.find(s => s.id === Number(v.size_set))?.name,
        breakdowns.find(b => b.id === Number(v.size_breakdown))?.pieces,
      )
    : '';

  const save = () => {
    setSaving(true); setErr('');
    const payload = {
      size_set: v.size_set || null,
      size_breakdown: v.size_breakdown || null,
      color_palette: v.color_palette || null,
      sku: v.sku,
      per_piece_price: v.per_piece_price || null,
      mrp_per_piece: v.mrp_per_piece || null,
      stock_quantity: Number(v.stock_quantity) || 0,
    };
    const request = editing
      ? updateVariation(variation.id, payload)
      : createVariation({ product: productId, ...payload });

    request.then(onSaved).catch(e => {
      const d = e.response?.data;
      setErr(d ? Object.entries(d).map(([k, val]) => `${k}: ${val}`).join(' • ') : 'Failed to save variant.');
    }).finally(() => setSaving(false));
  };

  return (
    // Editing renders inside the row's own panel, which already has a border
    // and a tint — repeating them boxes the form inside a box.
    <div className={editing ? '' : 'border border-gray-200 dark:border-white/10 rounded-2xl p-4 bg-gray-50/50 dark:bg-white/[0.02]'}>
      {err && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{err}</p>}
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>SKU</label>
          {/* Generated by the server from code, colour, size set and pieces.
              Typing here overrides it for this one variant. */}
          <input className={inputCls} value={v.sku} onChange={e => set('sku', e.target.value.toUpperCase())}
                 placeholder={autoSku || 'Generated automatically'} />
          {editing && (
            // A variant recoloured but still called ..._BLACK_... is a picking
            // error waiting to happen, and the admin has no other way to ask
            // for a fresh one.
            <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-1">
              Clear it to rebuild from the colour and size set{autoSku ? ` — ${autoSku}` : ''}
            </p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className={labelCls}>Size set</label>
            <button type="button" onClick={() => setSizeModal(true)} className="text-xs font-bold text-accent hover:underline mb-1.5">+ New</button>
          </div>
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
          <div className="flex items-center justify-between">
            <label className={labelCls}>Colour</label>
            <button type="button" onClick={() => setColorModal(true)} className="text-xs font-bold text-accent hover:underline mb-1.5">+ New</button>
          </div>
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
      <SetPriceSummary perPiece={v.per_piece_price} mrpPerPiece={v.mrp_per_piece}
                       pieces={breakdowns.find(b => b.id === Number(v.size_breakdown))?.pieces} />
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onCancel} className={btnGhost}>Cancel</button>
        {/* A new variant must be priced. An existing one need not be re-priced
            to correct its stock — and variants predating the per-piece rule
            carry a set total with no per-piece figure, so demanding one would
            lock them out of every other edit. */}
        <button onClick={save}
          disabled={saving || (!v.per_piece_price && !(editing && variation.b2b_price))}
          className={btnPrimary}>
          {saving ? <Loader size={15} className="animate-spin" /> : <Check size={15} />}
          {editing ? 'Save changes' : 'Save variant'}
        </button>
      </div>

      {colorModal && (
        <AddColorModal onClose={() => setColorModal(false)}
          onCreated={(c) => { onColorsChange(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name))); set('color_palette', c.id); setColorModal(false); }} />
      )}
      {sizeModal && (
        <CreateSizeSetModal onClose={() => setSizeModal(false)}
          onCreated={(ss) => { onSizeSetsChange(prev => [...prev, ss]); set('size_set', ss.id); setSizeModal(false); }} />
      )}
    </div>
  );
}

// ── Add colour modal ─────────────────────────────────────────────────────────
function AddColorModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [hex, setHex]   = useState('#cccccc');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const save = () => {
    setSaving(true); setErr('');
    createColor({ name: name.trim(), hex_code: hex })
      .then(onCreated).catch(() => { setErr('Could not add colour (name may already exist).'); setSaving(false); });
  };
  return (
    <ModalShell title="Add colour" onClose={onClose}>
      {err && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{err}</p>}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className={labelCls}>Colour name</label>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Beige" />
        </div>
        <div>
          <label className={labelCls}>Swatch</label>
          <input type="color" value={hex} onChange={e => setHex(e.target.value)}
            className="w-12 h-11 rounded-xl border border-gray-200 dark:border-white/10 bg-transparent cursor-pointer" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button onClick={save} disabled={saving || !name.trim()} className={btnPrimary}>
          {saving ? <Loader size={15} className="animate-spin" /> : <Check size={15} />} Add
        </button>
      </div>
    </ModalShell>
  );
}

// ── Create size set modal (bijnis "Custom Size Set") ─────────────────────────
//
// Same builder as the Size Sets page: pick the two ends of the range, tick the
// sizes, and the breakdown string, article count and name all follow.
function CreateSizeSetModal({ onClose, onCreated }) {
  const [name, setName]     = useState('');
  const [touched, setTouch] = useState(false);
  const [built, setBuilt]   = useState({ breakdownString: '', pieces: 0, suggestedName: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const effectiveName = touched ? name : built.suggestedName;
  const canSave       = effectiveName.trim() && built.pieces > 0;

  const save = () => {
    if (!canSave) return;
    setSaving(true); setErr('');
    createSizeSet({
      name: effectiveName.trim(),
      breakdowns: [{
        label: built.breakdownString,
        breakdown_string: built.breakdownString,
        pieces: built.pieces,
      }],
    }).then(onCreated).catch(e => {
      const d = e.response?.data;
      setErr(d?.name ? `Name: ${[].concat(d.name).join(' ')}`
             : d ? JSON.stringify(d) : 'Could not create size set.');
      setSaving(false);
    });
  };

  return (
    <ModalShell title="Create custom size set" onClose={onClose}>
      {err && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{err}</p>}
      <SizeRangeBuilder onChange={setBuilt} />
      <div className="mt-4">
        <label className={labelCls}>Size set name</label>
        <input className={inputCls} value={effectiveName}
               onChange={e => { setTouch(true); setName(e.target.value); }}
               placeholder="Named from the range — edit if you want something else" />
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button onClick={save} disabled={saving || !canSave} className={btnPrimary}>
          {saving ? <Loader size={15} className="animate-spin" /> : <Check size={15} />} Create size set
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      {/* Capped and scrollable so a phone keyboard can never push the buttons off-screen. */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black text-gray-900 dark:text-zinc-100">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
