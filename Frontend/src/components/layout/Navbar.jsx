import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { ShoppingBag, User, LogOut } from 'lucide-react';

const Navbar = () => {
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <nav className="border-b border-white/5 bg-primary/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link to="/" className="text-2xl font-black tracking-tighter">PRONOUN<span className="text-accent">.</span></Link>
        
        <div className="flex items-center gap-8">
          <Link to="/catalog" className="text-sm font-medium hover:text-accent transition-colors">Catalog</Link>
          <Link to="/history" className="text-sm font-medium hover:text-accent transition-colors">Orders</Link>
          
          <div className="flex items-center gap-4 ml-4">
            <Link to="/cart" className="relative p-2 hover:bg-white/5 rounded-full transition-all">
              <ShoppingBag size={22} />
            </Link>
            
            {isAuthenticated ? (
              <div className="flex items-center gap-4 pl-4 border-l border-white/10">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-textMuted leading-none">Logged in as</p>
                  <p className="text-sm font-bold">{user?.company_name || 'Partner'}</p>
                </div>
                <button onClick={logout} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-all">
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <button onClick={() => navigate('/login')} className="bg-white text-primary px-5 py-2 rounded-full text-sm font-bold">Login</button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;