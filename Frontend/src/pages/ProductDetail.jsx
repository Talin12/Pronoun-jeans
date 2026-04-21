import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, BadgeCheck, ShoppingCart, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../api/axios';

const BACKEND_URL = 'http://localhost:8000';

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
    const qty = parseInt(value) || 0;
    setQuantities(prev => ({ ...prev, [variationId]: qty }));
    setError('');
    setSuccess(false);
  };

  const totalSelected = Object.values(quantities).reduce((sum, q) => sum + q, 0);

  const handleBulkAdd = async () => {
    setError('');
    setSuccess(false);

    const itemsToAdd = Object.entries(quantities).filter(([, qty]) => qty > 0);

    if (itemsToAdd.length === 0) {
      setError('Please enter a quantity for at least one variation.');
      return;
    }

    if (totalSelected < product.moq) {
      setError(`Minimum order quantity is ${product.moq} units total. You have selected ${totalSelected}.`);
      return;
    }

    setSubmitting(true);
    try {
      await Promise.all(
        itemsToAdd.map(([id, qty]) =>
          api.post('orders/cart/update/', { variation_id: parseInt(id), quantity: qty })
        )
      );
      setSuccess(true);
      setQuantities({});
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update cart. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-primary">
      <Loader className="animate-spin text-accent w-10 h-10" />
    </div>
  );

  if (!product) return (
    <div className="flex items-center justify-center min-h-screen bg-primary">
      <p className="text-gray-400 text-lg">Product not found.</p>
    </div>
  );

  const imageUrl = product.image
    ? product.image.startsWith('http') ? product.image : `${BACKEND_URL}${product.image}`
    : 'https://via.placeholder.com/600x600?text=No+Image';

  return (
    <div className="bg-primary min-h-screen p-8 lg:p-12">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-accent hover:text-white transition-colors mb-8 text-sm font-semibold"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex flex-col lg:flex-row gap-10 mb-12">
        <div className="lg:w-1/2">
          <div className="rounded-2xl overflow-hidden bg-secondary border border-white/5 h-[480px]">
            <img
              src={imageUrl}
              alt={product.name}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.src = 'https://via.placeholder.com/600x600?text=No+Image'; }}
            />
          </div>
        </div>

        <div className="lg:w-1/2 flex flex-col justify-center">
          <p className="text-accent text-xs font-bold uppercase tracking-widest mb-2">
            {product.category_name}
          </p>
          <h1 className="text-white text-3xl font-bold leading-snug mb-4">
            {product.name}
          </h1>

          <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/30 text-accent text-sm font-semibold px-4 py-2 rounded-full mb-6 w-fit">
            <BadgeCheck className="w-4 h-4" />
            Minimum Order Quantity: {product.moq} units
          </div>

          {product.description && (
            <div className="text-gray-400 text-sm leading-relaxed whitespace-pre-line border-t border-white/5 pt-6">
              {product.description}
            </div>
          )}

          {product.fabric_details && (
            <div className="mt-4 text-gray-500 text-xs leading-relaxed">
              <span className="text-gray-300 font-semibold">Fabric: </span>
              {product.fabric_details}
            </div>
          )}
        </div>
      </div>

      <div className="bg-secondary rounded-2xl border border-white/5 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-white text-xl font-bold">Bulk Order Table</h2>
          <span className="text-gray-400 text-sm">
            {totalSelected > 0 && (
              <span className={`font-semibold ${totalSelected >= product.moq ? 'text-green-400' : 'text-yellow-400'}`}>
                {totalSelected} / {product.moq} units selected
              </span>
            )}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs uppercase tracking-widest border-b border-white/5">
                <th className="text-left px-6 py-4">Size / Color</th>
                <th className="text-left px-6 py-4">SKU</th>
                <th className="text-left px-6 py-4">Wholesale Price</th>
                <th className="text-left px-6 py-4 w-40">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {product.variations.map((v, idx) => (
                <tr
                  key={v.id}
                  className={`border-b border-white/5 transition-colors ${
                    quantities[v.id] > 0 ? 'bg-accent/5' : idx % 2 === 0 ? 'bg-white/[0.02]' : ''
                  }`}
                >
                  <td className="px-6 py-4">
                    <span className="text-white font-semibold">{v.size}</span>
                    <span className="text-gray-400 mx-2">/</span>
                    <span className="text-gray-300">{v.color}</span>
                  </td>
                  <td className="px-6 py-4 text-gray-400 font-mono text-xs">{v.sku}</td>
                  <td className="px-6 py-4 text-accent font-bold">₹{v.b2b_price}</td>
                  <td className="px-6 py-4">
                    <input
                      type="number"
                      min="0"
                      value={quantities[v.id] || ''}
                      onChange={(e) => handleQtyChange(v.id, e.target.value)}
                      placeholder="0"
                      className="w-24 bg-primary border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Added to cart successfully!
              </div>
            )}
          </div>
          <button
            onClick={handleBulkAdd}
            disabled={submitting}
            className="flex items-center gap-2 bg-accent hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-8 py-3 rounded-xl transition-colors duration-200 text-sm"
          >
            {submitting
              ? <Loader className="animate-spin w-4 h-4" />
              : <ShoppingCart className="w-4 h-4" />
            }
            {submitting ? 'Adding...' : 'Add Selected to Cart'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;