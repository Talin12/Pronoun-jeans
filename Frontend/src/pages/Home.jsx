import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Truck, ShieldCheck, ArrowRight, Tag } from 'lucide-react';
import api from '../api/axios';

const TRUST_BADGES = [
  { icon: Package,     title: 'Bulk Pricing',        desc: 'Exclusive B2B rates on every SKU with tiered MOQ discounts.'   },
  { icon: Truck,       title: 'Pan-India Shipping',   desc: 'Reliable dispatch to all major cities and tier-2 markets.'      },
  { icon: ShieldCheck, title: 'Quality Guaranteed',   desc: 'Every piece is quality-checked before it leaves our warehouse.' },
];

const Home = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get('products/categories/')
      .then(res => setCategories((res.data.results || res.data || []).slice(0, 6)))
      .catch(() => {});
  }, []);

  return (
    <div className="bg-white dark:bg-zinc-950 min-h-screen">

      {/* ── Hero ── */}
      <section className="bg-gradient-to-b from-gray-50 to-white dark:from-zinc-900 dark:to-zinc-950 border-b border-gray-200 dark:border-white/5">
        <div className="max-w-5xl mx-auto px-6 py-28 text-center">
          <span className="inline-block text-accent text-xs font-black uppercase tracking-[0.25em] mb-5">
            Wholesale Partner Portal
          </span>
          <h1 className="text-5xl sm:text-6xl font-black text-gray-900 dark:text-zinc-100 leading-[1.08] tracking-tight mb-6">
            Discover the<br />
            <span className="text-accent">Pronoun</span> Collection.
          </h1>
          <p className="text-lg text-gray-500 dark:text-zinc-400 max-w-xl mx-auto mb-10 leading-relaxed">
            Premium wholesale clothing. Designed for modern retail. Built for serious buyers.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={() => navigate('/catalog')}
              className="inline-flex items-center gap-2 bg-accent hover:bg-red-700 text-white font-bold px-8 py-3.5 rounded-full transition-colors text-sm"
            >
              Browse Catalog <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/about')}
              className="inline-flex items-center gap-2 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-zinc-300 hover:border-gray-300 dark:hover:border-white/20 font-bold px-8 py-3.5 rounded-full transition-colors text-sm"
            >
              Our Story
            </button>
          </div>
        </div>
      </section>

      {/* ── Trust Badges ── */}
      <section className="border-b border-gray-200 dark:border-white/5">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {TRUST_BADGES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-accent" />
                </div>
                <h3 className="text-gray-900 dark:text-zinc-100 font-bold text-sm">{title}</h3>
                <p className="text-gray-500 dark:text-zinc-400 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Category Showcase ── */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Tag className="w-4 h-4 text-accent" />
              <span className="text-accent text-xs font-black uppercase tracking-widest">Collections</span>
            </div>
            <h2 className="text-gray-900 dark:text-zinc-100 text-3xl font-black">Shop by Category</h2>
          </div>
          <Link to="/catalog" className="text-accent text-sm font-bold hover:underline hidden sm:flex items-center gap-1">
            View All <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.length > 0
            ? categories.map((cat) => (
                <Link
                  key={cat.id}
                  to={`/catalog/${cat.slug}`}
                  className="group relative bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden border border-gray-200 dark:border-white/5 hover:border-accent/40 hover:shadow-md transition-all duration-300 hover:-translate-y-1"
                >
                  {cat.image ? (
                    <div className="h-48 overflow-hidden bg-gray-100 dark:bg-zinc-800">
                      <img src={cat.image} alt={cat.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => { e.target.style.display = 'none'; }} />
                    </div>
                  ) : (
                    <div className="h-48 bg-gray-50 dark:bg-zinc-800 flex items-center justify-center">
                      <Tag className="w-10 h-10 text-gray-300 dark:text-zinc-600" />
                    </div>
                  )}
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <p className="text-accent text-xs font-bold uppercase tracking-widest mb-0.5">Collection</p>
                      <h3 className="text-gray-900 dark:text-zinc-100 font-bold text-base">{cat.name}</h3>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                      <ArrowRight className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </Link>
              ))
            : /* Skeleton placeholders while loading */
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-gray-50 dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 overflow-hidden animate-pulse">
                  <div className="h-48 bg-gray-100 dark:bg-zinc-800" />
                  <div className="p-5 space-y-2">
                    <div className="h-3 w-16 bg-gray-200 dark:bg-zinc-700 rounded" />
                    <div className="h-4 w-32 bg-gray-200 dark:bg-zinc-700 rounded" />
                  </div>
                </div>
              ))
          }
        </div>

        <div className="text-center mt-8 sm:hidden">
          <Link to="/catalog" className="inline-flex items-center gap-1 text-accent text-sm font-bold hover:underline">
            View All Collections <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* ── Footer CTA ── */}
      <section className="border-t border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-zinc-900">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-black text-gray-900 dark:text-zinc-100 mb-3">Ready to stock Pronoun?</h2>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mb-8">
            Join our network of wholesale partners. Get access to exclusive pricing and new drops before anyone else.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button onClick={() => navigate('/catalog')}
              className="inline-flex items-center gap-2 bg-accent hover:bg-red-700 text-white font-bold px-8 py-3 rounded-full transition-colors text-sm">
              Browse Catalog <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={() => navigate('/login')}
              className="inline-flex items-center gap-2 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-zinc-300 hover:border-gray-300 font-bold px-8 py-3 rounded-full transition-colors text-sm">
              Partner Login
            </button>
          </div>
        </div>
      </section>

    </div>
  );
};

export default Home;