import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, FolderTree, Plus, Loader, ShoppingBag, ShoppingCart, AlertTriangle,
} from 'lucide-react';
import {
  listProducts, listCategories, getOrderStats, listCarts,
} from '../../api/adminApi';
import { money } from './orderPresentation';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // One tile failing should not blank the board — each source falls back to a
    // zero rather than rejecting the whole set.
    Promise.all([
      listProducts({ page: 1 }).catch(() => ({ count: 0 })),
      listCategories().catch(() => []),
      getOrderStats().catch(() => ({ total: 0, awaiting_verification: 0, revenue_settled: '0' })),
      listCarts({ page: 1 }).catch(() => ({ count: 0 })),
    ]).then(([p, cats, orders, carts]) => setStats({
      products:   p.count || 0,
      categories: cats.length,
      orders:     orders.total || 0,
      awaiting:   orders.awaiting_verification || 0,
      revenue:    orders.revenue_settled || '0',
      carts:      carts.count || 0,
    }));
  }, []);

  const Tile = ({ icon: Icon, label, value, sub, onClick, tone }) => (
    <button onClick={onClick}
      className="text-left bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-5 hover:shadow-md transition">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
        tone || 'bg-accent/10 text-accent'}`}>
        <Icon size={20} />
      </div>
      <p className="text-2xl font-black text-gray-900 dark:text-zinc-100">{value}</p>
      <p className="text-sm text-gray-500 dark:text-zinc-400">{label}</p>
      {sub && <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mt-1">{sub}</p>}
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <p className="text-accent text-xs font-black uppercase tracking-widest mb-1">Admin Panel</p>
      <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100 mb-6">Dashboard</h1>

      {!stats ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader className="animate-spin" /></div>
      ) : (
        <>
          {/* Surfaced above the tiles because it is the one thing here that is
              actually waiting on a person. */}
          {stats.awaiting > 0 && (
            <button onClick={() => navigate('/admin/orders')}
              className="w-full text-left flex items-start gap-3 px-4 py-3 mb-4 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 hover:brightness-105 transition">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {stats.awaiting} order{stats.awaiting !== 1 ? 's are' : ' is'} waiting on a payment check.
              </p>
            </button>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <Tile icon={ShoppingBag} label="Orders" value={stats.orders}
              sub={stats.awaiting ? `${stats.awaiting} to verify` : null}
              onClick={() => navigate('/admin/orders')} />
            <Tile icon={ShoppingCart} label="Live carts" value={stats.carts}
              onClick={() => navigate('/admin/carts')} />
            <Tile icon={Package} label="Settled revenue" value={money(stats.revenue)}
              tone="bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400"
              onClick={() => navigate('/admin/orders')} />
            <Tile icon={Package} label="Products" value={stats.products}
              onClick={() => navigate('/admin/products')} />
            <Tile icon={FolderTree} label="Categories" value={stats.categories}
              onClick={() => navigate('/admin/categories')} />
          </div>

          <button onClick={() => navigate('/admin/products/new')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition shadow-sm">
            <Plus size={18} /> Upload New Product
          </button>
        </>
      )}
    </div>
  );
}
