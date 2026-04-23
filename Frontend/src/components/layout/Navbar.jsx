import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { ShoppingBag, LogOut } from 'lucide-react';
import ThemeToggle from '../ui/ThemeToggle';

const Navbar = () => {
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <nav className="border-b border-[var(--color-border)] bg-[var(--color-primary)]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link to="/" className="text-2xl font-black tracking-tighter text-[var(--color-text-main)]">
          PRONOUN<span className="text-accent">.</span>
        </Link>

        <div className="flex items-center gap-8">
          <Link to="/catalog" className="text-sm font-medium text-[var(--color-text-muted)] hover:text-accent transition-colors">Catalog</Link>
          <Link to="/history" className="text-sm font-medium text-[var(--color-text-muted)] hover:text-accent transition-colors">Orders</Link>
          {isAuthenticated && (
            <Link to="/dashboard" className="text-sm font-medium text-[var(--color-text-muted)] hover:text-accent transition-colors">Dashboard</Link>
          )}

          <div className="flex items-center gap-3 ml-4">
            <Link to="/cart" className="relative p-2 hover:bg-[var(--color-secondary)] rounded-full transition-all text-[var(--color-text-main)]">
              <ShoppingBag size={22} />
            </Link>

            <ThemeToggle />

            {isAuthenticated ? (
              <div className="flex items-center gap-4 pl-4 border-l border-[var(--color-border)]">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-[var(--color-text-muted)] leading-none">Logged in as</p>
                  <p className="text-sm font-bold text-[var(--color-text-main)]">{user?.company_name || 'Partner'}</p>
                </div>
                <button
                  onClick={logout}
                  className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-all"
                >
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="bg-accent hover:bg-accent/85 text-white px-5 py-2 rounded-full text-sm font-bold transition-colors"
              >
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