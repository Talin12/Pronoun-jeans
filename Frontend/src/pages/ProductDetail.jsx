import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, BadgeCheck, ShoppingCart, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../api/axios';

const BACKEND_URL = 'http://localhost:8000';

const decodeHtml = (text) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\\n/g, '\n');

const ProductDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [product, setProduct]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [quantities, setQuantities] = useState({});
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState(false);
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
    setSuccess(false);
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
    setSuccess(false);
    const itemsToAdd = Object.entries(quantities).filter(([, qty]) => qty > 0);
    if (itemsToAdd.length === 0) { setError('Please enter a quantity for at least one variation.'); return; }
    if (totalSelected < product.moq) { setError(`Minimum order quantity is ${product.moq} units. You selected ${totalSelected}.`); return; }
    setSubmitting(true);
    try {
      await Promise.all(itemsToAdd.map(([id, qty]) =>
        api.post('orders/cart/update/', { variation_id: parseInt(id), quantity: qty })
      ));
      setSuccess(true);
      setQuantities({});
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update cart.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-primary"><Loader className="animate-spin text-accent w-10 h-10" /></div>;
  if (!product) return <div className="flex items-center justify-center min-h-screen bg-primary"><p className="text-gray-400">Product not found.</p></div>;

  const imageUrl = product.image
    ? product.image.startsWith('http') ? product.image : `${BACKEND_URL}${product.image}`
    : 'https://via.placeholder.com/600x600?text=No+Image';

  const firstV    = product.variations[0];
  const setPrice  = firstV ? (parseFloat(firstV.b2b_price) * product.moq).toFixed(2) : null;

  return (
    <div className="bg-primary min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-accent hover:text-white transition-colors mb-6 text-sm font-semibold">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* ── Main grid: image+meta | table ── */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">

          {/* Left — fixed width */}
          <div className="w-full lg:w-72 xl:w-80 shrink-0">
            <div className="rounded-2xl overflow-hidden bg-secondary border border-white/5">
              <img
                src={imageUrl}
                alt={product.name}
                className="w-full aspect-square object-cover"
                onError={(e) => { e.target.src = 'https://via.placeholder.com/600x600?text=No+Image'; }}
              />
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <p className="text-accent text-xs font-bold uppercase tracking-widest">{product.category_name}</p>
                <h1 className="text-white text-lg font-bold leading-snug mt-0.5">{product.name}</h1>
              </div>

              {setPrice && (
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-widest">Set Price</p>
                  <p className="text-white text-xl font-black">₹{setPrice}</p>
                  <p className="text-gray-400 text-xs">Price per piece : ₹{parseFloat(firstV.b2b_price).toFixed(2)}</p>
                </div>
              )}

              <div className="inline-flex items-center gap-1.5 bg-accent/10 border border-accent/30 text-accent text-xs font-semibold px-3 py-1.5 rounded-full">
                <BadgeCheck className="w-3.5 h-3.5" />
                MOQ: {product.moq} units
              </div>
            </div>
          </div>

          {/* Right — table fills rest */}
          <div className="flex-1 min-w-0">
            <div className="bg-secondary rounded-2xl border border-white/5 overflow-hidden">

              <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-white text-sm font-bold">Bulk Order Table</h2>
                {totalSelected > 0 && (
                  <span className={`text-sm font-bold ${totalSelected >= product.moq ? 'text-green-400' : 'text-yellow-400'}`}>
                    {totalSelected} / {product.moq} units
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs uppercase tracking-widest border-b border-white/5 bg-white/[0.02]">
                      <th className="text-left px-4 py-3">Size / Color</th>
                      <th className="text-left px-4 py-3 hidden md:table-cell">SKU</th>
                      <th className="text-left px-4 py-3">Price</th>
                      <th className="text-left px-4 py-3 w-24">QTY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.variations.map((v, idx) => {
                      const vSet = (parseFloat(v.b2b_price) * product.moq).toFixed(2);
                      return (
                        <tr key={v.id} className={`border-b border-white/5 transition-colors ${quantities[v.id] > 0 ? 'bg-accent/5' : idx % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-white font-semibold text-xs">{v.size}</span>
                            <span className="text-gray-500 mx-1">/</span>
                            <span className="text-accent text-xs">{v.color}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs hidden md:table-cell">{v.sku}</td>
                          <td className="px-4 py-3">
                            <p className="text-gray-400 text-xs uppercase tracking-widest leading-none">Set Price</p>
                            <p className="text-white font-black text-sm mt-0.5">₹{vSet}</p>
                            <p className="text-gray-500 text-xs">₹{parseFloat(v.b2b_price).toFixed(2)}/pc</p>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              value={quantities[v.id] || ''}
                              onChange={(e) => handleQtyChange(v.id, e.target.value)}
                              placeholder="0"
                              className="w-18 bg-primary border border-white/10 text-white rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors w-16"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-4 border-t border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  {totalSelected > 0 && !error && !success && (
                    <p className="text-gray-400 text-sm">Order Total: <span className="text-white font-bold">₹{totalOrderValue.toFixed(2)}</span></p>
                  )}
                  {error && <div className="flex items-center gap-2 text-red-400 text-sm font-semibold"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
                  {success && <div className="flex items-center gap-2 text-green-400 text-sm font-semibold"><CheckCircle2 className="w-4 h-4 shrink-0" />Added to cart!</div>}
                </div>
                <button
                  onClick={handleBulkAdd}
                  disabled={submitting}
                  className="flex items-center gap-2 bg-accent hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-sm uppercase tracking-wide whitespace-nowrap"
                >
                  {submitting ? <Loader className="animate-spin w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                  {submitting ? 'Adding...' : 'Confirm Bulk Order'}
                </button>
              </div>
            </div>

            {/* Description below table */}
            {product.description && (
              <div className="mt-6 bg-secondary rounded-2xl border border-white/5 p-5">
                <h3 className="text-white text-sm font-bold mb-3">Product Details</h3>
                <div className="text-gray-400 text-xs leading-relaxed space-y-1">
                  {decodeHtml(product.description).split('\n').map((line, i) =>
                    line.trim() ? <p key={i}>{line}</p> : null
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default ProductDetail;