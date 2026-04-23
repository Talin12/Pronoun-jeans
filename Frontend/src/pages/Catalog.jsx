import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tag, ArrowRight, Loader } from 'lucide-react';
import api from '../api/axios';

const Catalog = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('products/categories/')
      .then(res => setCategories(res.data.results || res.data || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-primary">
      <Loader className="animate-spin text-accent w-10 h-10" />
    </div>
  );

  return (
    <div className="p-10 bg-primary min-h-screen">
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-2">
          <Tag className="text-accent w-5 h-5" />
          <span className="text-accent text-xs font-bold uppercase tracking-widest">Shop by Category</span>
        </div>
        <h1 className="text-white text-4xl font-bold">Our Collections</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {categories.map((category) => (
          <div
            key={category.id}
            onClick={() => navigate(`/catalog/${category.slug}`)}
            className="group relative bg-secondary rounded-2xl overflow-hidden border border-white/5 cursor-pointer hover:border-accent/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
          >
            <div className="h-72 overflow-hidden bg-secondary">
              {category.image ? (
                <img
                  src={category.image}
                  alt={category.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Tag className="w-16 h-16 text-gray-700" />
                </div>
              )}
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

            <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end justify-between">
              <div>
                <p className="text-accent text-xs font-bold uppercase tracking-widest mb-1">Collection</p>
                <h2 className="text-white text-2xl font-bold">{category.name}</h2>
              </div>
              <div className="bg-accent rounded-full p-2 group-hover:scale-110 transition-transform duration-300">
                <ArrowRight className="text-white w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Catalog;