import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag, ArrowRight, Loader } from 'lucide-react';
import api from '../api/axios';
import ResponsiveImage from '../components/shared/ResponsiveImage';
import Seo from '../components/seo/Seo';
import JsonLd from '../components/seo/JsonLd';
import { catalogPageSchema, breadcrumbSchema } from '../config/schema';
import { usePrerenderReady } from '../hooks/usePrerenderReady';
import BootstrapData from '../lib/BootstrapData';
import { readBootstrap } from '../lib/bootstrap';

const BOOTSTRAP = readBootstrap('catalog');

const Catalog = () => {
  // Same reason as the category page: without this the whole grid is replaced
  // by a full-screen spinner on boot while it re-fetches what was already there.
  const [categories, setCategories] = useState(BOOTSTRAP?.categories ?? []);
  const [loading, setLoading]       = useState(!BOOTSTRAP);

  useEffect(() => {
    api.get('products/categories/')
      .then(res => setCategories(res.data.results || res.data || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  usePrerenderReady(!loading);

  // Held in a variable rather than written twice: the categories are fetched
  // client-side, so the spinner below is a real, crawlable state of this URL
  // and it must not be a page without a title.
  const seo = (
    <Seo
      title="Wholesale Denim Catalogue — Bulk Jeans & Bottomwear"
      description="Browse the Pronoun Jeans wholesale catalogue: men's jeans, cargos and joggers by category, sold in ready size sets with MOQ pricing for retailers."
      canonical="/catalog"
    >
      <BootstrapData id="catalog" data={{ categories }} />
      <JsonLd data={catalogPageSchema(categories)} />
      <JsonLd data={breadcrumbSchema([
        { name: 'Home', path: '/' },
        { name: 'Catalogue', path: '/catalog' },
      ])} />
    </Seo>
  );

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-zinc-950">
      {seo}
      <Loader className="animate-spin text-accent w-10 h-10" />
    </div>
  );

  return (
    <div className="p-10 bg-gray-50 dark:bg-zinc-950 min-h-screen">
      {seo}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-2">
          <Tag className="text-accent w-5 h-5" />
          <span className="text-accent text-xs font-bold uppercase tracking-widest">Shop by Category</span>
        </div>
        <h1 className="text-gray-900 dark:text-zinc-100 text-4xl font-bold">Our Collections</h1>
        <p className="text-gray-500 dark:text-zinc-400 text-sm leading-relaxed mt-4 max-w-3xl">
          Pronoun Jeans is a B2B denim manufacturer based in Ahmedabad, Gujarat, supplying men's jeans,
          cargo pants, joggers and casual bottomwear to retailers, distributors and multi-brand outlets
          across India. Every collection below is produced in-house and sold wholesale only — in ready
          size sets rather than single pieces, with a minimum order quantity on each style. Browse by
          category to see the fits, washes and fabrics currently in production; each product page lists
          its size breakdown, available colours and MOQ. Wholesale rates are reserved for verified B2B
          partners, so prices appear once your account is approved and you sign in. New buyer? Send us
          your requirement — categories, quantities and delivery city — on WhatsApp or through the
          contact form, and our team will share current rates, fabric details and lead times for bulk orders.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {categories.map((category) => (
          <div
            key={category.id}
            className="group relative bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden border border-gray-200 dark:border-white/5 cursor-pointer hover:border-gray-300 dark:hover:border-accent/40 hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
          >
            {/* Covers the card so the whole tile stays clickable, while keeping
                the subcategory links out of this anchor's subtree — an <a>
                inside an <a> is invalid. The label is the crawlable anchor
                text; the visible heading below is the same words. */}
            <Link to={`/catalog/${category.slug}`} className="absolute inset-0 z-10">
              <span className="sr-only">{category.name}</span>
            </Link>
            <div className="h-72 overflow-hidden bg-gray-100 dark:bg-zinc-900">
              {category.image ? (
                <ResponsiveImage src={category.image} alt={category.name}
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  onError={(e) => { e.target.style.display = 'none'; }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Tag className="w-16 h-16 text-gray-300 dark:text-zinc-700" />
                </div>
              )}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end justify-between">
              <div>
                <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-1">Collection</p>
                <h2 className="text-white text-2xl font-bold">{category.name}</h2>
                {category.subcategories?.length > 0 && (
                  // z-20 lifts these above the card-wide link so they stay
                  // clickable in their own right; they are siblings of it, not
                  // descendants.
                  <div className="relative z-20 flex flex-wrap gap-1.5 mt-2">
                    {category.subcategories.map((sub) => (
                      <Link
                        key={sub.id}
                        to={`/catalog/${category.slug}?subcategory=${sub.slug}`}
                        className="text-white/80 text-xs font-medium bg-white/10 hover:bg-white/20 rounded-full px-2.5 py-1 transition-colors"
                      >
                        {sub.name}
                      </Link>
                    ))}
                  </div>
                )}
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