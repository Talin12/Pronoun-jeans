import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Package, FolderTree, Ruler, Tags, Images, Users, LogOut,
  ExternalLink, X, ShoppingBag, ShoppingCart, Ticket, Film,
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { getOrderStats } from '../../api/adminApi';

// Grouped by what the admin is doing: selling (orders, carts), then the
// catalogue, then the shop's own furniture. Orders leads because it is the only
// section where something waits on a person.
const NAV_GROUPS = [
  { heading: null, items: [
    { to: '/admin', end: true, icon: LayoutDashboard, label: 'Dashboard' },
  ]},
  { heading: 'Selling', items: [
    { to: '/admin/orders',  icon: ShoppingBag,  label: 'Orders', badge: 'orders' },
    { to: '/admin/carts',   icon: ShoppingCart, label: 'Live Carts' },
    { to: '/admin/coupons', icon: Ticket,       label: 'Coupons' },
  ]},
  { heading: 'Catalogue', items: [
    { to: '/admin/products',   icon: Package,    label: 'Products' },
    { to: '/admin/categories', icon: FolderTree, label: 'Categories' },
    { to: '/admin/size-sets',  icon: Ruler,      label: 'Size Sets' },
    { to: '/admin/attributes', icon: Tags,       label: 'Attributes' },
    { to: '/admin/media',      icon: Images,     label: 'Media Library' },
  ]},
  { heading: 'Storefront', items: [
    { to: '/admin/hero-slides', icon: Film,  label: 'Hero Slides' },
    { to: '/admin/users',       icon: Users, label: 'Users' },
  ]},
];

const AdminSidebar = ({ onClose }) => {
  const { user, logout } = useAuthStore();
  // Orders awaiting payment verification. Fetched once per mount: it is a
  // nudge, not a live counter, and a poll here would run on every admin page.
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    getOrderStats()
      .then(s => setWaiting(s.awaiting_verification || 0))
      .catch(() => setWaiting(0));
  }, []);

  return (
    <aside className="flex flex-col h-full bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-white/5 w-60 shrink-0">
      <div className="flex items-start justify-between px-5 py-5 border-b border-gray-100 dark:border-white/5">
        <div>
          <span className="text-xl font-black tracking-tighter text-gray-900 dark:text-zinc-100">
            PRONOUN<span className="text-accent">.</span>
          </span>
          <p className="text-xs text-accent font-bold uppercase tracking-widest mt-1.5">Admin Panel</p>
        </div>
        {/* Only rendered in the mobile drawer, which is the only caller passing onClose. */}
        {onClose && (
          <button onClick={onClose} aria-label="Close menu"
            className="lg:hidden p-2 -mr-2 -mt-1 text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="px-5 py-4 border-b border-gray-100 dark:border-white/5">
        <p className="text-xs text-gray-400 dark:text-zinc-500 leading-none mb-0.5">Signed in as</p>
        <p className="text-sm font-bold text-gray-900 dark:text-zinc-100 truncate">{user?.email || 'Admin'}</p>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {NAV_GROUPS.map(({ heading, items }, i) => (
          <div key={heading || 'top'} className={i ? 'mt-5' : ''}>
            {heading && (
              <p className="px-3 mb-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-600">
                {heading}
              </p>
            )}
            <div className="space-y-0.5">
              {items.map(({ to, end, icon: Icon, label, badge }) => (
                <NavLink key={to} to={to} end={end} onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-red-50 dark:bg-accent/10 text-accent'
                        : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                  {badge === 'orders' && waiting > 0 && (
                    <span className="ml-auto min-w-[20px] text-center text-[11px] font-black px-1.5 py-0.5 rounded-full bg-accent text-white">
                      {waiting}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-100 dark:border-white/5 space-y-0.5">
        <a href="/" className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-white/5">
          <ExternalLink className="w-4 h-4 shrink-0" /> View storefront
        </a>
        <button onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
          <LogOut className="w-4 h-4 shrink-0" /> Sign Out
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
