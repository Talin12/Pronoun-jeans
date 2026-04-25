import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Loader, BadgeCheck, Search, X, Lock } from 'lucide-react';
import api from '../api/axios';
import { useAuthStore } from '../store/useAuthStore';

const CategoryProducts = () => {
  const { category_slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [products, setProducts]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [categoryName, setCategoryName] = useState('');
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchInput, setSearchInput]   = useState('');
  const debounceRef = useRef(null);

  const fetchProducts = useCallback((search = '') => {
    setLoading(true);
    const params = new URLSearchParams({ category: category_slug });
    if (search) params.append('search', search);
    api.get(`products/catalog/?${params.toString()}`)
      .then(res => {
        const data = res.data.results || res.data || [];
        setProducts(data);
        if (data.length > 0 && !categoryName) setCategoryName(data[0].category_name);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [category_slug]);

  useEffect(() => {
    setProducts([]);
    setCategoryName('');
    setSearchInput('');
    setSearchQuery('');
    fetchProducts('');
  }, [category_slug]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(value);
      fetchProducts(value);
    }, 300);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
    fetchProducts('');
  };

  return (
    <div className="p-10 bg-gray-50 dark:bg-zinc-950 min-h-screen">
      <div className="mb-10">
        <button
          onClick={() => navigate('/catalog')}
          className="flex items-center gap-2 text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-6 text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Collections
        </button>

        <div className="flex items-center gap-2 mb-2">
          <Package className="text-accent w-5 h-5" />
          <span className="text-accent text-xs font-bold uppercase tracking-widest">
            {categoryName || category_slug}
          </span>
        </div>
        <h1 className="text-gray-900 dark:text-zinc-100 text-4xl font-bold">
          {categoryName || 'Products'}
        </h1>
        <p className="text-gray-500 dark:text-zinc-400 mt-2">
          {products.length} product{products.length !== 1 ? 's' : ''} available
        </p>
      </div>

      <div className="relative mb-8 max-w-lg">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500 pointer-events-none" />
        <input
          type="text"
          value={searchInput}
          onChange={handleSearchChange}
          placeholder="Search by name or SKU…"
          className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 rounded-xl pl-11 pr-10 py-3 text-sm focus:outline-none focus:border-accent/50 transition-colors shadow-sm"
        />
        {searchInput && (
          <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-28">
          <Loader className="animate-spin text-accent w-10 h-10" />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20">
          <Package className="text-gray-300 dark:text-zinc-700 w-16 h-16 mx-auto mb-4" />
          {searchQuery ? (
            <>
              <p className="text-gray-500 dark:text-zinc-400 text-lg">
                No products found matching <span className="text-gray-900 dark:text-zinc-200 font-semibold">"{searchQuery}"</span>
              </p>
              <button onClick={clearSearch} className="mt-4 text-accent text-sm hover:underline">Clear search</button>
            </>
          ) : (
            <p className="text-gray-500 dark:text-zinc-400 text-lg">No products found in this category.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((product) => (
            <div
              key={product.id}
              onClick={() => navigate(`/product/${product.slug}`)}
              className="group bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden border border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/20 hover:shadow-md transition-all duration-300 hover:-translate-y-1 cursor-pointer"
            >
              <div className="h-64 overflow-hidden relative bg-gray-100 dark:bg-zinc-900">
                {product.image ? (
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-16 h-16 text-gray-300 dark:text-zinc-700" />
                  </div>
                )}

                {/* MOQ badge — only shown when logged in */}
                {isAuthenticated ? (
                  <div className="absolute top-3 right-3 bg-white/90 dark:bg-zinc-900/80 backdrop-blur-sm text-gray-700 dark:text-zinc-300 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 border border-gray-200 dark:border-white/10">
                    <BadgeCheck className="w-3 h-3" />
                    MOQ: {product.moq}
                  </div>
                ) : (
                  <div className="absolute top-3 right-3 bg-white/90 dark:bg-zinc-900/80 backdrop-blur-sm text-gray-400 dark:text-zinc-500 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 border border-gray-200 dark:border-white/10">
                    <Lock className="w-3 h-3" />
                    Login for pricing
                  </div>
                )}
              </div>

              <div className="p-5">
                <p className="text-accent text-xs font-bold uppercase tracking-widest mb-1">
                  {product.category_name || 'UNCATEGORIZED'}
                </p>
                <h3 className="text-gray-900 dark:text-zinc-100 font-bold text-lg leading-snug mb-3 line-clamp-2">
                  {product.name}
                </h3>
                <p className="text-gray-500 dark:text-zinc-500 text-sm mb-4">
                  {product.variations.length} variation{product.variations.length !== 1 ? 's' : ''} available
                </p>
                <div className="w-full bg-accent hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition-colors duration-200 text-sm text-center">
                  {isAuthenticated ? 'View Variations' : 'View Product'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CategoryProducts;