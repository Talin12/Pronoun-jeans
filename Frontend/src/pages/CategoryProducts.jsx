// Frontend/src/pages/CategoryProducts.jsx

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Loader, BadgeCheck } from 'lucide-react';
import api from '../api/axios';

const BACKEND_URL = 'http://localhost:8000';

const CategoryProducts = () => {
  const { category_slug } = useParams();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryName, setCategoryName] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get(`products/catalog/?category=${category_slug}`)
      .then(res => {
        const data = res.data.results || res.data || [];
        setProducts(data);
        if (data.length > 0) setCategoryName(data[0].category_name);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [category_slug]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-primary">
      <Loader className="animate-spin text-accent w-10 h-10" />
    </div>
  );

  return (
    <div className="p-10 bg-primary min-h-screen">
      {/* Header */}
      <div className="mb-10">
        <button
          onClick={() => navigate('/catalog')}
          className="flex items-center gap-2 text-accent hover:text-white transition-colors mb-6 text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Collections
        </button>
        <div className="flex items-center gap-2 mb-2">
          <Package className="text-accent w-5 h-5" />
          <span className="text-accent text-xs font-bold uppercase tracking-widest">
            {categoryName || category_slug}
          </span>
        </div>
        <h1 className="text-white text-4xl font-bold">
          {categoryName || 'Products'}
        </h1>
        <p className="text-gray-400 mt-2">{products.length} product{products.length !== 1 ? 's' : ''} available</p>
      </div>

      {/* Products Grid */}
      {products.length === 0 ? (
        <div className="text-center py-20">
          <Package className="text-gray-600 w-16 h-16 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">No products found in this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((product) => (
            <div
              key={product.id}
              className="group bg-secondary rounded-2xl overflow-hidden border border-white/5 hover:border-accent/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
            >
              {/* Image */}
              <div className="h-64 overflow-hidden relative">
                <img
                  src={
                    product.image
                      ? product.image.startsWith('http')
                        ? product.image
                        : `${BACKEND_URL}${product.image}`
                      : 'https://via.placeholder.com/400x300?text=No+Image'
                  }
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  onError={(e) => { e.target.src = 'https://via.placeholder.com/400x300?text=No+Image'; }}
                />
                {/* MOQ Badge */}
                <div className="absolute top-3 right-3 bg-accent/90 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                  <BadgeCheck className="w-3 h-3" />
                  MOQ: {product.moq}
                </div>
              </div>

              {/* Info */}
              <div className="p-5">
                <p className="text-accent text-xs font-bold uppercase tracking-widest mb-1">
                  {product.category_name}
                </p>
                <h3 className="text-white font-bold text-lg leading-snug mb-3 line-clamp-2">
                  {product.name}
                </h3>

                {/* Variation count */}
                <p className="text-gray-400 text-sm mb-4">
                  {product.variations.length} variation{product.variations.length !== 1 ? 's' : ''} available
                </p>

                <button
                  onClick={() => navigate(`/product/${product.slug}`)}
                  className="w-full bg-accent hover:bg-accent/80 text-white font-semibold py-2.5 rounded-xl transition-colors duration-200 text-sm"
                >
                  View Variations
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CategoryProducts;