import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  ShoppingCart, PackageCheck, Loader, AlertCircle, CheckCircle2,
  Tag, ReceiptText, Plus, Minus, Trash2,
  Truck, CreditCard, Building, ShieldCheck, Smartphone,
  X, Lock, Unlock, ChevronDown, ChevronUp, Copy, Check,
  Upload, Hash, Clock, Pencil, Info, Package,
} from 'lucide-react';
import api from '../api/axios';
import ResponsiveImage from '../components/shared/ResponsiveImage';
import { useCartStore } from '../store/useCartStore';
import { useAuthStore } from '../store/useAuthStore';
import Seo from '../components/seo/Seo';

const UPI_ID        = 'pronoun@kotak';
const BUSINESS_NAME = 'Pronoun Jeans';
const SHIPPING_FEE  = 300;
const FREE_SHIPPING_THRESHOLD = 15000;
const SELLER_GSTIN  = '24AEXPJ4984P1ZD';
const SELLER_NAME   = 'M. SANKLECHA CREATION';

const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const s  = document.createElement('script');
    s.src    = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

const calcGST = (subtotal, couponPct = 0, upiDiscPct = 0) => {
  const r2           = (n) => Math.round(n * 100) / 100;
  const productTotal = r2(subtotal);
  const base         = r2(productTotal * 0.95);
  const couponDisc   = r2(base * couponPct);
  const prepaidDisc  = r2(base * upiDiscPct);
  const totalDisc    = r2(couponDisc + prepaidDisc);
  const taxableAmount = r2(productTotal - totalDisc);
  const gst          = r2(taxableAmount * 5 / 105);
  const shipping     = taxableAmount < FREE_SHIPPING_THRESHOLD ? SHIPPING_FEE : 0;
  const grandTotal   = r2(taxableAmount + shipping);
  return { productTotal, base, couponDisc, prepaidDisc, totalDisc, taxableAmount, gst, shipping, grandTotal };
};

const fmt         = (n) => parseFloat(n || 0).toFixed(2);
const buildUpiUri = (amount, note = 'B2B Order') =>
  `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(BUSINESS_NAME)}&am=${fmt(amount)}&cu=INR&tn=${encodeURIComponent(note)}`;

// ── Set Breakdown Tooltip ─────────────────────────────────────────────────────

const SetBreakdownTooltip = ({ breakdown }) => {
  const [visible, setVisible] = useState(false);
  if (!breakdown) return null;
  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="text-gray-400 hover:text-accent transition-colors focus:outline-none"
        tabIndex={0}
        aria-label="Set size breakdown"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-max max-w-[220px]">
          <div className="bg-gray-900 dark:bg-zinc-700 text-white text-xs font-medium px-3 py-2 rounded-xl shadow-xl leading-relaxed">
            <p className="text-white/60 text-[10px] uppercase tracking-widest mb-0.5">Size Breakdown</p>
            {breakdown}
          </div>
          <div className="w-2 h-2 bg-gray-900 dark:bg-zinc-700 rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </span>
  );
};

// ── GST Seller Block ──────────────────────────────────────────────────────────

const GSTSellerBlock = () => (
  <div className="bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-white/5 rounded-xl px-4 py-3 space-y-1">
    <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 text-xs font-bold mb-1">
      <CheckCircle2 className="w-3.5 h-3.5" /> GST Invoice Available
    </div>
    <p className="text-gray-500 dark:text-zinc-400 text-xs">
      <span className="font-semibold text-gray-700 dark:text-zinc-300">Seller: </span>{SELLER_NAME}
    </p>
    <p className="text-gray-500 dark:text-zinc-400 text-xs">
      <span className="font-semibold text-gray-700 dark:text-zinc-300">GSTIN: </span>
      <span className="font-mono">{SELLER_GSTIN}</span>
    </p>
  </div>
);

const ColorSwatch = ({ hex, name }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-white/20 shrink-0"
      style={{ backgroundColor: hex || '#CCCCCC' }} title={name} />
    <span>{name}</span>
  </span>
);

const Toast = ({ message, type = 'success', onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [onDone]);
  const styles = type === 'success'
    ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400'
    : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400';
  const Icon = type === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl border text-sm font-semibold shadow-2xl ${styles}`}
      style={{ animation: 'slideUp .25s ease' }}>
      <Icon className="w-4 h-4 shrink-0" />{message}
    </div>
  );
};

const QtyControl = ({ value, saving, onDecrement, onIncrement, onDirectChange }) => (
  <div className="flex items-center rounded-xl overflow-hidden border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-900 w-fit">
    <button onClick={onDecrement} disabled={saving || value <= 1}
      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
      <Minus className="w-3.5 h-3.5" />
    </button>
    <div className="relative w-12 h-8 flex items-center justify-center border-x border-gray-200 dark:border-white/10">
      {saving ? <Loader className="animate-spin w-3.5 h-3.5 text-accent" /> : (
        <input type="number" min={1} value={value}
          onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 1) onDirectChange(v); }}
          className="w-full h-full text-center text-gray-900 dark:text-zinc-100 text-sm font-bold bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
      )}
    </div>
    <button onClick={onIncrement} disabled={saving}
      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
      <Plus className="w-3.5 h-3.5" />
    </button>
  </div>
);

const useQtyUpdate = (showToast, fetchCart) => {
  const timerRef    = useRef({});
  const abortRef    = useRef({});
  const rollbackRef = useRef({});
  const mountedRef  = useRef(true);
  const [saving, setSaving] = useState({});

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Object.values(timerRef.current).forEach(clearTimeout);
      Object.values(abortRef.current).forEach(ctrl => ctrl.abort());
    };
  }, []);

  const scheduleUpdate = useCallback((cartItemId, newQty, rollbackFn) => {
    // Keep only the FIRST rollback in a debounce sequence (pre-debounce server state)
    if (!rollbackRef.current[cartItemId]) {
      rollbackRef.current[cartItemId] = rollbackFn;
    }
    clearTimeout(timerRef.current[cartItemId]);
    abortRef.current[cartItemId]?.abort();
    delete abortRef.current[cartItemId];

    timerRef.current[cartItemId] = setTimeout(async () => {
      if (!mountedRef.current) return;
      const ctrl     = new AbortController();
      abortRef.current[cartItemId] = ctrl;
      const rollback = rollbackRef.current[cartItemId];
      delete rollbackRef.current[cartItemId];

      setSaving(s => ({ ...s, [cartItemId]: true }));
      try {
        await api.patch(
          `orders/cart/items/${cartItemId}/`,
          { quantity: newQty },
          { signal: ctrl.signal },
        );
        if (mountedRef.current) fetchCart();
      } catch (err) {
        if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
        if (mountedRef.current) {
          rollback?.();
          showToast(err.response?.data?.error || 'Failed to update quantity.', 'error');
        }
      } finally {
        if (mountedRef.current) setSaving(s => ({ ...s, [cartItemId]: false }));
      }
    }, 600);
  }, [showToast, fetchCart]);

  return { saving, scheduleUpdate };
};

// ── Product Image Thumbnail ───────────────────────────────────────────────────

const ProductThumb = ({ src, alt, className = '' }) => {
  const [errored, setErrored] = useState(false);
  if (src && !errored) {
    return (
      // Rendered at 56-64px, so ask the CDN for a 200px AVIF/WebP rather than
      // pulling the full-size original for every line in the cart.
      <ResponsiveImage
        src={src}
        alt={alt || ''}
        widths={[200, 400]}
        sizes="64px"
        onError={() => setErrored(true)}
        className={`object-cover ${className}`}
      />
    );
  }
  return (
    <div className={`flex items-center justify-center bg-gray-100 dark:bg-zinc-800 ${className}`}>
      <Package className="w-5 h-5 text-gray-300 dark:text-zinc-600" />
    </div>
  );
};

// ── Cart Row ──────────────────────────────────────────────────────────────────

const CartRow = ({ item, index, onQtyChange, saving }) => {
  const { id, variation, quantity, unavailable } = item;
  const price = parseFloat(variation?.b2b_price ?? 0);
  const thumb = variation?.display_image ?? null;

  if (unavailable) {
    return (
      <tr className="border-b border-gray-100 dark:border-white/5 bg-red-50/40 dark:bg-red-500/5">
        <td className="px-6 py-4" colSpan={6}>
          <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-sm font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            This SKU has been removed from the catalog and is no longer available.
          </div>
        </td>
        <td className="px-6 py-4">
          <button onClick={() => onQtyChange(id, 0)} className="text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`border-b border-gray-100 dark:border-white/5 ${index % 2 === 0 ? 'bg-gray-50/50 dark:bg-white/[0.015]' : 'bg-white dark:bg-transparent'}`}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <ProductThumb
            src={thumb}
            alt={variation?.product_name}
            className="w-14 h-14 rounded-xl shrink-0 border border-gray-100 dark:border-white/5"
          />
          <div>
            <div className="flex items-center gap-1">
              <p className="text-gray-900 dark:text-zinc-100 font-semibold text-sm leading-snug max-w-[200px]">
                {variation?.product_name ?? '—'}
              </p>
              <SetBreakdownTooltip breakdown={variation?.set_breakdown} />
            </div>
            <p className="text-gray-400 dark:text-zinc-500 text-xs font-mono mt-0.5">{variation?.sku ?? ''}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-gray-600 dark:text-zinc-300 text-sm">{variation?.size ?? '—'}</td>
      <td className="px-6 py-4 text-sm">
        <ColorSwatch hex={variation?.color_hex || '#CCCCCC'} name={variation?.color_name || variation?.color || '—'} />
      </td>
      <td className="px-6 py-4 text-accent font-bold text-sm whitespace-nowrap">₹{price.toFixed(2)}</td>
      <td className="px-6 py-4">
        <QtyControl value={quantity} saving={!!saving[id]}
          onDecrement={() => onQtyChange(id, quantity - 1)}
          onIncrement={() => onQtyChange(id, quantity + 1)}
          onDirectChange={(v) => onQtyChange(id, v)} />
      </td>
      <td className="px-6 py-4 text-gray-900 dark:text-zinc-100 font-bold text-sm whitespace-nowrap">
        ₹{(price * quantity).toFixed(2)}
      </td>
      <td className="px-6 py-4">
        <button onClick={() => onQtyChange(id, 0)} className="text-gray-400 hover:text-red-500 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
};

// ── Address Form ──────────────────────────────────────────────────────────────

/** Flatten a DRF error body into one readable line. */
const fieldErrors = (err) => {
  const data = err.response?.data;
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (data.detail) return data.detail;
  return Object.entries(data)
    .map(([field, msgs]) => `${field.replace(/_/g, ' ')}: ${[].concat(msgs).join(' ')}`)
    .join(' • ');
};


const EMPTY_ADDR = {
  address_line_1: '', address_line_2: '', city: '', state: '',
  pincode: '', contact_phone: '', contact_email: '',
  is_default_shipping: false, is_default_billing: false,
};

const AddressForm = ({ initial = EMPTY_ADDR, editId = null, onSaved, onCancel }) => {
  const [form, setForm]     = useState({ ...EMPTY_ADDR, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const handleSave = async () => {
    if (!form.address_line_1 || !form.city || !form.state || !form.pincode
        || !(form.contact_phone || '').trim() || !(form.contact_email || '').trim()) {
      setError('Please fill in all required fields.'); return;
    }
    setSaving(true); setError('');
    try {
      if (editId) await api.put(`accounts/addresses/${editId}/`, form);
      else        await api.post('accounts/addresses/', form);
      onSaved();
    } catch (err) {
      // DRF reports a bad phone or email as {contact_phone: [...]}, not as
      // `detail` — reading only `detail` turned every field error into the
      // same unhelpful "Failed to save address."
      setError(fieldErrors(err) || 'Failed to save address.');
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-accent/30 p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-gray-900 dark:text-zinc-100 font-bold text-sm">{editId ? 'Edit Address' : 'Add New Address'}</h3>
        <button onClick={onCancel}><X className="w-4 h-4 text-gray-400 hover:text-gray-700 dark:hover:text-white" /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: 'Address Line 1 *', key: 'address_line_1' },
          { label: 'Address Line 2',   key: 'address_line_2' },
          { label: 'City *',           key: 'city'           },
          { label: 'State *',          key: 'state'          },
          { label: 'Pincode *',        key: 'pincode'        },
          // Required. In wholesale the delivery contact is routinely not the
          // account holder — goods go to a warehouse with its own manager
          // while the invoice goes to the office — so asking per address is
          // the only way to get a number a courier can actually ring.
          { label: 'Contact Phone *',  key: 'contact_phone', type: 'tel',
            placeholder: 'Who the courier should call' },
          { label: 'Contact Email *',  key: 'contact_email', type: 'email',
            placeholder: 'Where paperwork for this address goes' },
        ].map(({ label, key, type, placeholder }) => (
          <div key={key}>
            <label className="text-gray-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest block mb-1">{label}</label>
            <input value={form[key] || ''} type={type || 'text'} placeholder={placeholder}
              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
              className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-zinc-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent transition-colors" />
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-gray-600 dark:text-zinc-300 text-sm cursor-pointer">
          <input type="checkbox" checked={form.is_default_shipping} onChange={e => setForm(p => ({ ...p, is_default_shipping: e.target.checked }))} className="accent-accent" />
          <Truck className="w-3.5 h-3.5 text-accent" /> Default Shipping
        </label>
        <label className="flex items-center gap-2 text-gray-600 dark:text-zinc-300 text-sm cursor-pointer">
          <input type="checkbox" checked={form.is_default_billing} onChange={e => setForm(p => ({ ...p, is_default_billing: e.target.checked }))} className="accent-accent" />
          <CreditCard className="w-3.5 h-3.5 text-accent" /> Default Billing
        </label>
      </div>
      {error && <p className="text-red-500 text-xs">{error}</p>}
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-zinc-300 font-bold py-2.5 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
          {saving ? <Loader className="animate-spin w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Address'}
        </button>
      </div>
    </div>
  );
};

const AddressCard = ({ addr, selected, onSelect, type, onEdit, onDelete }) => {
  const Icon = type === 'shipping' ? Truck : Building;
  return (
    <div className={`rounded-xl border p-4 transition-all ${selected ? 'border-accent/60 bg-accent/5' : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-900 hover:border-gray-300 dark:hover:border-white/20'}`}>
      <div className="flex items-start justify-between gap-2 mb-2 cursor-pointer" onClick={() => onSelect(addr.id)}>
        <div className="flex items-center gap-2">
          <Icon className={`w-3.5 h-3.5 ${selected ? 'text-accent' : 'text-gray-400'}`} />
          <span className={`text-xs font-bold uppercase tracking-widest ${selected ? 'text-accent' : 'text-gray-500'}`}>
            {type === 'shipping' ? 'Shipping' : 'Billing'}
          </span>
        </div>
        {selected && <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />}
      </div>
      <div className="cursor-pointer" onClick={() => onSelect(addr.id)}>
        <p className="text-gray-900 dark:text-zinc-100 text-sm font-semibold">{addr.address_line_1}</p>
        {addr.address_line_2 && <p className="text-gray-500 text-xs">{addr.address_line_2}</p>}
        <p className="text-gray-500 text-xs">{addr.city}, {addr.state} — {addr.pincode}</p>
        {/* effective_*, so this shows the number a courier would actually ring
            rather than going blank whenever the address has none of its own. */}
        {(addr.effective_phone || addr.effective_email) && (
          <p className="text-gray-400 dark:text-zinc-500 text-xs mt-1">
            {[addr.effective_phone, addr.effective_email].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button onClick={() => onEdit(addr)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-accent transition-colors font-semibold">
          <Pencil className="w-3 h-3" /> Edit
        </button>
        <button onClick={() => onDelete(addr.id)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors font-semibold">
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>
    </div>
  );
};

const AddressSection = ({ type, addresses, selectedId, onSelect, onAddressesUpdated }) => {
  const Icon  = type === 'shipping' ? Truck : Building;
  const label = type === 'shipping' ? 'Shipping Address' : 'Billing Address';
  const [showForm, setShowForm] = useState(false);
  const [editAddr, setEditAddr] = useState(null);

  const openAdd  = () => { setEditAddr(null); setShowForm(true); };
  const openEdit = (addr) => { setEditAddr(addr); setShowForm(true); };
  const handleSaved = async () => {
    setShowForm(false); setEditAddr(null);
    const res = await api.get('accounts/addresses/');
    onAddressesUpdated(res.data ?? []);
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this address?')) return;
    await api.delete(`accounts/addresses/${id}/`);
    const res = await api.get('accounts/addresses/');
    onAddressesUpdated(res.data ?? []);
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-accent" />
          <h2 className="text-gray-900 dark:text-zinc-100 font-bold">{label}</h2>
        </div>
        {!showForm && (
          <button onClick={openAdd}
            className="flex items-center gap-1.5 text-xs font-bold text-accent hover:text-red-700 border border-accent/30 hover:border-accent px-3 py-1.5 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add New
          </button>
        )}
      </div>
      {showForm && (
        <AddressForm initial={editAddr || EMPTY_ADDR} editId={editAddr?.id || null}
          onSaved={handleSaved} onCancel={() => { setShowForm(false); setEditAddr(null); }} />
      )}
      {!showForm && (
        addresses.length === 0 ? (
          <p className="text-gray-500 text-sm">No addresses saved yet. Click "Add New" to add one.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {addresses.map(a => (
              <AddressCard key={a.id} addr={a} type={type} selected={selectedId === a.id}
                onSelect={onSelect} onEdit={openEdit} onDelete={handleDelete} />
            ))}
          </div>
        )
      )}
    </div>
  );
};

const couponLabel = (c) => `${c.discount_value}% Off`;

const AvailableOffers = ({ coupons, subtotal, appliedCoupon, onApply, onRemove }) => {
  const [expanded, setExpanded]           = useState(true);
  const [loading, setLoading]             = useState(null);
  const [manualCode, setManualCode]       = useState('');
  const [manualError, setManualError]     = useState('');
  const [manualLoading, setManualLoading] = useState(false);

  const handleApplyCode = async (code) => {
    setLoading(code);
    try { const res = await api.post('orders/cart/apply-coupon/', { coupon_code: code }); onApply(res.data); }
    catch { /* the coupon simply did not apply; the row resets below */ }
    finally { setLoading(null); }
  };

  const handleManualApply = async () => {
    if (!manualCode.trim()) return;
    setManualLoading(true); setManualError('');
    try {
      const res = await api.post('orders/cart/apply-coupon/', { coupon_code: manualCode.trim() });
      onApply(res.data); setManualCode('');
    } catch (err) {
      setManualError(err.response?.data?.error || 'Invalid coupon code.');
    } finally { setManualLoading(false); }
  };

  return (
    <div className="border-t border-gray-100 dark:border-white/5 pt-4 space-y-3">
      <button onClick={() => setExpanded(e => !e)} className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-accent" />
          <p className="text-gray-900 dark:text-zinc-100 text-sm font-bold">Available Offers</p>
          {coupons.length > 0 && <span className="bg-accent/10 text-accent text-[10px] font-bold px-1.5 py-0.5 rounded-full">{coupons.length}</span>}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {expanded && (
        <div className="space-y-2">
          {appliedCoupon && (
            <div className="flex items-center justify-between bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-green-700 dark:text-green-400 text-sm font-bold">{appliedCoupon.coupon_code}</span>
                <span className="text-green-600 text-xs">−₹{fmt(appliedCoupon.coupon_disc_amount)}</span>
              </div>
              <button onClick={onRemove}><X className="w-4 h-4 text-green-500 hover:text-red-500 transition-colors" /></button>
            </div>
          )}
          {coupons.map(c => {
            const minVal    = parseFloat(c.min_order_value);
            const unlocked  = subtotal >= minVal;
            const shortfall = minVal - subtotal;
            const isApplied = appliedCoupon?.coupon_code === c.code;
            return (
              <div key={c.id} className={`rounded-xl border p-3 ${isApplied ? 'border-green-200 bg-green-50/50' : unlocked ? 'border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-800' : 'border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-zinc-900/50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 flex-1">
                    <div className={`mt-0.5 ${unlocked ? 'text-accent' : 'text-gray-300 dark:text-zinc-600'}`}>
                      {unlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-gray-900 dark:text-zinc-100">{c.code}</span>
                        <span className="text-accent text-xs font-bold">{couponLabel(c)}</span>
                      </div>
                      {!unlocked && <p className="text-yellow-600 text-xs mt-0.5">Add ₹{shortfall.toLocaleString('en-IN', { maximumFractionDigits: 0 })} more to unlock</p>}
                      {unlocked && parseFloat(c.min_order_value) > 0 && <p className="text-gray-400 text-xs mt-0.5">Min order ₹{minVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>}
                    </div>
                  </div>
                  {isApplied ? (
                    <span className="text-green-600 text-xs font-bold">Applied ✓</span>
                  ) : (
                    <button onClick={() => unlocked && handleApplyCode(c.code)}
                      disabled={!unlocked || !!appliedCoupon || loading === c.code}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${unlocked && !appliedCoupon ? 'bg-accent/10 text-accent hover:bg-accent hover:text-white border border-accent/20' : 'text-gray-300 dark:text-zinc-600 cursor-not-allowed'}`}>
                      {loading === c.code ? <Loader className="animate-spin w-3 h-3" /> : 'Apply'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div className="pt-1 space-y-1.5">
            <div className="flex gap-2">
              <input type="text" value={manualCode} onChange={e => setManualCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleManualApply()} placeholder="Enter coupon code"
                className="flex-1 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-zinc-100 placeholder-gray-400 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent" />
              <button onClick={handleManualApply} disabled={manualLoading || !manualCode.trim()}
                className="px-4 py-2 bg-accent hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm">
                {manualLoading ? <Loader className="animate-spin w-4 h-4" /> : 'Apply'}
              </button>
            </div>
            {manualError && <p className="text-red-500 text-xs">{manualError}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

const OrderSummaryCard = ({ items, couponData, upiDiscPct, availableCoupons, onCouponApply, onCouponRemove }) => {
  const subtotal   = items.reduce((s, i) => s + parseFloat(i.variation?.b2b_price ?? 0) * i.quantity, 0);
  const couponPct  = couponData ? parseFloat(couponData.discount_value) / 100 : 0;
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
  const { productTotal, couponDisc, prepaidDisc, totalDisc, taxableAmount, gst, shipping, grandTotal } =
    calcGST(subtotal, couponPct, upiDiscPct);

  if (couponData && couponData.coupon_disc_amount === undefined) couponData.coupon_disc_amount = couponDisc;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 p-6 space-y-4 sticky top-6 shadow-sm">
      <div className="flex items-center gap-2 pb-3 border-b border-gray-100 dark:border-white/5">
        <ReceiptText className="w-5 h-5 text-accent" />
        <h2 className="text-gray-900 dark:text-zinc-100 font-bold text-lg">Order Summary</h2>
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between text-gray-500 dark:text-zinc-400">
          <span>SKU Lines</span><span className="font-semibold text-gray-900 dark:text-zinc-100">{items.length}</span>
        </div>
        <div className="flex justify-between text-gray-500 dark:text-zinc-400">
          <span>Total Units</span><span className="font-semibold text-gray-900 dark:text-zinc-100">{totalUnits}</span>
        </div>
      </div>
      <AvailableOffers coupons={availableCoupons} subtotal={subtotal}
        appliedCoupon={couponData} onApply={onCouponApply} onRemove={onCouponRemove} />
      <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-xl p-3.5 space-y-2.5 text-sm border border-gray-100 dark:border-white/5">
        <div className="flex justify-between text-gray-700 dark:text-zinc-300">
          <span className="font-semibold">Product Total</span><span className="font-semibold">₹{fmt(productTotal)}</span>
        </div>
        {couponDisc > 0 && (
          <div className="flex justify-between text-green-600 dark:text-green-400 font-semibold">
            <span>Coupon Discount</span><span>−₹{fmt(couponDisc)}</span>
          </div>
        )}
        {prepaidDisc > 0 && (
          <div className="flex justify-between text-green-600 dark:text-green-400 font-semibold">
            <span>Prepaid Discount (1%)</span><span>−₹{fmt(prepaidDisc)}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-700 dark:text-zinc-300 border-t border-dashed border-gray-200 dark:border-white/10 pt-2">
          <span className="font-semibold">Taxable Amount</span><span className="font-semibold">₹{fmt(taxableAmount)}</span>
        </div>
        <div className="flex justify-between text-gray-500 dark:text-zinc-400">
          <span>GST 5%</span><span>₹{fmt(gst)}</span>
        </div>
        {shipping > 0 ? (
          <div className="flex justify-between text-orange-600 dark:text-orange-400 font-semibold">
            <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Shipping</span><span>+₹{fmt(shipping)}</span>
          </div>
        ) : (
          <div className="flex justify-between text-green-600 dark:text-green-400 font-semibold">
            <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Shipping</span><span>FREE</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between bg-accent/10 border border-accent/20 rounded-xl px-4 py-3">
        <span className="text-accent font-bold text-sm uppercase tracking-widest">Grand Total</span>
        <span className="text-gray-900 dark:text-zinc-100 font-extrabold text-xl">₹{fmt(grandTotal)}</span>
      </div>
      {shipping === 0 && <p className="text-green-600 dark:text-green-400 text-xs text-center font-semibold">🚚 Free shipping on orders above ₹15,000!</p>}
      {shipping > 0 && <p className="text-orange-600 dark:text-orange-400 text-xs text-center">Add ₹{fmt(FREE_SHIPPING_THRESHOLD - taxableAmount)} more for free shipping</p>}
      {totalDisc > 0 && <p className="text-green-600 dark:text-green-400 text-xs text-center font-semibold">You save ₹{fmt(totalDisc)} on this order 🎉</p>}
      <GSTSellerBlock />
    </div>
  );
};

const PROOF_OPTIONS = [
  { key: 'utr',        icon: Hash,   label: 'Enter UTR',          sub: 'Enter your 12-digit transaction ID'       },
  { key: 'screenshot', icon: Upload, label: 'Upload Screenshot',  sub: 'Upload payment success screen image'      },
  { key: 'none',       icon: Clock,  label: 'Submit Proof Later', sub: 'Manual verification — takes up to 24 hrs' },
];

const ProofSelector = ({ proofType, setProofType, utrNumber, setUtrNumber, screenshotFile, setScreenshotFile }) => {
  const fileRef = useRef(null);
  return (
    <div className="space-y-4">
      <p className="text-gray-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-widest">Payment Proof</p>
      <div className="grid grid-cols-3 gap-2">
        {PROOF_OPTIONS.map(opt => {
          const Icon = opt.icon;
          const sel  = proofType === opt.key;
          return (
            <button key={opt.key} onClick={() => setProofType(opt.key)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${sel ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-900 hover:border-gray-300'}`}>
              <Icon className={`w-4 h-4 ${sel ? 'text-accent' : 'text-gray-400'}`} />
              <p className={`text-xs font-bold leading-tight ${sel ? 'text-accent' : 'text-gray-700 dark:text-zinc-300'}`}>{opt.label}</p>
            </button>
          );
        })}
      </div>
      {proofType === 'utr' && (
        <div className="space-y-1.5">
          <label className="block text-gray-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-widest">UPI Transaction Reference (UTR) *</label>
          <input type="text" value={utrNumber} onChange={e => setUtrNumber(e.target.value.trim())} placeholder="e.g. 426813598234"
            className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-zinc-100 placeholder-gray-400 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent font-mono" />
          <p className="text-gray-400 text-xs">12-digit UTR from your UPI app after paying.</p>
        </div>
      )}
      {proofType === 'screenshot' && (
        <div className="space-y-2">
          <label className="block text-gray-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-widest">Payment Screenshot *</label>
          <div onClick={() => fileRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-2 ${screenshotFile ? 'border-green-400 bg-green-50 dark:bg-green-500/5' : 'border-gray-200 dark:border-white/10 hover:border-accent/40 bg-gray-50 dark:bg-zinc-800'}`}>
            {screenshotFile
              ? <><CheckCircle2 className="w-6 h-6 text-green-500" /><p className="text-green-700 dark:text-green-400 text-sm font-semibold">{screenshotFile.name}</p></>
              : <><Upload className="w-6 h-6 text-gray-400" /><p className="text-gray-600 dark:text-zinc-300 text-sm font-semibold">Click to upload screenshot</p><p className="text-gray-400 text-xs">JPG, PNG or WebP · Max 5MB</p></>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={e => setScreenshotFile(e.target.files?.[0] || null)} />
        </div>
      )}
      {proofType === 'none' && (
        <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/25 rounded-xl px-4 py-3 flex items-start gap-3">
          <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-700 dark:text-yellow-400 text-sm font-semibold">Manual Verification</p>
            <p className="text-yellow-600 dark:text-yellow-500 text-xs mt-0.5">Without a UTR or screenshot, our team will verify manually. This may delay order processing by up to <strong>24 hours</strong>.</p>
          </div>
        </div>
      )}
    </div>
  );
};

const DirectUPIPanel = ({ subtotal, couponPct, paymentPlan, setPaymentPlan, proofType, setProofType, utrNumber, setUtrNumber, screenshotFile, setScreenshotFile, onConfirm, confirming }) => {
  const [copied, setCopied] = useState(false);
  const upiDiscPct  = paymentPlan === 'full' ? 0.01 : 0;
  const { prepaidDisc, taxableAmount, gst, shipping, grandTotal } = calcGST(subtotal, couponPct, upiDiscPct);
  const payableNow  = paymentPlan === 'advance' ? Math.round((taxableAmount * 0.10 + shipping) * 100) / 100 : grandTotal;
  const balanceDue  = paymentPlan === 'advance' ? Math.round((taxableAmount - taxableAmount * 0.10) * 100) / 100 : 0;
  const upiUri      = buildUpiUri(payableNow, `Pronoun Jeans - ${paymentPlan === 'advance' ? '10% Advance' : 'Full Payment'}`);
  const isMobile    = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const canConfirm  = () => { if (proofType === 'utr') return !!utrNumber.trim(); if (proofType === 'screenshot') return !!screenshotFile; return true; };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-gray-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-widest mb-3">Choose Payment Plan</p>
        <div className="grid grid-cols-2 gap-3">
          {[{ value: 'advance', label: '10% Advance', sub: 'Pay 10% + shipping now, rest on delivery' }, { value: 'full', label: 'Full Payment', sub: 'Extra 1% prepaid discount' }].map(opt => (
            <label key={opt.value} onClick={() => setPaymentPlan(opt.value)}
              className={`cursor-pointer rounded-xl border p-3.5 transition-all ${paymentPlan === opt.value ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-900 hover:border-gray-300'}`}>
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentPlan === opt.value ? 'border-accent' : 'border-gray-300 dark:border-zinc-600'}`}>
                  {paymentPlan === opt.value && <div className="w-2 h-2 rounded-full bg-accent" />}
                </div>
                <p className={`text-sm font-bold ${paymentPlan === opt.value ? 'text-accent' : 'text-gray-900 dark:text-zinc-100'}`}>{opt.label}</p>
              </div>
              <p className="text-gray-500 text-xs pl-6">{opt.sub}</p>
            </label>
          ))}
        </div>
      </div>
      <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-xl p-4 space-y-2 text-sm border border-gray-100 dark:border-white/5">
        {prepaidDisc > 0 && <div className="flex justify-between text-green-600 font-semibold"><span>Prepaid Discount (1%)</span><span>−₹{fmt(prepaidDisc)}</span></div>}
        <div className="flex justify-between text-gray-500 dark:text-zinc-400"><span>Taxable Amount</span><span>₹{fmt(taxableAmount)}</span></div>
        <div className="flex justify-between text-gray-500 dark:text-zinc-400"><span>GST 5%</span><span>₹{fmt(gst)}</span></div>
        {shipping > 0
          ? <div className="flex justify-between text-orange-600 font-semibold"><span>Shipping</span><span>+₹{fmt(shipping)}</span></div>
          : <div className="flex justify-between text-green-600 font-semibold"><span>Shipping</span><span>FREE</span></div>}
        <div className="flex justify-between text-gray-700 dark:text-zinc-300 border-t border-gray-200 dark:border-white/10 pt-2"><span className="font-semibold">Order Total</span><span className="font-bold">₹{fmt(grandTotal)}</span></div>
        {paymentPlan === 'advance' && <div className="flex justify-between text-gray-500 dark:text-zinc-400"><span>Balance Due Later</span><span>₹{fmt(balanceDue)}</span></div>}
        <div className="flex items-center justify-between bg-accent/10 border border-accent/20 rounded-lg px-3 py-2 mt-1">
          <span className="text-accent font-bold text-sm uppercase tracking-widest">Pay Now</span>
          <span className="text-gray-900 dark:text-zinc-100 font-black text-lg">₹{fmt(payableNow)}</span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-4 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/10 rounded-2xl p-6">
        <p className="text-gray-700 dark:text-zinc-300 text-sm font-bold">Scan to Pay ₹{fmt(payableNow)}</p>
        <div className="p-3 bg-white rounded-xl shadow-sm border border-gray-100">
          <QRCodeSVG value={upiUri} size={200} level="H" includeMargin={false} />
        </div>
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2 w-full justify-between">
          <div>
            <p className="text-gray-400 text-[10px] uppercase tracking-widest">UPI ID</p>
            <p className="text-gray-900 dark:text-zinc-100 font-mono font-bold text-sm">{UPI_ID}</p>
          </div>
          <button onClick={() => { navigator.clipboard.writeText(UPI_ID); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-red-700 transition-colors">
            {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
          </button>
        </div>
        {isMobile
          ? <a href={upiUri} className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-xl text-sm"><Smartphone className="w-4 h-4" /> Pay ₹{fmt(payableNow)} via UPI App</a>
          : <p className="text-gray-400 text-xs text-center">On mobile, tap "Pay via UPI App" to open PhonePe / GPay directly.</p>}
      </div>
      <ProofSelector proofType={proofType} setProofType={setProofType} utrNumber={utrNumber} setUtrNumber={setUtrNumber} screenshotFile={screenshotFile} setScreenshotFile={setScreenshotFile} />
      <button onClick={onConfirm} disabled={confirming || !canConfirm()}
        className="w-full flex items-center justify-center gap-2.5 bg-accent hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-6 py-3.5 rounded-xl transition-colors text-sm">
        {confirming ? <><Loader className="animate-spin w-4 h-4" /> Confirming…</> : <><PackageCheck className="w-4 h-4" /> Confirm Order</>}
      </button>
      {proofType === 'none' && <p className="text-yellow-600 dark:text-yellow-500 text-xs text-center">⏳ No proof submitted — verification may take up to 24 hours.</p>}
    </div>
  );
};

const CheckoutPanel = ({
  items, addresses, setAddresses, shippingId, billingId,
  onShippingSelect, onBillingSelect,
  couponData, onCouponApply, onCouponRemove, availableCoupons,
  paymentPlan, setPaymentPlan, proofType, setProofType,
  utrNumber, setUtrNumber, screenshotFile, setScreenshotFile,
  onUpiConfirm, upiConfirming, onRazorpayCheckout, razorpayChecking,
}) => {
  const [activeMethod, setActiveMethod] = useState('upi');
  const subtotal   = items.reduce((s, i) => s + parseFloat(i.variation?.b2b_price ?? 0) * i.quantity, 0);
  const couponPct  = couponData ? parseFloat(couponData.discount_value) / 100 : 0;
  const upiDiscPct = activeMethod === 'upi' && paymentPlan === 'full' ? 0.01 : 0;
  const { grandTotal } = calcGST(subtotal, couponPct, upiDiscPct);

  return (
    <div className="flex flex-col xl:flex-row gap-8 items-start">
      <div className="flex-1 min-w-0 space-y-6">
        <AddressSection type="shipping" addresses={addresses} selectedId={shippingId}
          onSelect={onShippingSelect} onAddressesUpdated={setAddresses} />
        <AddressSection type="billing" addresses={addresses} selectedId={billingId}
          onSelect={onBillingSelect} onAddressesUpdated={setAddresses} />
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5"><ShieldCheck className="w-5 h-5 text-accent" /><h2 className="text-gray-900 dark:text-zinc-100 font-bold">Payment Method</h2></div>
          <div className="flex gap-3 mb-6">
            {[{ key: 'upi', label: 'Direct UPI', sub: 'Zero fees · Instant' }, { key: 'razorpay', label: 'Razorpay', sub: 'Card / UPI / NetBanking' }].map(m => (
              <button key={m.key} onClick={() => setActiveMethod(m.key)}
                className={`flex-1 rounded-xl border p-3 text-left transition-all ${activeMethod === m.key ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 hover:border-gray-300'}`}>
                <p className={`text-sm font-bold ${activeMethod === m.key ? 'text-accent' : 'text-gray-900 dark:text-zinc-100'}`}>{m.label}</p>
                <p className="text-gray-500 text-xs mt-0.5">{m.sub}</p>
              </button>
            ))}
          </div>
          {activeMethod === 'upi' && (
            <DirectUPIPanel subtotal={subtotal} couponPct={couponPct} paymentPlan={paymentPlan} setPaymentPlan={setPaymentPlan}
              proofType={proofType} setProofType={setProofType} utrNumber={utrNumber} setUtrNumber={setUtrNumber}
              screenshotFile={screenshotFile} setScreenshotFile={setScreenshotFile} onConfirm={onUpiConfirm} confirming={upiConfirming} />
          )}
          {activeMethod === 'razorpay' && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl px-4 py-3 text-blue-700 dark:text-blue-400 text-sm">
                You'll be redirected to Razorpay's secure payment page. Supports UPI, Cards, and NetBanking.
              </div>
              <button onClick={onRazorpayCheckout} disabled={razorpayChecking}
                className="w-full flex items-center justify-center gap-2.5 bg-[#2d63f5] hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-6 py-3.5 rounded-xl text-sm">
                {razorpayChecking ? <><Loader className="animate-spin w-4 h-4" /> Opening…</> : <><CreditCard className="w-4 h-4" /> Pay ₹{fmt(grandTotal)} via Razorpay</>}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="w-full xl:w-80 shrink-0">
        <OrderSummaryCard items={items} couponData={couponData} upiDiscPct={upiDiscPct}
          availableCoupons={availableCoupons} onCouponApply={onCouponApply} onCouponRemove={onCouponRemove} />
      </div>
    </div>
  );
};

// ── Main Cart Component ───────────────────────────────────────────────────────

const Cart = () => {
  const navigate           = useNavigate();
  const fetchCart          = useCartStore((s) => s.fetchCart);
  const impersonatedBuyer  = useAuthStore((s) => s.impersonatedBuyer);

  const [items, setItems]                       = useState([]);
  const [addresses, setAddresses]               = useState([]);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [shippingId, setShippingId]             = useState(null);
  const [billingId, setBillingId]               = useState(null);
  const [loading, setLoading]                   = useState(true);
  const [toast, setToast]                       = useState(null);
  const [couponData, setCouponData]             = useState(null);
  const [success, setSuccess]                   = useState(false);
  const [successMsg, setSuccessMsg]             = useState('');
  const [paymentPlan, setPaymentPlan]           = useState('full');
  const [proofType, setProofType]               = useState('utr');
  const [utrNumber, setUtrNumber]               = useState('');
  const [screenshotFile, setScreenshotFile]     = useState(null);
  const [upiConfirming, setUpiConfirming]       = useState(false);
  const [razorpayChecking, setRazorpayChecking] = useState(false);

  const showToast  = useCallback((message, type = 'success') => setToast({ message, type }), []);
  const clearToast = useCallback(() => setToast(null), []);
  const { saving, scheduleUpdate } = useQtyUpdate(showToast, fetchCart);

  useEffect(() => {
    const cartUrl = impersonatedBuyer ? `orders/cart/?buyer_id=${impersonatedBuyer.id}` : 'orders/cart/';
    const addrUrl = impersonatedBuyer ? `accounts/addresses/?buyer_id=${impersonatedBuyer.id}` : 'accounts/addresses/';
    Promise.all([
      api.get(cartUrl),
      api.get(addrUrl),
      api.get('orders/coupons/active/'),
    ]).then(([cartRes, addrRes, couponRes]) => {
      const cartItems = cartRes.data?.items ?? [];
      setItems(cartItems);
      const addrs = addrRes.data ?? [];
      setAddresses(addrs);
      setAvailableCoupons(couponRes.data?.results ?? couponRes.data ?? []);
      const defShip = addrs.find(a => a.is_default_shipping);
      const defBill = addrs.find(a => a.is_default_billing);
      if (defShip) setShippingId(defShip.id);
      if (defBill) setBillingId(defBill.id);

    }).catch(() => showToast('Failed to load cart.', 'error'))
      .finally(() => setLoading(false));
  }, [showToast, impersonatedBuyer]);

  const handleQtyChange = useCallback((cartItemId, newQty) => {
    let snapshot;
    setItems(prev => {
      snapshot = prev;
      if (newQty <= 0) return prev.filter(i => i.id !== cartItemId);
      return prev.map(i => i.id === cartItemId ? { ...i, quantity: newQty } : i);
    });
    scheduleUpdate(cartItemId, newQty, () => setItems(snapshot));
    setCouponData(null);
  }, [scheduleUpdate]);

  const handleUpiConfirm = async () => {
    if (items.some(i => i.unavailable)) { showToast('Remove unavailable items before checking out.', 'error'); return; }
    if (!shippingId) { showToast('Please select a shipping address.', 'error'); return; }
    if (!billingId)  { showToast('Please select a billing address.', 'error'); return; }
    setUpiConfirming(true);
    try {
      const formData = new FormData();
      formData.append('payment_plan', paymentPlan); formData.append('proof_type', proofType);
      formData.append('shipping_address_id', shippingId); formData.append('billing_address_id', billingId);
      formData.append('coupon_code', couponData?.coupon_code || '');
      if (proofType === 'utr') formData.append('utr_number', utrNumber.trim());
      if (proofType === 'screenshot' && screenshotFile) formData.append('payment_screenshot', screenshotFile);
      if (impersonatedBuyer) formData.append('buyer_id', impersonatedBuyer.id);
      const res = await api.post('orders/upi/checkout/', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setItems([]); setCouponData(null); setUtrNumber(''); setScreenshotFile(null);
      fetchCart(); setSuccess(true);
      setSuccessMsg(res.data.message || `Order #${res.data.order_id} placed successfully!`);
      setTimeout(() => navigate('/history'), 3500);
    } catch (err) { showToast(err.response?.data?.error || 'Order failed. Please try again.', 'error'); }
    finally { setUpiConfirming(false); }
  };

  const handleRazorpayCheckout = async () => {
    if (items.some(i => i.unavailable)) { showToast('Remove unavailable items before checking out.', 'error'); return; }
    if (!shippingId) { showToast('Please select a shipping address.', 'error'); return; }
    if (!billingId)  { showToast('Please select a billing address.', 'error'); return; }
    setRazorpayChecking(true);
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) { showToast('Failed to load payment gateway.', 'error'); setRazorpayChecking(false); return; }
    let orderData;
    try {
      const res = await api.post('orders/razorpay/create/', { shipping_address_id: shippingId, billing_address_id: billingId, coupon_code: couponData?.coupon_code || '', ...(impersonatedBuyer ? { buyer_id: impersonatedBuyer.id } : {}) });
      orderData = res.data;
    } catch (err) { showToast(err.response?.data?.error || 'Failed to initiate payment.', 'error'); setRazorpayChecking(false); return; }
    const options = {
      key: orderData.key_id, amount: orderData.amount, currency: orderData.currency,
      name: 'Pronoun Jeans', description: 'B2B Wholesale Order', order_id: orderData.razorpay_order_id,
      prefill: { name: orderData.name, email: orderData.email, contact: orderData.contact },
      theme: { color: '#dc2626' },
      handler: async (response) => {
        try {
          await api.post('orders/razorpay/verify/', { razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature });
          setItems([]); setCouponData(null); fetchCart(); setSuccess(true); setSuccessMsg('Payment successful! Order confirmed.');
          setTimeout(() => navigate('/history'), 2400);
        } catch (err) { showToast(err.response?.data?.error || 'Verification failed.', 'error'); }
        finally { setRazorpayChecking(false); }
      },
      modal: { ondismiss: () => { showToast('Payment cancelled.', 'error'); setRazorpayChecking(false); } },
    };
    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', () => { showToast('Payment failed.', 'error'); setRazorpayChecking(false); });
    rzp.open();
  };

  return (
    <div className="bg-gray-50 dark:bg-zinc-950 min-h-screen p-6 lg:p-12">
      <Seo
        title="Your Cart"
        description="Review the size sets in your Pronoun Jeans wholesale cart and complete your bulk order."
        canonical="/cart"
        noindex
      />
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <ShoppingCart className="w-7 h-7 text-accent" />
          <h1 className="text-gray-900 dark:text-zinc-100 text-3xl font-bold">Your Cart</h1>
          {!loading && items.length > 0 && (
            <span className="ml-1 bg-accent/15 border border-accent/25 text-accent text-xs font-bold px-2.5 py-1 rounded-full">
              {items.length} SKU{items.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {success && (
          <div className="flex flex-col items-center justify-center py-28 gap-5">
            <div className="w-20 h-20 rounded-full bg-green-50 dark:bg-green-500/10 border border-green-200 flex items-center justify-center">
              <PackageCheck className="w-9 h-9 text-green-600" />
            </div>
            <p className="text-gray-900 dark:text-zinc-100 text-2xl font-bold text-center">{successMsg}</p>
            <p className="text-gray-500 text-sm">Redirecting to your orders…</p>
            <Loader className="animate-spin text-accent w-5 h-5 mt-1" />
          </div>
        )}
        {!success && loading && <div className="flex items-center justify-center py-28"><Loader className="animate-spin text-accent w-9 h-9" /></div>}
        {!success && !loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28 gap-4">
            <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center"><ShoppingCart className="w-9 h-9 text-gray-400" /></div>
            <p className="text-gray-900 dark:text-zinc-100 text-xl font-bold">Your cart is empty</p>
            <button onClick={() => navigate('/catalog')} className="mt-2 bg-accent hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm">Browse Catalog</button>
          </div>
        )}

        {!success && !loading && items.length > 0 && (
          <div className="space-y-8">
            {/* Desktop table */}
            <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 overflow-hidden shadow-sm">
              <div className="px-6 py-5 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
                <h2 className="text-gray-900 dark:text-zinc-100 font-bold text-lg">Cart Items</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 dark:text-zinc-400 text-xs uppercase tracking-widest border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-zinc-800/50">
                      <th className="text-left px-6 py-4">Product</th>
                      <th className="text-left px-6 py-4">Size</th>
                      <th className="text-left px-6 py-4">Color</th>
                      <th className="text-left px-6 py-4">Wholesale Price</th>
                      <th className="text-left px-6 py-4">Quantity</th>
                      <th className="text-left px-6 py-4">Subtotal</th>
                      <th className="px-6 py-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <CartRow
                        key={item.id}
                        item={item}
                        index={idx}
                        onQtyChange={handleQtyChange}
                        saving={saving}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {items.map(item => {
                const thumb = item.variation?.display_image ?? null;
                if (item.unavailable) {
                  return (
                    <div key={item.id} className="bg-red-50/60 dark:bg-red-500/5 rounded-2xl border border-red-200 dark:border-red-500/20 p-4 shadow-sm flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-sm font-semibold">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        SKU removed — no longer available
                      </div>
                      <button onClick={() => handleQtyChange(item.id, 0)} className="text-gray-400 hover:text-red-500 transition-colors shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                }
                return (
                  <div key={item.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 p-4 shadow-sm">
                    <div className="flex gap-3 mb-3">
                      <ProductThumb
                        src={thumb}
                        alt={item.variation?.product_name}
                        className="w-16 h-16 rounded-xl shrink-0 border border-gray-100 dark:border-white/5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-1">
                            <p className="text-gray-900 dark:text-zinc-100 font-semibold text-sm">{item.variation?.product_name}</p>
                            <SetBreakdownTooltip breakdown={item.variation?.set_breakdown} />
                          </div>
                          <button onClick={() => handleQtyChange(item.id, 0)} className="text-gray-400 hover:text-red-500 ml-2"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        <p className="text-gray-400 text-xs font-mono mt-0.5">{item.variation?.sku}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <span>{item.variation?.size}</span><span>/</span>
                          <ColorSwatch hex={item.variation?.color_hex || '#CCCCCC'} name={item.variation?.color_name || item.variation?.color || '—'} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <QtyControl value={item.quantity} saving={!!saving[item.id]}
                        onDecrement={() => handleQtyChange(item.id, item.quantity - 1)}
                        onIncrement={() => handleQtyChange(item.id, item.quantity + 1)}
                        onDirectChange={(v) => handleQtyChange(item.id, v)} />
                      <span className="text-gray-900 dark:text-zinc-100 font-bold">₹{(parseFloat(item.variation?.b2b_price ?? 0) * item.quantity).toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <CheckoutPanel
              items={items} addresses={addresses} setAddresses={setAddresses}
              shippingId={shippingId} billingId={billingId}
              onShippingSelect={setShippingId} onBillingSelect={setBillingId}
              couponData={couponData} onCouponApply={setCouponData} onCouponRemove={() => setCouponData(null)}
              availableCoupons={availableCoupons}
              paymentPlan={paymentPlan} setPaymentPlan={setPaymentPlan}
              proofType={proofType} setProofType={setProofType}
              utrNumber={utrNumber} setUtrNumber={setUtrNumber}
              screenshotFile={screenshotFile} setScreenshotFile={setScreenshotFile}
              onUpiConfirm={handleUpiConfirm} upiConfirming={upiConfirming}
              onRazorpayCheckout={handleRazorpayCheckout} razorpayChecking={razorpayChecking}
            />
          </div>
        )}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onDone={clearToast} />}
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
};

export default Cart;