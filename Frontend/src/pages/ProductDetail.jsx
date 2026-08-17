import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader, BadgeCheck, ShoppingCart,
  AlertCircle, CheckCircle2, Lock, MoveRight, Info,
} from 'lucide-react';
import api from '../api/axios';
import { useAuthStore } from '../store/useAuthStore';
import { useCartStore } from '../store/useCartStore';
import ResponsiveImage from '../components/shared/ResponsiveImage';

const decodeHtml = (text) => {
  if (!text) return '';
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return (doc.body.textContent ?? '').replace(/\\n/g, '\n');
};

const Toast = ({ onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-white dark:bg-zinc-900 border border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400 px-5 py-3.5 rounded-2xl shadow-lg text-sm font-semibold"
      style={{ animation: 'slideUp 0.25s ease' }}>
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      Added to cart successfully!
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
};

const ColorSwatch = ({ hex, name }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-white/20 shrink-0 inline-block"
      style={{ backgroundColor: hex || '#CCCCCC' }} title={name} />
    <span>{name}</span>
  </span>
);

const StockBadge = ({ qty }) => {
  if (qty === 0 || qty == null)
    return <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-1.5 py-0.5 rounded-full">Out of Stock</span>;
  if (qty <= 10)
    return <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 px-1.5 py-0.5 rounded-full">{qty} left</span>;
  return <span className="text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 px-1.5 py-0.5 rounded-full">In Stock</span>;
};

// ── Set Breakdown Tooltip ─────────────────────────────────────────────────────

const SetBreakdownTooltip = ({ breakdown }) => {
  const [visible, setVisible] = useState(false);
  if (!breakdown) return null;
  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="text-gray-400 hover:text-accent transition-colors focus:outline-none"
        tabIndex={0}
        aria-label="Set size breakdown"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-max max-w-[220px]">
          <div className="bg-gray-900 dark:bg-zinc-700 text-white text-xs font-medium px-3 py-2 rounded-xl shadow-xl leading-relaxed">
            <p className="text-white/60 text-[10px] uppercase tracking-widest mb-0.5">Size Breakdown</p>
            {breakdown}
          </div>
          <div className="w-2 h-2 bg-gray-900 dark:bg-zinc-700 rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </span>
  );
};

// ── Image Zoom ────────────────────────────────────────────────────────────────

const ZOOM_SCALE = 2.5;

const ZoomableImage = ({ src, alt }) => {
  const containerRef          = useRef(null);
  const [zooming, setZooming] = useState(false);
  const [lens, setLens]       = useState({ x: 0, y: 0 });
  const [bgPos, setBgPos]     = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e) => {
    const rect  = containerRef.current.getBoundingClientRect();
    const lensW = rect.width * 0.4;
    const lensH = rect.height * 0.4;
    let lx = Math.max(0, Math.min(e.clientX - rect.left - lensW / 2, rect.width  - lensW));
    let ly = Math.max(0, Math.min(e.clientY - rect.top  - lensH / 2, rect.height - lensH));
    const lxPct = (lx / rect.width)  * 100;
    const lyPct = (ly / rect.height) * 100;
    setLens({ x: lxPct, y: lyPct });
    setBgPos({ x: lxPct * ZOOM_SCALE, y: lyPct * ZOOM_SCALE });
  }, []);

  if (!src) return (
    <div className="w-full aspect-square rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 flex items-center justify-center">
      <ShoppingCart className="w-16 h-16 text-gray-300 dark:text-zinc-700" />
    </div>
  );

  return (
    <div className="relative" style={{ isolation: 'isolate' }}>
      <div ref={containerRef}
        className="rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 aspect-square shadow-sm cursor-crosshair select-none relative"
        onMouseEnter={() => setZooming(true)}
        onMouseLeave={() => setZooming(false)}
        onMouseMove={handleMouseMove}>
        <ResponsiveImage src={src} alt={alt} priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="w-full h-full object-cover" draggable={false}
          onError={(e) => { e.target.style.display = 'none'; }} />
        {zooming && (
          <div className="absolute border-2 border-accent/50 bg-white/20 pointer-events-none"
            style={{ left: `${lens.x}%`, top: `${lens.y}%`, width: '40%', height: '40%' }} />
        )}
      </div>
      {zooming && (
        <div className="absolute top-0 rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xl z-50"
          style={{
            left: 'calc(100% + 16px)', width: '420px', height: '420px',
            backgroundImage: `url(${src})`, backgroundRepeat: 'no-repeat',
            backgroundSize: `${ZOOM_SCALE * 100}%`,
            backgroundPosition: `${bgPos.x}% ${bgPos.y}%`,
          }} />
      )}
    </div>
  );
};

// ── Table cells ───────────────────────────────────────────────────────────────

const WholesalePriceCell = ({ v }) => (
  <td className="px-4 py-3">
    <div className="flex items-center gap-1">
      <p className="text-gray-900 dark:text-zinc-100 font-bold text-sm">
        ₹{parseFloat(v.set_price || v.b2b_price).toFixed(2)}
      </p>
      <SetBreakdownTooltip breakdown={v.set_breakdown} />
    </div>
  </td>
);

const PerPiecePriceCell = ({ v }) => {
  const price = v.per_piece_price ? parseFloat(v.per_piece_price) : null;
  if (!price) return <td className="px-4 py-3 text-gray-300 dark:text-zinc-700 text-sm">—</td>;
  return (
    <td className="px-4 py-3">
      <p className="text-gray-700 dark:text-zinc-300 text-sm font-semibold">₹{price.toFixed(2)}</p>
    </td>
  );
};

const MrpPerPieceCell = ({ v }) => {
  const mrpPc  = v.mrp_per_piece ? parseFloat(v.mrp_per_piece) : null;
  const margin = v.margin_percentage;
  if (!mrpPc) return <td className="px-4 py-3 text-gray-300 dark:text-zinc-700 text-sm">—</td>;
  return (
    <td className="px-4 py-3">
      <p className="text-gray-700 dark:text-zinc-300 text-sm font-semibold">₹{mrpPc.toFixed(2)}</p>
      {margin > 0 && (
        <span className="inline-flex items-center bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap mt-1">
          {margin}% margin
        </span>
      )}
    </td>
  );
};

const TotalCell = ({ v, qty }) => {
  if (!qty || qty === 0) return <td className="px-4 py-3 text-gray-300 dark:text-zinc-700 text-sm">—</td>;
  return (
    <td className="px-4 py-3">
      <p className="text-gray-900 dark:text-zinc-100 font-black text-sm">₹{(parseFloat(v.set_price || v.b2b_price) * qty).toFixed(2)}</p>
      <p className="text-gray-400 dark:text-zinc-500 text-[10px]">{qty} sets</p>
    </td>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────

const ProductDetail = () => {
  const { slug }   = useParams();
  const navigate   = useNavigate();
  const { isAuthenticated, impersonatedBuyer } = useAuthStore();
  const fetchCart  = useCartStore((s) => s.fetchCart);

  const [product, setProduct]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [quantities, setQuantities] = useState({});
  const [error, setError]           = useState('');
  const [showToast, setShowToast]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mainImage, setMainImage]   = useState(null);
  const [activeColor, setActiveColor] = useState(null);

  useEffect(() => {
    api.get(`products/catalog/${slug}/`)
      .then(res => { setProduct(res.data); setMainImage(res.data.image); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  const uniqueColors = useMemo(() => {
    if (!product) return [];
    const seen = new Map();
    product.variations.forEach(v => {
      const name = v.color_name || v.color || '';
      if (name && !seen.has(name)) seen.set(name, v);
    });
    return [...seen.values()];
  }, [product]);

  const handleSwatchClick = (colorName) => {
    setActiveColor(colorName);
    const match = product.variations.find(v => (v.color_name || v.color) === colorName);
    if (!match) { setMainImage(product.image); return; }
    // prefer first gallery image, fall back to the single variation image, then product image
    const firstImg = match.gallery_images?.[0]?.image || match.image || product.image;
    setMainImage(firstImg);
  };

  const handleQtyChange = (variationId, value) => {
    setQuantities(prev => ({ ...prev, [variationId]: Math.max(0, parseInt(value) || 0) }));
    setError('');
  };

  const totalSelected   = Object.values(quantities).reduce((s, q) => s + q, 0);
  const totalOrderValue = product
    ? Object.entries(quantities).reduce((s, [id, qty]) => {
        const v = product.variations.find(v => v.id === parseInt(id));
        return s + (v ? parseFloat(v.set_price || v.b2b_price) * qty : 0);
      }, 0)
    : 0;

  const handleBulkAdd = async () => {
    setError('');
    const itemsToAdd = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ variation_id: parseInt(id), quantity: qty }));
    if (!itemsToAdd.length) { setError('Please enter a quantity for at least one variation.'); return; }
    if (totalSelected < product.moq) { setError(`Minimum order quantity is ${product.moq} units. You selected ${totalSelected}.`); return; }
    setSubmitting(true);
    try {
      await api.post('orders/cart/update/', { product_id: product.id, items: itemsToAdd, ...(impersonatedBuyer ? { buyer_id: impersonatedBuyer.id } : {}) });
      setQuantities({});
      setShowToast(true);
      fetchCart();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update cart.');
    } finally { setSubmitting(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-zinc-950">
      <Loader className="animate-spin text-accent w-10 h-10" />
    </div>
  );
  if (!product) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-zinc-950">
      <p className="text-gray-500 dark:text-zinc-400">Product not found.</p>
    </div>
  );

  const firstV = product.variations[0];

  return (
    <div className="bg-gray-50 dark:bg-zinc-950 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-accent hover:text-red-700 transition-colors mb-6 text-sm font-semibold">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* overflow:visible removed from here and left col — was the root cause */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">

          <div className="w-full lg:w-96 xl:w-[420px] shrink-0">
            <ZoomableImage src={mainImage} alt={product.name} />

            {(() => {
              // When a color is active, collect all images for that color's variations
              let thumbs = [];
              if (activeColor) {
                product.variations
                  .filter(v => (v.color_name || v.color) === activeColor)
                  .forEach(v => {
                    if (v.gallery_images?.length) {
                      v.gallery_images.forEach(gi => thumbs.push({ key: `gi-${gi.id}`, src: gi.image, alt: gi.alt_text || v.color_name || '' }));
                    } else if (v.image) {
                      thumbs.push({ key: `v-${v.id}`, src: v.image, alt: v.color_name || '' });
                    }
                  });
              } else {
                // Default: show product main image + product gallery images
                if (product.image) thumbs.push({ key: 'main', src: product.image, alt: 'Main' });
                (product.gallery_images || []).forEach(img =>
                  thumbs.push({ key: `pg-${img.id}`, src: img.image, alt: img.alt_text || '' })
                );
              }

              if (thumbs.length === 0) return null;
              return (
                <div className="flex gap-3 mt-4 overflow-x-auto pb-2">
                  {thumbs.map(t => (
                    <button key={t.key} onClick={() => setMainImage(t.src)}
                      className={`w-20 h-20 shrink-0 rounded-xl overflow-hidden border-2 transition-all ${mainImage === t.src ? 'border-accent' : 'border-transparent hover:border-gray-300 dark:hover:border-zinc-600'}`}>
                      {/* 80px on screen — a 200px derivative, not the original. */}
                      <ResponsiveImage src={t.src} alt={t.alt} widths={[200, 400]} sizes="80px"
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }} />
                    </button>
                  ))}
                </div>
              );
            })()}

            <div className="mt-4 space-y-3">
              <div>
                <p className="text-accent text-xs font-bold uppercase tracking-widest">{product.category_name}</p>
                <h1 className="text-gray-900 dark:text-zinc-100 text-lg font-bold leading-snug mt-0.5">{product.name}</h1>
              </div>

              {uniqueColors.length > 0 && (
                <div>
                  <p className="text-gray-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-2">
                    {activeColor || 'All Colors'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {uniqueColors.map(v => {
                      const name     = v.color_name || v.color || '';
                      const hex      = v.color_hex  || '#CCCCCC';
                      const isActive = activeColor === name;
                      return (
                        <button key={name} onClick={() => handleSwatchClick(name)} title={name}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${isActive ? 'border-accent scale-110 shadow-md' : 'border-gray-200 dark:border-white/20 hover:border-gray-400'}`}
                          style={{ backgroundColor: hex }} />
                      );
                    })}
                    {activeColor && (
                      <button onClick={() => { setActiveColor(null); setMainImage(product.image); }}
                        className="text-xs text-gray-400 hover:text-accent transition-colors self-center ml-1">
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isAuthenticated && firstV && (
                <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 dark:text-zinc-500 text-xs flex items-center gap-1">
                      Wholesale price
                      <SetBreakdownTooltip breakdown={firstV.set_breakdown} />
                    </span>
                    <span className="text-gray-900 dark:text-zinc-100 font-bold text-sm">
                      ₹{parseFloat(firstV.set_price || firstV.b2b_price).toFixed(2)}
                    </span>
                  </div>
                  {firstV.per_piece_price && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 dark:text-zinc-500 text-xs">Per piece</span>
                      <span className="text-gray-700 dark:text-zinc-300 font-semibold text-sm">₹{parseFloat(firstV.per_piece_price).toFixed(2)}</span>
                    </div>
                  )}
                  {firstV.mrp_per_piece && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 dark:text-zinc-500 text-xs">MRP / piece</span>
                      <span className="text-gray-700 dark:text-zinc-300 text-sm">₹{parseFloat(firstV.mrp_per_piece).toFixed(2)}</span>
                    </div>
                  )}
                  {firstV.margin_percentage > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 dark:text-zinc-500 text-xs">Your margin</span>
                      <span className="inline-flex items-center bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {firstV.margin_percentage}% margin
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/5 pt-1.5">
                    <span className="text-gray-500 dark:text-zinc-400 text-xs font-semibold">Min. order total</span>
                    <span className="text-accent font-black text-base">
                      ₹{(parseFloat(firstV.set_price || firstV.b2b_price) * product.moq).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {isAuthenticated ? (
                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-1.5 bg-accent/10 border border-accent/30 text-accent text-xs font-semibold px-3 py-1.5 rounded-full">
                    <BadgeCheck className="w-3.5 h-3.5" /> MOQ: {product.moq} units
                  </div>
                  {(() => {
                    const total = product.variations.reduce((s, v) => s + (v.stock_quantity ?? 0), 0);
                    return <StockBadge qty={total} />;
                  })()}
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 text-gray-500 dark:text-zinc-400 text-xs font-semibold px-3 py-1.5 rounded-full">
                  <Lock className="w-3.5 h-3.5" /> Login to see wholesale pricing
                </div>
              )}
            </div>
          </div>

          {/* min-w-0 is essential — lets this flex child shrink below its content size */}
          <div className="flex-1 min-w-0 w-full">
            {isAuthenticated ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
                  <h2 className="text-gray-900 dark:text-zinc-100 text-sm font-bold">Bulk Order Table</h2>
                  {totalSelected > 0 && (
                    <span className={`text-sm font-bold ${totalSelected >= product.moq ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                      {totalSelected} / {product.moq} units
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-1.5 px-5 py-2 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-100 dark:border-white/5 md:hidden">
                  <MoveRight className="w-3 h-3 text-gray-400" />
                  <span className="text-xs text-gray-400">Swipe to view full matrix</span>
                </div>

                {/* Table scrolls only within this box — page stays fully locked */}
                <div className="overflow-x-auto w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full text-sm min-w-[600px]">
                    {/*
                      CHANGES vs previous version:
                      1. min-w reduced 700px → 600px (less forced width on mid screens)
                      2. Wholesale Price th: removed "(hover ⓘ for set breakdown)" subtext
                         — it was the single biggest column-width offender
                      3. SKU td: added break-all + max-w-[120px] — long hyphenated slugs
                         now wrap instead of stretching the entire table rightward
                      4. QTY input: w-14 instead of w-16 — saves 8px per row
                    */}
                    <thead>
                      <tr className="text-gray-500 dark:text-zinc-400 text-xs uppercase tracking-widest border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02]">
                        <th className="text-left px-4 py-3 w-36">Size / Color</th>
                        <th className="text-left px-4 py-3 w-28">SKU</th>
                        <th className="text-left px-4 py-3">Wholesale Price</th>
                        <th className="text-left px-4 py-3">Per Piece</th>
                        <th className="text-left px-4 py-3">MRP / Piece</th>
                        <th className="text-left px-4 py-3 w-20">QTY</th>
                        <th className="text-left px-4 py-3">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.variations.map((v, idx) => (
                        <tr key={v.id}
                          className={`border-b border-gray-100 dark:border-white/5 transition-colors ${
                            quantities[v.id] > 0 ? 'bg-red-50/50 dark:bg-accent/5'
                              : idx % 2 === 0 ? 'bg-gray-50/50 dark:bg-white/[0.02]'
                              : 'bg-white dark:bg-transparent'
                          }`}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-700 dark:text-zinc-300 font-semibold text-xs">{v.size}</span>
                              <span className="text-gray-400 dark:text-zinc-600">/</span>
                              <ColorSwatch hex={v.color_hex || '#CCCCCC'} name={v.color_name || v.color} />
                            </div>
                            <div className="mt-1"><StockBadge qty={v.stock_quantity} /></div>
                          </td>
                          {/* break-all: forces long SKU slugs to wrap within the capped column width */}
                          <td className="px-4 py-3 text-gray-400 dark:text-zinc-500 font-mono text-xs break-all max-w-[120px]">{v.sku}</td>
                          <WholesalePriceCell v={v} />
                          <PerPiecePriceCell v={v} />
                          <MrpPerPieceCell v={v} />
                          <td className="px-4 py-3">
                            <input type="number" min="0"
                              value={quantities[v.id] || ''}
                              onChange={e => handleQtyChange(v.id, e.target.value)}
                              placeholder="0"
                              disabled={!v.stock_quantity}
                              className="w-14 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-zinc-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed" />
                          </td>
                          <TotalCell v={v} qty={quantities[v.id] || 0} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="px-5 py-4 border-t border-gray-100 dark:border-white/5">
                  {totalSelected > 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl">
                      <div className="flex items-center gap-6 text-sm flex-wrap">
                        <div>
                          <p className="text-gray-400 dark:text-zinc-500 text-xs">Sets selected</p>
                          <p className="text-gray-900 dark:text-zinc-100 font-bold">{totalSelected}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 dark:text-zinc-500 text-xs">Order total</p>
                          <p className="text-gray-900 dark:text-zinc-100 font-black text-lg">₹{totalOrderValue.toFixed(2)}</p>
                        </div>
                        {firstV && totalSelected > 0 && (
                          <div>
                            <p className="text-gray-400 dark:text-zinc-500 text-xs">Avg. per set</p>
                            <p className="text-gray-900 dark:text-zinc-100 font-semibold text-sm">₹{(totalOrderValue / totalSelected).toFixed(2)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      {error && (
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm font-semibold">
                          <AlertCircle className="w-4 h-4 shrink-0" />{error}
                        </div>
                      )}
                      {!error && totalSelected === 0 && (
                        <p className="text-gray-400 dark:text-zinc-500 text-xs">Enter quantities above. Min. order: {product.moq} units.</p>
                      )}
                    </div>
                    <button onClick={handleBulkAdd} disabled={submitting}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 bg-accent hover:bg-red-700 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-sm uppercase tracking-wide whitespace-nowrap">
                      {submitting ? <Loader className="animate-spin w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                      {submitting ? 'Adding...' : 'Add to Cart'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm p-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mb-5">
                  <Lock className="w-7 h-7 text-gray-400 dark:text-zinc-500" />
                </div>
                <h3 className="text-gray-900 dark:text-zinc-100 text-lg font-bold mb-2">Wholesale Pricing & Ordering</h3>
                <p className="text-gray-500 dark:text-zinc-400 text-sm max-w-sm mb-6 leading-relaxed">
                  Sign in to your partner account to view wholesale pricing, MOQ details, and place bulk orders.
                </p>
                <button onClick={() => navigate('/login', { state: { from: { pathname: `/product/${slug}` } } })}
                  className="bg-accent hover:bg-red-700 text-white font-bold px-8 py-3 rounded-xl transition-colors text-sm">
                  Sign In to Order
                </button>
              </div>
            )}

            {product.description && (
              <div className="mt-6 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 p-5 shadow-sm">
                <h3 className="text-gray-900 dark:text-zinc-100 text-sm font-bold mb-3">Product Details</h3>
                <div className="text-gray-500 dark:text-zinc-400 text-xs leading-relaxed space-y-1">
                  {decodeHtml(product.description).split('\n').map((line, i) =>
                    line.trim() ? <p key={i}>{line}</p> : null
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {showToast && <Toast onDone={() => setShowToast(false)} />}
    </div>
  );
};

export default ProductDetail;