import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, PackageCheck, Loader, AlertCircle, CheckCircle2,
  ArrowRight, Tag, ReceiptText, Plus, Minus, Trash2,
  Truck, CreditCard, Building, ShieldCheck, Landmark, Clock,
} from 'lucide-react';
import api from '../api/axios';

const Toast = ({ message, type = 'success', onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [onDone]);
  const styles = type === 'success'
    ? 'bg-green-500/10 border-green-500/30 text-green-400'
    : 'bg-red-500/10 border-red-500/30 text-red-400';
  const Icon = type === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl border text-sm font-semibold shadow-2xl ${styles}`} style={{ animation: 'slideUp 0.25s ease' }}>
      <Icon className="w-4 h-4 shrink-0" />{message}
    </div>
  );
};

const Spinner = () => (
  <div className="flex items-center justify-center py-28">
    <Loader className="animate-spin text-accent w-9 h-9" />
  </div>
);

const EmptyCart = ({ navigate }) => (
  <div className="flex flex-col items-center justify-center py-28 gap-4">
    <div className="w-20 h-20 rounded-full bg-secondary border border-white/5 flex items-center justify-center">
      <ShoppingCart className="w-9 h-9 text-gray-600" />
    </div>
    <p className="text-white text-xl font-bold">Your cart is empty</p>
    <p className="text-gray-500 text-sm">Add products from the catalogue to get started.</p>
    <button onClick={() => navigate('/catalog')} className="mt-2 bg-accent hover:bg-accent/80 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
      Browse Catalog
    </button>
  </div>
);

const QtyControl = ({ value, saving, onDecrement, onIncrement, onDirectChange }) => (
  <div className="flex items-center rounded-xl overflow-hidden border border-white/10 bg-primary w-fit">
    <button onClick={onDecrement} disabled={saving || value <= 1} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
      <Minus className="w-3.5 h-3.5" />
    </button>
    <div className="relative w-12 h-8 flex items-center justify-center border-x border-white/10">
      {saving ? <Loader className="animate-spin w-3.5 h-3.5 text-accent" /> : (
        <input type="number" min={1} value={value}
          onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 1) onDirectChange(v); }}
          className="w-full h-full text-center text-white text-sm font-bold bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      )}
    </div>
    <button onClick={onIncrement} disabled={saving} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
      <Plus className="w-3.5 h-3.5" />
    </button>
  </div>
);

const useQtyUpdate = (showToast) => {
  const timerRef = useRef({});
  const [saving, setSaving] = useState({});
  const scheduleUpdate = useCallback((cartItemId, newQty) => {
    clearTimeout(timerRef.current[cartItemId]);
    timerRef.current[cartItemId] = setTimeout(async () => {
      setSaving((s) => ({ ...s, [cartItemId]: true }));
      try {
        await api.patch(`orders/cart/items/${cartItemId}/`, { quantity: newQty });
      } catch (err) {
        showToast(err.response?.data?.error || 'Failed to update quantity.', 'error');
      } finally {
        setSaving((s) => ({ ...s, [cartItemId]: false }));
      }
    }, 600);
  }, [showToast]);
  return { saving, scheduleUpdate };
};

const CartRow = ({ item, index, onQtyChange, saving }) => {
  const { id, variation, quantity } = item;
  const price    = parseFloat(variation?.b2b_price ?? 0);
  const subtotal = (price * quantity).toFixed(2);
  return (
    <tr className={`border-b border-white/5 ${index % 2 === 0 ? 'bg-white/[0.015]' : ''}`}>
      <td className="px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
            <Tag className="w-4 h-4 text-gray-600" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-snug max-w-[220px]">{variation?.product_name ?? '—'}</p>
            <p className="text-gray-500 text-xs font-mono mt-0.5">{variation?.sku ?? ''}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-gray-300 text-sm">{variation?.size ?? '—'}</td>
      <td className="px-6 py-4 text-gray-300 text-sm font-mono">{variation?.color ?? '—'}</td>
      <td className="px-6 py-4 text-accent font-bold text-sm whitespace-nowrap">₹{price.toFixed(2)}</td>
      <td className="px-6 py-4">
        <QtyControl value={quantity} saving={!!saving[id]}
          onDecrement={() => onQtyChange(id, quantity - 1)}
          onIncrement={() => onQtyChange(id, quantity + 1)}
          onDirectChange={(v) => onQtyChange(id, v)} />
      </td>
      <td className="px-6 py-4 text-white font-bold text-sm whitespace-nowrap">₹{subtotal}</td>
      <td className="px-6 py-4">
        <button onClick={() => onQtyChange(id, 0)} className="text-gray-600 hover:text-red-400 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
};

const PAYMENT_OPTIONS = [
  { value: 'razorpay',      label: 'Razorpay',              subtitle: 'Pay now via UPI, Card or NetBanking', icon: CreditCard  },
  { value: 'net_30',        label: 'Net 30 Terms',          subtitle: 'Invoice due within 30 days',          icon: Clock       },
  { value: 'bank_transfer', label: 'Direct Bank Transfer',  subtitle: 'NEFT / RTGS / IMPS to our account',   icon: Landmark    },
];

const AddressCard = ({ addr, selected, onSelect, type }) => {
  const Icon = type === 'shipping' ? Truck : Building;
  return (
    <div
      onClick={() => onSelect(addr.id)}
      className={`cursor-pointer rounded-xl border p-4 transition-all ${selected ? 'border-accent/60 bg-accent/5' : 'border-white/10 bg-primary hover:border-white/20'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-3.5 h-3.5 ${selected ? 'text-accent' : 'text-gray-500'}`} />
          <span className={`text-xs font-bold uppercase tracking-widest ${selected ? 'text-accent' : 'text-gray-500'}`}>
            {type === 'shipping' ? 'Shipping' : 'Billing'}
          </span>
        </div>
        {selected && <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />}
      </div>
      <p className="text-white text-sm font-semibold">{addr.address_line_1}</p>
      {addr.address_line_2 && <p className="text-gray-400 text-xs">{addr.address_line_2}</p>}
      <p className="text-gray-400 text-xs">{addr.city}, {addr.state} — {addr.pincode}</p>
    </div>
  );
};

const CheckoutPanel = ({ items, addresses, shippingId, billingId, paymentMethod, onShippingSelect, onBillingSelect, onPaymentSelect, onCheckout, checking }) => {
  const grandTotal = items.reduce((s, i) => s + parseFloat(i.variation?.b2b_price ?? 0) * i.quantity, 0).toFixed(2);
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="flex flex-col xl:flex-row gap-8 items-start">

      {/* Left — Checkout Form */}
      <div className="flex-1 min-w-0 space-y-6">

        {/* Shipping Address */}
        <div className="bg-secondary rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Truck className="w-5 h-5 text-accent" />
            <h2 className="text-white font-bold">Shipping Address</h2>
          </div>
          {addresses.length === 0 ? (
            <p className="text-gray-500 text-sm">No addresses saved. <a href="/dashboard" className="text-accent underline">Add one in Dashboard.</a></p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {addresses.map(addr => (
                <AddressCard key={addr.id} addr={addr} type="shipping"
                  selected={shippingId === addr.id} onSelect={onShippingSelect} />
              ))}
            </div>
          )}
        </div>

        {/* Billing Address */}
        <div className="bg-secondary rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building className="w-5 h-5 text-accent" />
            <h2 className="text-white font-bold">Billing Address</h2>
          </div>
          {addresses.length === 0 ? (
            <p className="text-gray-500 text-sm">No addresses saved.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {addresses.map(addr => (
                <AddressCard key={addr.id} addr={addr} type="billing"
                  selected={billingId === addr.id} onSelect={onBillingSelect} />
              ))}
            </div>
          )}
        </div>

        {/* Payment Method */}
        <div className="bg-secondary rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-accent" />
            <h2 className="text-white font-bold">Payment Method</h2>
          </div>
          <div className="space-y-3">
            {PAYMENT_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = paymentMethod === opt.value;
              return (
                <label key={opt.value} onClick={() => onPaymentSelect(opt.value)}
                  className={`flex items-center gap-4 cursor-pointer rounded-xl border p-4 transition-all ${active ? 'border-accent/60 bg-accent/5' : 'border-white/10 bg-primary hover:border-white/20'}`}>
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${active ? 'border-accent' : 'border-gray-600'}`}>
                    {active && <div className="w-2 h-2 rounded-full bg-accent" />}
                  </div>
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-accent' : 'text-gray-500'}`} />
                  <div>
                    <p className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}>{opt.label}</p>
                    <p className="text-gray-500 text-xs">{opt.subtitle}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right — Order Summary */}
      <div className="w-full xl:w-80 shrink-0">
        <div className="bg-secondary rounded-2xl border border-white/5 p-6 space-y-5 sticky top-6">
          <div className="flex items-center gap-2 pb-4 border-b border-white/5">
            <ReceiptText className="w-5 h-5 text-accent" />
            <h2 className="text-white font-bold text-lg">Order Summary</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between text-gray-400">
              <span>SKU Lines</span><span className="text-white font-semibold">{items.length}</span>
            </div>
            <div className="flex items-center justify-between text-gray-400">
              <span>Total Units</span><span className="text-white font-semibold">{totalUnits}</span>
            </div>
            <div className="flex items-center justify-between text-gray-400 pt-2 border-t border-white/5">
              <span>Subtotal (excl. GST)</span><span className="text-white font-semibold">₹{grandTotal}</span>
            </div>
          </div>
          <div className="flex items-center justify-between bg-accent/10 border border-accent/20 rounded-xl px-4 py-3">
            <span className="text-accent font-bold text-sm uppercase tracking-widest">Grand Total</span>
            <span className="text-white font-extrabold text-xl">₹{grandTotal}</span>
          </div>

          {/* Selected payment method pill */}
          {paymentMethod && (
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-white/5 rounded-xl px-3 py-2">
              <ShieldCheck className="w-3.5 h-3.5 text-accent" />
              {PAYMENT_OPTIONS.find(o => o.value === paymentMethod)?.label}
            </div>
          )}

          <button onClick={onCheckout} disabled={checking}
            className="w-full flex items-center justify-center gap-2.5 bg-accent hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-6 py-3.5 rounded-xl transition-colors text-sm">
            {checking
              ? <><Loader className="animate-spin w-4 h-4" /> Placing Order…</>
              : <><PackageCheck className="w-4 h-4" /> Place Wholesale Order <ArrowRight className="w-4 h-4" /></>
            }
          </button>
          <p className="text-gray-600 text-xs text-center leading-relaxed">
            By submitting, you confirm this is a B2B bulk purchase order.
          </p>
        </div>
      </div>
    </div>
  );
};

const Cart = () => {
  const navigate = useNavigate();
  const [items, setItems]               = useState([]);
  const [addresses, setAddresses]       = useState([]);
  const [shippingId, setShippingId]     = useState(null);
  const [billingId, setBillingId]       = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [loading, setLoading]           = useState(true);
  const [checking, setChecking]         = useState(false);
  const [success, setSuccess]           = useState(false);
  const [toast, setToast]               = useState(null);

  const showToast  = useCallback((message, type = 'success') => setToast({ message, type }), []);
  const clearToast = useCallback(() => setToast(null), []);
  const { saving, scheduleUpdate } = useQtyUpdate(showToast);

  useEffect(() => {
    Promise.all([
      api.get('orders/cart/'),
      api.get('accounts/addresses/'),
    ]).then(([cartRes, addrRes]) => {
      const cartItems = cartRes.data?.items ?? [];
      const addrs     = addrRes.data ?? [];
      setItems(cartItems);
      setAddresses(addrs);
      // Auto-select defaults
      const defShipping = addrs.find(a => a.is_default_shipping);
      const defBilling  = addrs.find(a => a.is_default_billing);
      if (defShipping) setShippingId(defShipping.id);
      if (defBilling)  setBillingId(defBilling.id);
    }).catch(() => showToast('Failed to load cart.', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const handleQtyChange = useCallback((cartItemId, newQty) => {
    if (newQty <= 0) {
      setItems(prev => prev.filter(i => i.id !== cartItemId));
      scheduleUpdate(cartItemId, 0);
      return;
    }
    setItems(prev => prev.map(i => i.id === cartItemId ? { ...i, quantity: newQty } : i));
    scheduleUpdate(cartItemId, newQty);
  }, [scheduleUpdate]);

  const handleCheckout = async () => {
    if (checking) return;
    if (!shippingId) { showToast('Please select a shipping address.', 'error'); return; }
    if (!billingId)  { showToast('Please select a billing address.', 'error'); return; }

    setChecking(true);
    try {
      await api.post('orders/checkout/', {
        shipping_address_id: shippingId,
        billing_address_id:  billingId,
        payment_method:      paymentMethod,
      });
      setItems([]);
      setSuccess(true);
      showToast('Bulk order placed successfully!', 'success');
      if (paymentMethod === 'razorpay') {
        setTimeout(() => navigate('/payment'), 1200);
      } else {
        setTimeout(() => navigate('/dashboard'), 2400);
      }
    } catch (err) {
      showToast(err.response?.data?.error || err.response?.data?.detail || 'Checkout failed.', 'error');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="bg-primary min-h-screen p-6 lg:p-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <ShoppingCart className="w-7 h-7 text-accent" />
          <h1 className="text-white text-3xl font-bold">Your Cart</h1>
          {!loading && items.length > 0 && (
            <span className="ml-1 bg-accent/15 border border-accent/25 text-accent text-xs font-bold px-2.5 py-1 rounded-full">
              {items.length} SKU{items.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {success && (
          <div className="flex flex-col items-center justify-center py-28 gap-5">
            <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <PackageCheck className="w-9 h-9 text-green-400" />
            </div>
            <p className="text-white text-2xl font-bold">Order Placed!</p>
            <p className="text-gray-400 text-sm">
              {paymentMethod === 'razorpay' ? 'Redirecting to payment…' : 'Redirecting to your dashboard…'}
            </p>
            <Loader className="animate-spin text-accent w-5 h-5 mt-1" />
          </div>
        )}

        {!success && loading  && <Spinner />}
        {!success && !loading && items.length === 0 && <EmptyCart navigate={navigate} />}

        {!success && !loading && items.length > 0 && (
          <div className="space-y-8">
            {/* Cart items table */}
            <div className="hidden md:block bg-secondary rounded-2xl border border-white/5 overflow-hidden">
              <div className="px-6 py-5 border-b border-white/5">
                <h2 className="text-white font-bold text-lg">Cart Items</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase tracking-widest border-b border-white/5">
                      <th className="text-left px-6 py-4">Product</th>
                      <th className="text-left px-6 py-4">Size</th>
                      <th className="text-left px-6 py-4">Color</th>
                      <th className="text-left px-6 py-4">B2B Price</th>
                      <th className="text-left px-6 py-4">Quantity</th>
                      <th className="text-left px-6 py-4">Subtotal</th>
                      <th className="px-6 py-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <CartRow key={item.id} item={item} index={idx} onQtyChange={handleQtyChange} saving={saving} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {items.map(item => (
                <div key={item.id} className="bg-secondary rounded-2xl border border-white/5 p-4">
                  <div className="flex justify-between items-start mb-3">
                    <p className="text-white font-semibold text-sm">{item.variation?.product_name}</p>
                    <button onClick={() => handleQtyChange(item.id, 0)} className="text-gray-600 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-gray-500 text-xs font-mono mb-3">{item.variation?.sku}</p>
                  <div className="flex items-center justify-between">
                    <QtyControl value={item.quantity} saving={!!saving[item.id]}
                      onDecrement={() => handleQtyChange(item.id, item.quantity - 1)}
                      onIncrement={() => handleQtyChange(item.id, item.quantity + 1)}
                      onDirectChange={(v) => handleQtyChange(item.id, v)} />
                    <span className="text-white font-bold">₹{(parseFloat(item.variation?.b2b_price ?? 0) * item.quantity).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Address + Payment + Summary */}
            <CheckoutPanel
              items={items}
              addresses={addresses}
              shippingId={shippingId}
              billingId={billingId}
              paymentMethod={paymentMethod}
              onShippingSelect={setShippingId}
              onBillingSelect={setBillingId}
              onPaymentSelect={setPaymentMethod}
              onCheckout={handleCheckout}
              checking={checking}
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