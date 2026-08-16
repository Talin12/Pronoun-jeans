import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, FolderTree, Plus, Loader } from 'lucide-react';
import { listProducts, listCategories } from '../../api/adminApi';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([listProducts({ page: 1 }), listCategories()])
      .then(([p, cats]) => setStats({ products: p.count || 0, categories: cats.length }))
      .catch(() => setStats({ products: 0, categories: 0 }));
  }, []);

  const Tile = ({ icon: Icon, label, value, onClick }) => (
    <button onClick={onClick}
      className="text-left bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-5 hover:shadow-md transition">
      <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-3"><Icon size={20} /></div>
      <p className="text-2xl font-black text-gray-900 dark:text-zinc-100">{value}</p>
      <p className="text-sm text-gray-500 dark:text-zinc-400">{label}</p>
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
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            <Tile icon={Package} label="Products" value={stats.products} onClick={() => navigate('/admin/products')} />
            <Tile icon={FolderTree} label="Categories" value={stats.categories} onClick={() => navigate('/admin/categories')} />
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
