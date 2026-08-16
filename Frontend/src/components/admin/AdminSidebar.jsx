import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, FolderTree, LogOut, ExternalLink } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

const NAV_ITEMS = [
  { to: '/admin',            end: true, icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/admin/products',              icon: Package,         label: 'Products'   },
  { to: '/admin/categories',            icon: FolderTree,      label: 'Categories' },
];

const AdminSidebar = ({ onClose }) => {
  const { user, logout } = useAuthStore();

  return (
    <aside className="flex flex-col h-full bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-white/5 w-60 shrink-0">
      <div className="px-5 py-5 border-b border-gray-100 dark:border-white/5">
        <span className="text-xl font-black tracking-tighter text-gray-900 dark:text-zinc-100">
          PRONOUN<span className="text-accent">.</span>
        </span>
        <p className="text-xs text-accent font-bold uppercase tracking-widest mt-1.5">Admin Panel</p>
      </div>

      <div className="px-5 py-4 border-b border-gray-100 dark:border-white/5">
        <p className="text-xs text-gray-400 dark:text-zinc-500 leading-none mb-0.5">Signed in as</p>
        <p className="text-sm font-bold text-gray-900 dark:text-zinc-100 truncate">{user?.email || 'Admin'}</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, end, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={end} onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-red-50 dark:bg-accent/10 text-accent'
                  : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}>
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
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
