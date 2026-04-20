import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/axios';
import { ShoppingCart, CheckCircle, AlertCircle } from 'lucide-react';

const ProductDetail = () => {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [quantities, setQuantities] = useState({}); // { variationId: quantity }
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.get(`products/catalog/${slug}/`).then(res => setProduct(res.data));
  }, [slug]);

  const handleQtyChange = (varId, val) => {
    setQuantities({ ...quantities, [varId]: parseInt(val) || 0 });
  };

  const handleBulkAdd = async () => {
    try {
      const itemsToAdd = Object.entries(quantities).filter(([_, qty]) => qty > 0);
      for (const [varId, qty] of itemsToAdd) {
        if (qty < product.moq) {
          setStatus(`Error: Minimum order for this product is ${product.moq} units.`);
          return;
        }
        await api.post('orders/cart/update/', { variation_id: varId, quantity: qty });
      }
      setStatus('Success: Items added to cart!');
    } catch (err) {
      setStatus('Failed to add items. Check connection.');
    }
  };

  if (!product) return <div className="p-20 text-center">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-12">
      <img src={product.image || '/placeholder.png'} className="rounded-2xl border border-white/10" alt={product.name} />
      <div>
        <h1 className="text-4xl font-bold mb-4">{product.name}</h1>
        <p className="text-textMuted mb-8">{product.description}</p>
        
        <div className="bg-secondary p-6 rounded-xl border border-white/5">
          <h3 className="font-bold mb-4">Bulk Order Table (MOQ: {product.moq})</h3>
          <table className="w-full text-left">
            <thead>
              <tr className="text-textMuted text-sm border-b border-white/10">
                <th className="pb-2">Size/Color</th>
                <th className="pb-2 text-right">Wholesale Price</th>
                <th className="pb-2 text-right w-24">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {product.variations.map(v => (
                <tr key={v.id} className="border-b border-white/5">
                  <td className="py-3 font-medium">{v.size} / {v.color}</td>
                  <td className="py-3 text-right text-accent font-bold">₹{v.b2b_price}</td>
                  <td className="py-3 text-right">
                    <input 
                      type="number" min="0" placeholder="0"
                      className="w-16 bg-primary border border-white/10 rounded px-2 py-1 text-right focus:border-accent outline-none"
                      onChange={(e) => handleQtyChange(v.id, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleBulkAdd} className="w-full mt-6 bg-accent py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-accent/90 transition-all">
            <ShoppingCart size={20} /> Add Selected to Cart
          </button>
          {status && <p className="mt-4 text-center text-sm font-medium">{status}</p>}
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;