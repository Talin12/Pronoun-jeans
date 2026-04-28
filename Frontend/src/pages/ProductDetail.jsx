import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, BadgeCheck, ShoppingCart, AlertCircle, CheckCircle2, Lock, MoveRight } from 'lucide-react';
import api from '../api/axios';
import { useAuthStore } from '../store/useAuthStore';
import { useCartStore } from '../store/useCartStore';

const decodeHtml = (text) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\\n/g, '\n');

const Toast = ({ onDone }) => {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-white dark:bg-zinc-900 border border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400 px-5 py-3.5 rounded-2xl shadow-lg text-sm font-semibold"
      style={{ animation: 'slideUp 0.25s ease' }}
    >
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      Added to cart successfully!
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
};

const ProductDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const fetchCart = useCartStore((s) => s.fetchCart);

  const [product, setProduct]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [quantities, setQuantities] = useState({});
  const [error, setError]           = useState('');
  const [showToast, setShowToast]   = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`products/catalog/${slug}/`)
      .then(res => setProduct(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [slug]);

  const handleQtyChange = (variationId, value) => {
    const qty = Math.max(0, parseInt(value) || 0);
    setQuantities(prev => ({ ...prev, [variationId]: qty }));
    setError('');
  };

  const totalSelected   = Object.values(quantities).reduce((sum, q) => sum + q, 0);
  const totalOrderValue = product
    ? Object.entries(quantities).reduce((sum, [id, qty]) => {
        const v = product.variations.find(v => v.id === parseInt(id));
        return sum + (v ? parseFloat(v.b2b_price) * qty : 0);
      }, 0)
    : 0;

  const handleBulkAdd = async () => {
    setError('');
    const itemsToAdd = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ variation_id: parseInt(id), quantity: qty }));
    if (itemsToAdd.length === 0) { setError('Please enter a quantity for at least one variation.'); return; }
    if (totalSelected < product.moq) { setError(`Minimum order quantity is ${product.moq} units. You selected ${totalSelected}.`); return; }
    setSubmitting(true);
    try {
      await api.post('orders/cart/update/', { product_id: product.id, items: itemsToAdd });
      setQuantities({});
      setShowToast(true);
      fetchCart();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update cart.');
    } finally {
      setSubmitting(false);
    }
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

  const firstV   = product.variations[0];
  const setPrice = firstV ? (parseFloat(firstV.b2b_price) * product.moq).toFixed(2) : null;

  return (
    <div className="bg-gray-50 dark:bg-zinc-950 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-accent hover:text-red-700 transition-colors mb-6 text-sm font-semibold">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex flex-col lg:flex-row gap-8 items-start">

          {/* Left — image + meta */}
          <div className="w-full lg:w-72 xl:w-80 shrink-0">
            <div className="rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 aspect-square shadow-sm">
              {product.image ? (
                <img src={product.image} alt={product.name} className="w-full h-full object-cover"
                  onError={(e) => { e.target.style.display = 'none'; }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingCart className="w-16 h-16 text-gray-300 dark:text-zinc-700" />
                </div>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <p className="text-accent text-xs font-bold uppercase tracking-widest">{product.category_name}</p>
                <h1 className="text-gray-900 dark:text-zinc-100 text-lg font-bold leading-snug mt-0.5">{product.name}</h1>
              </div>

              {isAuthenticated && setPrice && (
                <div>
                  <p className="text-gray-500 dark:text-zinc-400 text-xs uppercase tracking-widest">Set Price</p>
                  <p className="text-gray-900 dark:text-zinc-100 text-xl font-black">₹{setPrice}</p>
                  <p className="text-gray-500 dark:text-zinc-400 text-xs">Price per piece : ₹{parseFloat(firstV.b2b_price).toFixed(2)}</p>
                </div>
              )}

              {isAuthenticated ? (
                <div className="inline-flex items-center gap-1.5 bg-accent/10 border border-accent/30 text-accent text-xs font-semibold px-3 py-1.5 rounded-full">
                  <BadgeCheck className="w-3.5 h-3.5" />
                  MOQ: {product.moq} units
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 text-gray-500 dark:text-zinc-400 text-xs font-semibold px-3 py-1.5 rounded-full">
                  <Lock className="w-3.5 h-3.5" />
                  Login to see wholesale pricing
                </div>
              )}
            </div>
          </div>

          {/* Right — bulk order table OR login gate */}
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

                {/* Mobile swipe hint */}
                <div className="flex items-center justify-end gap-1.5 px-5 py-2 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-100 dark:border-white/5 md:hidden">
                  <MoveRight className="w-3 h-3 text-gray-400 dark:text-zinc-500" />
                  <span className="text-xs text-gray-400 dark:text-zinc-500">Swipe to view full matrix</span>
                </div>

                {/* Scrollable table container */}
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-sm min-w-[540px]">
                    <thead>
                      <tr className="text-gray-500 dark:text-zinc-400 text-xs uppercase tracking-widest border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02]">
                        <th className="text-left px-4 py-3">Size / Color</th>
                        <th className="text-left px-4 py-3">SKU</th>
                        <th className="text-left px-4 py-3">Price</th>
                        <th className="text-left px-4 py-3 w-24">QTY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.variations.map((v, idx) => {
                        const vSet = (parseFloat(v.b2b_price) * product.moq).toFixed(2);
                        return (
                          <tr key={v.id} className={`border-b border-gray-100 dark:border-white/5 transition-colors ${quantities[v.id] > 0 ? 'bg-red-50/50 dark:bg-accent/5' : idx % 2 === 0 ? 'bg-gray-50/50 dark:bg-white/[0.02]' : 'bg-white dark:bg-transparent'}`}>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="text-gray-700 dark:text-zinc-300 font-semibold text-xs">{v.size}</span>
                              <span className="text-gray-400 dark:text-zinc-600 mx-1">/</span>
                              <span className="text-accent text-xs font-medium">{v.color}</span>
                            </td>
                            <td className="px-4 py-3 text-gray-400 dark:text-zinc-500 font-mono text-xs">{v.sku}</td>
                            <td className="px-4 py-3">
                              <p className="text-gray-400 dark:text-zinc-500 text-xs uppercase tracking-widest leading-none">Set Price</p>
                              <p className="text-gray-900 dark:text-zinc-100 font-black text-sm mt-0.5">₹{vSet}</p>
                              <p className="text-gray-400 dark:text-zinc-500 text-xs">₹{parseFloat(v.b2b_price).toFixed(2)}/pc</p>
                            </td>
                            <td className="px-4 py-3">
                              <input type="number" min="0" value={quantities[v.id] || ''} onChange={(e) => handleQtyChange(v.id, e.target.value)} placeholder="0"
                                className="w-16 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-zinc-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="px-5 py-4 border-t border-gray-100 dark:border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    {totalSelected > 0 && !error && (
                      <p className="text-gray-500 dark:text-zinc-400 text-sm">Order Total: <span className="text-gray-900 dark:text-zinc-100 font-bold">₹{totalOrderValue.toFixed(2)}</span></p>
                    )}
                    {error && <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm font-semibold"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
                  </div>
                  <button onClick={handleBulkAdd} disabled={submitting}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-accent hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-sm uppercase tracking-wide whitespace-nowrap">
                    {submitting ? <Loader className="animate-spin w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                    {submitting ? 'Adding...' : 'Confirm Bulk Order'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm p-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mb-5">
                  <Lock className="w-7 h-7 text-gray-400 dark:text-zinc-500" />
                </div>
                <h3 className="text-gray-900 dark:text-zinc-100 text-lg font-bold mb-2">Wholesale Pricing & Ordering</h3>
                <p className="text-gray-500 dark:text-zinc-400 text-sm max-w-sm mb-6 leading-relaxed">
                  Sign in to your partner account to view B2B pricing, MOQ details, and place bulk orders.
                </p>
                <button onClick={() => navigate('/login', { state: { from: { pathname: `/product/${slug}` } } })}
                  className="bg-accent hover:bg-red-700 text-white font-bold px-8 py-3 rounded-xl transition-colors text-sm">
                  Sign In to Order
                </button>
                <p className="text-gray-400 dark:text-zinc-600 text-xs mt-4">Not a partner yet? Contact your account manager.</p>
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