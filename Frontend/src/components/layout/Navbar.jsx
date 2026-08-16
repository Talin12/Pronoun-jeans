import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useCartStore } from '../../store/useCartStore';
import { ShoppingBag, LogOut, Menu, X } from 'lucide-react';
import ThemeToggle from '../ui/ThemeToggle';

const Navbar = () => {
  const { isAuthenticated, isSuperuser, user, logout, impersonatedBuyer, clearImpersonatedBuyer } = useAuthStore();
  const { cartCount, cartTotal, fetchCart } = useCartStore();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleExitImpersonation = () => {
    clearImpersonatedBuyer();
    navigate('/agent');
  };

  useEffect(() => {
    if (isAuthenticated) fetchCart();
  }, [isAuthenticated]);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const navLinks = [
    { to: '/about',     label: 'About Us' },
    { to: '/catalog',   label: 'Catalog'  },
    { to: '/history',   label: 'Orders'   },
    ...(isAuthenticated ? [{ to: '/dashboard', label: 'Dashboard' }] : []),
    ...(isSuperuser ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <div className="sticky top-0 z-50">
      {impersonatedBuyer && (
        <div className="bg-amber-400 text-amber-950 px-4 py-2 flex items-center justify-between gap-4 text-sm font-bold">
          <span className="flex items-center gap-2 truncate">
            ⚠️ ORDERING ON BEHALF OF:&nbsp;
            <span className="uppercase tracking-wide">{impersonatedBuyer.full_name || 'Buyer'}</span>
            {impersonatedBuyer.company_name && (
              <span className="font-normal opacity-75">— {impersonatedBuyer.company_name}</span>
            )}
          </span>
          <button
            onClick={handleExitImpersonation}
            className="shrink-0 bg-amber-950/15 hover:bg-amber-950/30 text-amber-950 text-xs font-black px-3 py-1 rounded-full transition-colors whitespace-nowrap"
          >
            ✕ Exit Mode
          </button>
        </div>
      )}
    <nav className="bg-white dark:bg-zinc-950 border-b border-gray-200 dark:border-white/5 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">

        {/* Logo */}
        <Link to="/" className="flex items-center">
          <img
            src="https://res.cloudinary.com/dvs95yf9s/image/upload/v1779774242/Screenshot_2026-05-26_at_11.12.34_AM-removebg-preview_ukte3f.png"
            alt="Pronoun Jeans"
            className="h-12 w-auto dark:[filter:brightness(0)_invert(1)]"
          />
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map(({ to, label }) => (
            <Link key={to} to={to}
              className="text-sm font-medium text-gray-500 dark:text-zinc-400 hover:text-accent dark:hover:text-accent transition-colors">
              {label}
            </Link>
          ))}
        </div>

        {/* Desktop right actions */}
        <div className="hidden md:flex items-center gap-3">
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

        {/* Mobile right — cart badge + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          <Link to="/cart" className="relative p-2 text-gray-700 dark:text-zinc-300">
            <ShoppingBag size={22} />
            {isAuthenticated && cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-accent text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center leading-none">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </Link>
          <ThemeToggle />
          <button onClick={() => setMenuOpen(o => !o)} className="p-2 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-white/5 bg-white dark:bg-zinc-950">
          <div className="px-6 py-4 space-y-1">
            {navLinks.map(({ to, label }) => (
              <Link key={to} to={to}
                className="flex items-center w-full px-3 py-3 text-sm font-semibold text-gray-700 dark:text-zinc-300 hover:text-accent hover:bg-gray-50 dark:hover:bg-zinc-900 rounded-xl transition-colors">
                {label}
              </Link>
            ))}

            <div className="border-t border-gray-100 dark:border-white/5 pt-3 mt-3 space-y-1">
              {isAuthenticated ? (
                <>
                  <div className="px-3 py-2">
                    <p className="text-xs text-gray-400 dark:text-zinc-500">Logged in as</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">{user?.company_name || 'Partner'}</p>
                    {cartTotal > 0 && (
                      <p className="text-xs text-accent font-semibold mt-0.5">
                        Cart: ₹{cartTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                  <button onClick={() => { logout(); setMenuOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-3 text-sm font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors">
                    <LogOut size={16} /> Sign Out
                  </button>
                </>
              ) : (
                <button onClick={() => { navigate('/login'); setMenuOpen(false); }}
                  className="w-full bg-accent hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm transition-colors">
                  Login
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
    </div>
  );
};

export default Navbar;