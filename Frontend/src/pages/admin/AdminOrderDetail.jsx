import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader, BadgeCheck, Truck, MapPin, Receipt, User, Save,
  AlertTriangle, ExternalLink, Briefcase,
} from 'lucide-react';
import { getOrder, updateOrder } from '../../api/adminApi';
import {
  ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_TONES, STATUS_TONES, money,
} from './orderPresentation';

const Card = ({ icon: Icon, title, children, className = '' }) => (
  <section className={`bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-5 ${className}`}>
    <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-4">
      <Icon size={15} /> {title}
    </h2>
    {children}
  </section>
);

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm">
    <span className="text-gray-500 dark:text-zinc-400 shrink-0">{label}</span>
    <span className="font-semibold text-gray-900 dark:text-zinc-100 text-right break-words">{children}</span>
  </div>
);

const Address = ({ address, fallback }) => {
  if (!address) return <p className="text-sm text-gray-400 dark:text-zinc-500">{fallback}</p>;
  return (
    <div className="text-sm text-gray-700 dark:text-zinc-300 space-y-0.5">
      <p>{address.address_line_1}</p>
      {address.address_line_2 && <p>{address.address_line_2}</p>}
      <p>{address.city}, {address.state} — {address.pincode}</p>
      {/* effective_* fall back to the account when the address carries no
          contact of its own, which is what a courier actually needs. */}
      <p className="text-gray-500 dark:text-zinc-400 pt-1">
        {address.effective_phone || 'No phone'}
        {address.effective_email ? ` · ${address.effective_email}` : ''}
      </p>
    </div>
  );
};

/**
 * One order, and the four things an admin does to it: confirm the payment
 * landed, set a status, record a courier, and read back what was bought.
 *
 * Everything about the money is display-only — it was settled at checkout and
 * the API refuses to change it — so the editable surface here is deliberately
 * small and sits in one panel.
 */
export default function AdminOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [form, setForm]   = useState(null);
  const [saving, setSave] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getOrder(id)
      .then(o => {
        setOrder(o);
        setForm({
          status:           o.status,
          payment_status:   o.payment_status,
          payment_verified: o.payment_verified,
          courier_name:     o.courier_name || '',
          tracking_number:  o.tracking_number || '',
          tracking_url:     o.tracking_url || '',
        });
      })
      .catch(() => setError('Could not load that order.'));
  }, [id]);

  const set = (patch) => { setForm(f => ({ ...f, ...patch })); setSaved(false); };

  const save = () => {
    setSave(true); setError(''); setSaved(false);
    updateOrder(id, form)
      .then(o => {
        // Verifying a payment can move the status server-side — Order.save()
        // promotes PENDING_VERIFICATION to APPROVED — so the form is re-seeded
        // from the response rather than from what was sent.
        setOrder(o);
        setForm(f => ({
          ...f,
          status:           o.status,
          payment_status:   o.payment_status,
          payment_verified: o.payment_verified,
        }));
        setSaved(true);
      })
      .catch(err => {
        const detail = err.response?.data;
        setError(detail && typeof detail === 'object'
          ? Object.values(detail).flat().join(' ')
          : 'Could not save those changes.');
      })
      .finally(() => setSave(false));
  };

  if (error && !order) {
    return <p className="max-w-3xl mx-auto text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>;
  }
  if (!order || !form) {
    return <div className="flex items-center justify-center py-20 text-gray-400"><Loader className="animate-spin" /></div>;
  }

  const dirty = ['status', 'payment_status', 'payment_verified', 'courier_name',
                 'tracking_number', 'tracking_url']
    .some(k => String(form[k] ?? '') !== String(order[k] ?? ''));

  const needsVerifying = !order.payment_verified
    && order.status === 'PENDING_VERIFICATION';

  return (
    <div className="max-w-5xl mx-auto">
      <button onClick={() => navigate('/admin/orders')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 mb-4">
        <ArrowLeft size={16} /> All orders
      </button>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100">Order #{order.id}</h1>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_TONES[order.status] || STATUS_TONES.PENDING}`}>
          {order.status_display}
        </span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${PAYMENT_TONES[order.payment_status] || PAYMENT_TONES.pending}`}>
          {order.payment_status}
        </span>
        <span className="text-sm text-gray-400 dark:text-zinc-500">
          {new Date(order.created_at).toLocaleString()}
        </span>
      </div>

      {needsVerifying && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10">
          <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            This order is waiting on you. Check the payment reference below against the bank,
            then tick <strong>Payment verified</strong> — that approves the order automatically.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-sm font-semibold text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* ── The editable half ─────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <Card icon={Truck} title="Status & dispatch">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 mb-1 block">Order status</span>
                <select value={form.status} onChange={e => set({ status: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm font-semibold text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40">
                  {ORDER_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 mb-1 block">Payment status</span>
                <select value={form.payment_status} onChange={e => set({ payment_status: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm font-semibold text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40">
                  {PAYMENT_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 mb-1 block">Courier</span>
                <input value={form.courier_name} onChange={e => set({ courier_name: e.target.value })}
                  placeholder="Delhivery, Bluedart…"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40" />
              </label>

              <label className="block">
                <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 mb-1 block">Tracking number</span>
                <input value={form.tracking_number} onChange={e => set({ tracking_number: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40" />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 mb-1 block">Tracking link</span>
                <input value={form.tracking_url} onChange={e => set({ tracking_url: e.target.value })}
                  placeholder="https://…"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40" />
              </label>
            </div>

            <label className={`flex items-start gap-3 mt-4 p-3 rounded-xl border cursor-pointer transition ${
              form.payment_verified
                ? 'border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-500/10'
                : 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
            }`}>
              <input type="checkbox" checked={form.payment_verified}
                onChange={e => set({ payment_verified: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-green-600" />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-zinc-100">
                  <BadgeCheck size={15} /> Payment verified
                </span>
                <span className="block text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                  Tick this only once the money is visible in the bank. Saving it on an
                  order awaiting verification also approves the order.
                </span>
              </span>
            </label>

            <div className="flex items-center gap-3 mt-4">
              <button onClick={save} disabled={!dirty || saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                Save changes
              </button>
              {saved && !dirty && (
                <span className="text-sm font-semibold text-green-600 dark:text-green-400">Saved.</span>
              )}
            </div>
          </Card>

          <Card icon={Receipt} title={`Items (${order.items.length})`}>
            <div className="space-y-3">
              {order.items.map(it => (
                <div key={it.id} className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-zinc-800 shrink-0">
                    {it.thumb_url
                      ? <img src={it.thumb_url} alt="" className="w-full h-full object-cover" />
                      : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-zinc-100 truncate">{it.product_name}</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                      {it.sku}{it.size ? ` · ${it.size}` : ''}{it.color_name ? ` · ${it.color_name}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">{money(it.line_total)}</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">{it.quantity} × {money(it.price)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── The read-only half ────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card icon={User} title="Buyer">
            <p className="font-bold text-gray-900 dark:text-zinc-100">
              {order.company_name || order.user_email || 'Deleted account'}
            </p>
            {order.company_name && (
              <p className="text-sm text-gray-500 dark:text-zinc-400">{order.user_email}</p>
            )}
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              {order.user_phone || 'No phone'}{order.gst_number ? ` · GST ${order.gst_number}` : ''}
            </p>
            {order.agent_email && (
              <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 mt-2">
                <Briefcase size={13} /> Placed by {order.agent_email}
              </p>
            )}
            {order.user && (
              <button onClick={() => navigate(`/admin/users/${order.user}`)}
                className="text-xs font-bold text-accent hover:underline mt-2">
                Open profile
              </button>
            )}
          </Card>

          <Card icon={Receipt} title="Payment">
            <Row label="Items total">{money(order.total_amount)}</Row>
            {Number(order.discount_amount) > 0 && (
              <Row label={order.coupon_code ? `Coupon ${order.coupon_code}` : 'Discount'}>
                −{money(order.discount_amount)}
              </Row>
            )}
            {Number(order.upi_discount) > 0 && (
              <Row label="UPI discount">−{money(order.upi_discount)}</Row>
            )}
            <div className="border-t border-gray-100 dark:border-white/5 my-2" />
            <Row label="Grand total">{money(order.grand_total)}</Row>
            <Row label="Paid">{money(order.amount_paid)}</Row>
            {Number(order.balance_due) > 0 && (
              <Row label="Balance due">
                <span className="text-amber-600 dark:text-amber-400">{money(order.balance_due)}</span>
              </Row>
            )}
            <div className="border-t border-gray-100 dark:border-white/5 my-2" />
            <Row label="Method">{order.payment_method}</Row>
            {order.payment_plan && <Row label="Plan">{order.payment_plan}</Row>}
            {order.utr_number && <Row label="UTR">{order.utr_number}</Row>}
            {order.razorpay_payment_id && <Row label="Razorpay">{order.razorpay_payment_id}</Row>}

            {order.payment_screenshot_url && (
              <a href={order.payment_screenshot_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-bold text-accent hover:underline mt-3">
                <ExternalLink size={13} /> View payment screenshot
              </a>
            )}
          </Card>

          <Card icon={MapPin} title="Shipping to">
            <Address address={order.shipping} fallback="No shipping address on this order." />
          </Card>

          <Card icon={MapPin} title="Billing to">
            <Address address={order.billing} fallback="Same as shipping." />
          </Card>
        </div>
      </div>
    </div>
  );
}
