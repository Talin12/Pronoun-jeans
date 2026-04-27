import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useCartStore } from '../../store/useCartStore';
import { ShoppingBag, LogOut } from 'lucide-react';
import ThemeToggle from '../ui/ThemeToggle';

const Navbar = () => {
  const { isAuthenticated, user, logout } = useAuthStore();
  const { cartCount, cartTotal, fetchCart } = useCartStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) fetchCart();
  }, [isAuthenticated]);

  return (
    <nav className="bg-white dark:bg-zinc-950 border-b border-gray-200 dark:border-white/5 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link to="/" className="text-2xl font-black tracking-tighter text-gray-900 dark:text-zinc-100">
          PRONOUN<span className="text-accent">.</span>
        </Link>

        <div className="flex items-center gap-8">
          <Link to="/about"   className="text-sm font-medium text-gray-500 dark:text-zinc-400 hover:text-accent dark:hover:text-accent transition-colors">About Us</Link>
          <Link to="/catalog" className="text-sm font-medium text-gray-500 dark:text-zinc-400 hover:text-accent dark:hover:text-accent transition-colors">Catalog</Link>
          <Link to="/history" className="text-sm font-medium text-gray-500 dark:text-zinc-400 hover:text-accent dark:hover:text-accent transition-colors">Orders</Link>
          {isAuthenticated && (
            <Link to="/dashboard" className="text-sm font-medium text-gray-500 dark:text-zinc-400 hover:text-accent dark:hover:text-accent transition-colors">Dashboard</Link>
          )}

          <div className="flex items-center gap-3 ml-4">

            {/* Cart icon with badge + total */}
            <Link to="/cart" className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-xl px-3 py-2 transition-all group">
              <div className="relative">
                <ShoppingBag size={22} className="text-gray-700 dark:text-zinc-300 group-hover:text-accent transition-colors" />
                {isAuthenticated && cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-accent text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center leading-none">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </div>
              {isAuthenticated && cartTotal > 0 && (
                <span className="text-sm font-bold text-gray-900 dark:text-zinc-100 hidden sm:block">
                  ₹{cartTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </Link>

            <ThemeToggle />

            {isAuthenticated ? (
              <div className="flex items-center gap-4 pl-4 border-l border-gray-200 dark:border-white/10">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-gray-400 dark:text-zinc-500 leading-none">Logged in as</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">{user?.company_name || 'Partner'}</p>
                </div>
                <button onClick={logout} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-all">
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <button onClick={() => navigate('/login')} className="bg-accent hover:bg-red-700 text-white px-5 py-2 rounded-full text-sm font-bold transition-colors">
                Login
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;