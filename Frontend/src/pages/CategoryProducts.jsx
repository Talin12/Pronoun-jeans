import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Package, Loader, BadgeCheck, Search, X, Lock } from 'lucide-react';
import api from '../api/axios';
import { useAuthStore } from '../store/useAuthStore';
import ResponsiveImage from '../components/shared/ResponsiveImage';
import Seo from '../components/seo/Seo';
import JsonLd from '../components/seo/JsonLd';
import { categoryItemListSchema, breadcrumbSchema } from '../config/schema';
import { usePrerenderReady } from '../hooks/usePrerenderReady';

const CategoryProducts = () => {
  const { category_slug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuthStore();

  const [products, setProducts]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [categoryName, setCategoryName]   = useState('');
  const [subcategories, setSubcategories] = useState([]);
  const [activeSubcategory, setActiveSubcategory] = useState(searchParams.get('subcategory') || '');
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchInput, setSearchInput]     = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    api.get(`products/categories/${category_slug}/`)
      .then(res => {
        setCategoryName(res.data.name);
        setSubcategories(res.data.subcategories || []);
      })
      .catch(() => {});
  }, [category_slug]);

  const fetchProducts = useCallback((search = '', subcategory = '') => {
    setLoading(true);
    const params = new URLSearchParams({ category: category_slug });
    if (search) params.append('search', search);
    if (subcategory) params.append('subcategory', subcategory);
    api.get(`products/catalog/?${params.toString()}`)
      .then(res => {
        const data = res.data.results || res.data || [];
        setProducts(data);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [category_slug]);

  useEffect(() => {
    const initialSubcategory = searchParams.get('subcategory') || '';
    setProducts([]); setSearchInput(''); setSearchQuery(''); setActiveSubcategory(initialSubcategory);
    fetchProducts('', initialSubcategory);
  }, [category_slug]);

  const handleSubcategoryClick = (slug) => {
    setActiveSubcategory(slug);
    setSearchParams(slug ? { subcategory: slug } : {});
    fetchProducts(searchQuery, slug);
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearchQuery(value); fetchProducts(value, activeSubcategory); }, 300);
  };

  const clearSearch = () => { setSearchInput(''); setSearchQuery(''); fetchProducts('', activeSubcategory); };

  // Both the category name and its products are on screen, and both arrive
  // from separate requests, so neither alone is enough to snapshot on.
  usePrerenderReady(Boolean(categoryName) && !loading);

  return (
    <div className="p-10 bg-gray-50 dark:bg-zinc-950 min-h-screen">
      {/* The title depends on a name that arrives over the network, so this URL
          spends its first moments without one. The generic card below covers
          that window; the real one replaces it as soon as the category
          resolves. Both canonicalise to the bare category path — the
          ?subcategory= filter is the same set of products, not a new page. */}
      {categoryName ? (
        <Seo
          title={`${categoryName} — Wholesale ${categoryName} Manufacturer`}
          description={`Wholesale ${categoryName.toLowerCase()} from Pronoun Jeans, a B2B denim manufacturer in Ahmedabad. Bulk size sets, MOQ pricing and pan-India dispatch for retailers.`}
          canonical={`/catalog/${category_slug}`}
        >
          <JsonLd data={categoryItemListSchema({ name: categoryName, slug: category_slug, products })} />
          <JsonLd data={breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Catalogue', path: '/catalog' },
            { name: categoryName, path: `/catalog/${category_slug}` },
          ])} />
        </Seo>
      ) : (
        <Seo
          title="Wholesale Denim Catalogue — Bulk Jeans & Bottomwear"
          description="Browse wholesale men's jeans, cargos and joggers from Pronoun Jeans, Ahmedabad. Bulk orders in ready size sets, with MOQ pricing for verified B2B buyers."
          canonical={`/catalog/${category_slug}`}
        />
      )}
      <div className="mb-10">
        <button onClick={() => navigate('/catalog')}
          className="flex items-center gap-2 text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-6 text-sm font-semibold">
          <ArrowLeft className="w-4 h-4" /> Back to Collections
        </button>
        <div className="flex items-center gap-2 mb-2">
          <Package className="text-accent w-5 h-5" />
          <span className="text-accent text-xs font-bold uppercase tracking-widest">{categoryName || category_slug}</span>
        </div>
        <h1 className="text-gray-900 dark:text-zinc-100 text-4xl font-bold">{categoryName || 'Products'}</h1>
        <p className="text-gray-500 dark:text-zinc-400 mt-2">{products.length} product{products.length !== 1 ? 's' : ''} available</p>
      </div>

      {subcategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => handleSubcategoryClick('')}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
              !activeSubcategory
                ? 'bg-accent text-white border-accent'
                : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-zinc-300 border-gray-200 dark:border-white/10 hover:border-accent/40'
            }`}
          >
            All
          </button>
          {subcategories.map((sub) => (
            <button
              key={sub.id}
              onClick={() => handleSubcategoryClick(sub.slug)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                activeSubcategory === sub.slug
                  ? 'bg-accent text-white border-accent'
                  : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-zinc-300 border-gray-200 dark:border-white/10 hover:border-accent/40'
              }`}
            >
              {sub.name}
            </button>
          ))}
        </div>
      )}

      <div className="relative mb-8 max-w-lg">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500 pointer-events-none" />
        <input type="text" value={searchInput} onChange={handleSearchChange} placeholder="Search by name or SKU…"
          className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 rounded-xl pl-11 pr-10 py-3 text-sm focus:outline-none focus:border-accent/50 transition-colors shadow-sm" />
        {searchInput && (
          <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-28"><Loader className="animate-spin text-accent w-10 h-10" /></div>
      ) : products.length === 0 ? (
        <div className="text-center py-20">
          <Package className="text-gray-300 dark:text-zinc-700 w-16 h-16 mx-auto mb-4" />
          {searchQuery ? (
            <>
              <p className="text-gray-500 dark:text-zinc-400 text-lg">No products found matching <span className="text-gray-900 dark:text-zinc-200 font-semibold">"{searchQuery}"</span></p>
              <button onClick={clearSearch} className="mt-4 text-accent text-sm hover:underline">Clear search</button>
            </>
          ) : (
            <p className="text-gray-500 dark:text-zinc-400 text-lg">No products found in this category.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((product) => (
            // `block` keeps the anchor laid out exactly as the div was; the
            // card holds nothing else interactive, so it can be one link.
            <Link key={product.id} to={`/product/${product.slug}`}
              className="group block bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden border border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/20 hover:shadow-md transition-all duration-300 hover:-translate-y-1 cursor-pointer">
              <div className="h-64 overflow-hidden relative bg-gray-100 dark:bg-zinc-900">
                {product.image ? (
                  <ResponsiveImage src={product.image} alt={product.name}
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-16 h-16 text-gray-300 dark:text-zinc-700" />
                  </div>
                )}
                {isAuthenticated ? (
                  <div className="absolute top-3 right-3 bg-white/90 dark:bg-zinc-900/80 backdrop-blur-sm text-gray-700 dark:text-zinc-300 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 border border-gray-200 dark:border-white/10">
                    <BadgeCheck className="w-3 h-3" /> MOQ: {product.moq}
                  </div>
                ) : (
                  <div className="absolute top-3 right-3 bg-white/90 dark:bg-zinc-900/80 backdrop-blur-sm text-gray-400 dark:text-zinc-500 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 border border-gray-200 dark:border-white/10">
                    <Lock className="w-3 h-3" /> Login for pricing
                  </div>
                )}
              </div>
              <div className="p-5">
                <p className="text-accent text-xs font-bold uppercase tracking-widest mb-1">{product.category_name || 'UNCATEGORIZED'}</p>
                <h3 className="text-gray-900 dark:text-zinc-100 font-bold text-lg leading-snug mb-3 line-clamp-2">{product.name}</h3>
                <p className="text-gray-500 dark:text-zinc-500 text-sm mb-4">{product.variations.length} variation{product.variations.length !== 1 ? 's' : ''} available</p>
                <div className="w-full bg-accent hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition-colors duration-200 text-sm text-center">
                  {isAuthenticated ? 'View Variations' : 'View Product'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default CategoryProducts;