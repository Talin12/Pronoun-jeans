import React, { useEffect, useState, useMemo } from 'react';
import { Loader, PackageSearch, MapPin, ExternalLink, CheckCircle2, Filter } from 'lucide-react';
import api from '../api/axios';
import TrackingTimelineModal from '../components/shared/TrackingTimelineModal';
import Seo from '../components/seo/Seo';

const SELLER_GSTIN = '24AEXPJ4984P1ZD';
const SELLER_NAME  = 'M. SANKLECHA CREATION';

const STATUS_STYLES = {
  PENDING_VERIFICATION: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  PENDING:   'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  APPROVED:  'bg-blue-500/15   text-blue-600   dark:text-blue-400',
  SHIPPED:   'bg-purple-500/15 text-purple-600  dark:text-purple-400',
  DELIVERED: 'bg-green-500/15  text-green-600   dark:text-green-400',
  CANCELLED: 'bg-red-500/15    text-red-600     dark:text-red-400',
};

const STATUS_FALLBACK = 'bg-gray-500/15 text-gray-600 dark:text-gray-400';

const StatusPill = ({ status }) => (
  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${STATUS_STYLES[status] ?? STATUS_FALLBACK}`}>
    {status?.replace(/_/g, ' ') ?? 'UNKNOWN'}
  </span>
);

const GSTSellerBlock = () => (
  <div className="px-6 py-3 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-zinc-800/30">
    <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 text-xs font-bold mb-1">
      <CheckCircle2 className="w-3.5 h-3.5" /> GST Invoice Available
    </div>
    <p className="text-gray-500 dark:text-zinc-400 text-xs">
      <span className="font-semibold text-gray-700 dark:text-zinc-300">Seller: </span>{SELLER_NAME}
      <span className="mx-2 text-gray-300 dark:text-zinc-600">·</span>
      <span className="font-semibold text-gray-700 dark:text-zinc-300">GSTIN: </span>
      <span className="font-mono">{SELLER_GSTIN}</span>
    </p>
  </div>
);

const OrderCard = ({ order, onTrack }) => {
  const statusUpper  = order.status?.toUpperCase();
  const canTrack     = ['SHIPPED', 'DELIVERED'].includes(statusUpper);
  const hasTracking  = !!order.tracking_number;
  const showTrackBtn = canTrack && hasTracking;

  const grandTotal    = order.grand_total ?? order.total_amount;
  const totalSaved    = parseFloat(order.discount_amount || 0) + parseFloat(order.upi_discount || 0);
  const hasDiscount   = totalSaved > 0;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 rounded-2xl shadow-sm overflow-hidden">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 dark:border-white/5">
        <div>
          <p className="text-gray-400 dark:text-zinc-500 text-xs font-semibold uppercase tracking-widest">Order #{order.id}</p>
          <p className="text-gray-900 dark:text-zinc-100 font-bold mt-0.5">
            {new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <StatusPill status={order.status} />
          <div className="text-right">
            {hasDiscount && <p className="text-gray-400 dark:text-zinc-500 text-xs line-through">₹{parseFloat(order.total_amount).toFixed(2)}</p>}
            <p className="text-gray-900 dark:text-zinc-100 text-lg font-black">₹{parseFloat(grandTotal).toFixed(2)}</p>
            {hasDiscount && (
              <p className="text-green-600 dark:text-green-400 text-xs font-semibold">
                Saved ₹{totalSaved.toFixed(2)}
                {order.coupon_code && ` (${order.coupon_code})`}
                {parseFloat(order.upi_discount || 0) > 0 && !order.coupon_code && ' (Prepaid)'}
                {parseFloat(order.upi_discount || 0) > 0 && order.coupon_code && ' + Prepaid'}
              </p>
            )}
          </div>
          {showTrackBtn && (
            <button onClick={() => onTrack(order)}
              className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-200 dark:border-blue-500/20 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
              <MapPin className="w-3.5 h-3.5" /> Track Package
            </button>
          )}
        </div>
      </div>

      {hasTracking && (
        <div className="px-6 py-2.5 bg-purple-50/50 dark:bg-purple-500/5 border-b border-purple-100 dark:border-purple-500/10 flex items-center gap-3 flex-wrap">
          {order.courier_name && <span className="text-purple-700 dark:text-purple-400 text-xs font-bold">{order.courier_name}</span>}
          <span className="text-gray-500 dark:text-zinc-400 text-xs font-mono">{order.tracking_number}</span>
          {order.tracking_url && (
            <a href={order.tracking_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-xs">
              Track on courier site <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      <div className="px-6 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {order.items.map(item => (
            <div key={item.id} className="text-sm">
              <p className="text-gray-900 dark:text-zinc-100 font-semibold leading-snug">
                {item.variation?.product_name ?? '—'}
              </p>
              <p className="text-gray-500 dark:text-zinc-400 text-xs mt-0.5">
                {item.quantity} × {item.variation?.size ?? '—'}
                {item.variation?.color_name && (
                  <span className="ml-1 text-gray-400 dark:text-zinc-500">/ {item.variation.color_name}</span>
                )}
              </p>
              <p className="text-accent text-xs font-semibold mt-0.5">₹{parseFloat(item.price).toFixed(2)}/pc</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 py-3 border-t border-gray-100 dark:border-white/5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-gray-400 dark:text-zinc-500 text-xs">
            {order.items.reduce((s, i) => s + i.quantity, 0)} units
            {order.payment_method && ` · ${order.payment_method.replace(/_/g, ' ')}`}
          </p>
          {parseFloat(order.balance_due || 0) > 0 && (
            <span className="text-orange-600 dark:text-orange-400 text-xs font-bold bg-orange-50 dark:bg-orange-400/10 border border-orange-200 dark:border-orange-400/20 px-2 py-0.5 rounded-full">
              Balance Due: ₹{parseFloat(order.balance_due).toFixed(2)}
            </span>
          )}
        </div>
        {order.shipping_address && (
          <p className="text-gray-400 dark:text-zinc-500 text-xs">{order.shipping_address.city}, {order.shipping_address.state}</p>
        )}
      </div>

      <GSTSellerBlock />
    </div>
  );
};

const STATUS_OPTIONS = [
  { value: 'ALL',                  label: 'All Statuses' },
  { value: 'PENDING_VERIFICATION', label: 'Pending Verification' },
  { value: 'PENDING',              label: 'Pending' },
  { value: 'APPROVED',             label: 'Approved' },
  { value: 'SHIPPED',              label: 'Shipped' },
  { value: 'DELIVERED',            label: 'Delivered' },
  { value: 'CANCELLED',            label: 'Cancelled' },
];

const DATE_OPTIONS = [
  { value: 'ALL', label: 'All Time' },
  { value: '30',  label: 'Last 30 days' },
  { value: '90',  label: 'Last 3 months' },
  { value: '180', label: 'Last 6 months' },
];

const OrderHistory = () => {
  const [orders, setOrders]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [trackingOrder, setTrackingOrder] = useState(null);
  const [statusFilter, setStatusFilter]   = useState('ALL');
  const [dateFilter, setDateFilter]       = useState('ALL');

  useEffect(() => {
    api.get('orders/history/')
      .then(res => setOrders(res.data?.results ?? res.data ?? []))
      .catch(err => console.error('Failed to load orders:', err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return orders.filter(order => {
      if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;
      if (dateFilter !== 'ALL') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - parseInt(dateFilter));
        if (new Date(order.created_at) < cutoff) return false;
      }
      return true;
    });
  }, [orders, statusFilter, dateFilter]);

  const selectCls = 'bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-zinc-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-accent transition-colors cursor-pointer';

  return (
    <div className="bg-gray-50 dark:bg-zinc-950 min-h-screen px-4 py-10">
      <Seo
        title="Order History"
        description="Track and review the bulk orders you have placed with Pronoun Jeans."
        canonical="/history"
        noindex
      />
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-gray-900 dark:text-zinc-100 text-3xl font-black">Order History</h1>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mt-1">
            {loading ? '—' : `${orders.length} order${orders.length !== 1 ? 's' : ''} placed`}
          </p>
        </div>

        {!loading && orders.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap mb-6">
            <Filter className="w-4 h-4 text-gray-400 dark:text-zinc-500 shrink-0" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectCls}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className={selectCls}>
              {DATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {(statusFilter !== 'ALL' || dateFilter !== 'ALL') && (
              <button onClick={() => { setStatusFilter('ALL'); setDateFilter('ALL'); }}
                className="text-xs text-accent hover:text-red-700 font-semibold transition-colors">
                Clear filters
              </button>
            )}
            <span className="text-gray-400 dark:text-zinc-500 text-xs ml-auto">
              {filtered.length} of {orders.length} orders
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24"><Loader className="animate-spin text-accent w-9 h-9" /></div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
              <PackageSearch className="w-8 h-8 text-gray-400 dark:text-zinc-600" />
            </div>
            <p className="text-gray-900 dark:text-zinc-100 font-bold text-lg">No orders yet</p>
            <p className="text-gray-500 dark:text-zinc-400 text-sm">Your placed orders will appear here.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
              <Filter className="w-8 h-8 text-gray-400 dark:text-zinc-600" />
            </div>
            <p className="text-gray-900 dark:text-zinc-100 font-bold text-lg">No orders match your filters</p>
            <button onClick={() => { setStatusFilter('ALL'); setDateFilter('ALL'); }}
              className="text-accent hover:text-red-700 text-sm font-semibold transition-colors">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {filtered.map(order => <OrderCard key={order.id} order={order} onTrack={setTrackingOrder} />)}
          </div>
        )}
      </div>

      <TrackingTimelineModal order={trackingOrder} isOpen={!!trackingOrder} onClose={() => setTrackingOrder(null)} />
    </div>
  );
};

export default OrderHistory;