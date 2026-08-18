import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Truck, ShieldCheck, ArrowRight, Tag, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../api/axios';
import ResponsiveImage from '../components/shared/ResponsiveImage';
import Seo from '../components/seo/Seo';
import JsonLd from '../components/seo/JsonLd';
import { websiteSchema } from '../config/schema';
import { usePrerenderReady } from '../hooks/usePrerenderReady';

const TRUST_BADGES = [
  { icon: Package,     title: 'Bulk Pricing',        desc: 'Exclusive B2B rates on every SKU with tiered MOQ discounts.'   },
  { icon: Truck,       title: 'Pan-India Shipping',   desc: 'Reliable dispatch to all major cities and tier-2 markets.'      },
  { icon: ShieldCheck, title: 'Quality Guaranteed',   desc: 'Every piece is quality-checked before it leaves our warehouse.' },
];

const SLIDE_INTERVAL = 4500;

const HeroSlideshow = ({ slides }) => {
  const [current, setCurrent] = useState(0);
  const [fading, setFading]   = useState(false);
  const timerRef              = useRef(null);

  const goTo = (idx) => {
    if (fading || idx === current) return;
    setFading(true);
    setTimeout(() => {
      setCurrent(idx);
      setFading(false);
    }, 400);
  };

  const next  = () => goTo((current + 1) % slides.length);
  const prev  = () => goTo((current - 1 + slides.length) % slides.length);

  const resetTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(next, SLIDE_INTERVAL);
  };

  useEffect(() => {
    if (slides.length <= 1) return;
    timerRef.current = setInterval(next, SLIDE_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [current, slides.length]);

  if (slides.length === 0) {
    return <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900" />;
  }

  const slide = slides[current];

  return (
    <>
      {/* Current slide image — cross-fade via opacity */}
      <div className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${fading ? 'opacity-0' : 'opacity-100'}`}>
        <ResponsiveImage
          key={slide.id}
          src={slide.image}
          alt={slide.caption || `Slide ${current + 1}`}
          priority
          sizes="100vw"
          className="w-full h-full object-cover object-center"
        />
      </div>

      {/* Gradient overlays for text readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/10 z-10" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 z-10" />

      {/* Arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={() => { resetTimer(); prev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 backdrop-blur-sm border border-white/20 flex items-center justify-center transition-all"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={() => { resetTimer(); next(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 backdrop-blur-sm border border-white/20 flex items-center justify-center transition-all"
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {slides.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          {slides.map((_, idx) => (
            <button key={idx} onClick={() => { resetTimer(); goTo(idx); }}
              className={`rounded-full transition-all duration-300 ${idx === current ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/40 hover:bg-white/70'}`}
            />
          ))}
        </div>
      )}

      {/* Caption badge */}
      {slide.caption && (
        <div className="absolute bottom-6 right-6 z-20 hidden sm:block">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-4 py-2 max-w-[220px]">
            <p className="text-white text-sm font-semibold truncate">{slide.caption}</p>
          </div>
        </div>
      )}
    </>
  );
};

const Home = () => {
  const navigate = useNavigate();
  const [categories, setCategories]     = useState([]);
  const [slides, setSlides]             = useState([]);
  const [slidesLoaded, setSlidesLoaded] = useState(false);
  const [catsLoaded, setCatsLoaded]     = useState(false);

  useEffect(() => {
    api.get('products/hero-slides/')
      .then(res => setSlides(res.data ?? []))
      .catch(() => {})
      .finally(() => setSlidesLoaded(true));
  }, []);

  useEffect(() => {
    api.get('products/categories/')
      .then(res => setCategories((res.data.results || res.data || []).slice(0, 6)))
      .catch(() => {})
      .finally(() => setCatsLoaded(true));
  }, []);

  // Both fetches feed visible markup, so the snapshot has to wait for both.
  usePrerenderReady(slidesLoaded && catsLoaded);

  return (
    <div className="bg-white dark:bg-zinc-950 min-h-screen">

      <Seo
        title="Wholesale Jeans Manufacturer in Ahmedabad"
        description="Pronoun Jeans manufactures wholesale men's jeans, cargo pants and joggers in Ahmedabad. Bulk size sets, MOQ pricing and pan-India dispatch for retailers."
        canonical="/"
      >
        <JsonLd data={websiteSchema()} />
      </Seo>

      {/* ── Hero ── */}
      <section className="relative h-[92vh] min-h-[560px] max-h-[860px] overflow-hidden">

        {slidesLoaded
          ? <HeroSlideshow slides={slides} />
          : <div className="absolute inset-0 bg-zinc-900 animate-pulse" />
        }

        {/* Text always on top — pointer-events-none so this full-bleed layer
            doesn't swallow clicks meant for the slideshow's arrow buttons
            underneath it; re-enabled on the actual buttons below. */}
        <div className="relative z-20 h-full flex items-center pointer-events-none">
          <div className="max-w-5xl mx-auto px-6 sm:px-10 w-full">
            <div className="max-w-2xl">
              <span className="inline-block text-white/70 text-xs font-black uppercase tracking-[0.25em] mb-5 bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1.5 rounded-full">
                Wholesale Partner Portal
              </span>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white leading-[1.05] tracking-tight mb-6">
                Wholesale Jeans<br />
                <span className="text-accent">Manufacturer</span><br />
                in Ahmedabad.
              </h1>
              <p className="text-lg text-white/75 max-w-md mb-10 leading-relaxed">
                Men's denim, cargo pants and joggers in bulk size sets. Built for retailers and distributors across India.
              </p>
              <div className="flex items-center gap-4 flex-wrap">
                <button onClick={() => navigate('/catalog')}
                  className="pointer-events-auto inline-flex items-center gap-2 bg-accent hover:bg-red-700 text-white font-bold px-8 py-3.5 rounded-full transition-colors text-sm shadow-lg shadow-accent/30">
                  Browse Catalog <ArrowRight className="w-4 h-4" />
                </button>
                <button onClick={() => navigate('/about')}
                  className="pointer-events-auto inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/30 text-white font-bold px-8 py-3.5 rounded-full transition-colors text-sm">
                  Our Story
                </button>
              </div>
            </div>
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
                <Link key={cat.id} to={`/catalog/${cat.slug}`}
                  className="group relative bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden border border-gray-200 dark:border-white/5 hover:border-accent/40 hover:shadow-md transition-all duration-300 hover:-translate-y-1">
                  {cat.image ? (
                    <div className="h-48 overflow-hidden bg-gray-100 dark:bg-zinc-800">
                      <ResponsiveImage src={cat.image} alt={cat.name}
                        sizes="(max-width: 768px) 100vw, 33vw"
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
            : Array.from({ length: 6 }).map((_, i) => (
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