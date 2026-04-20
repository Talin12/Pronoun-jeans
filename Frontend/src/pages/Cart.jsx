import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { Trash2, CreditCard } from 'lucide-react';

const Cart = () => {
  const [cart, setCart] = useState(null);

  const fetchCart = () => api.get('orders/cart/').then(res => setCart(res.data));
  useEffect(() => { fetchCart(); }, []);

  const handleCheckout = async () => {
    try {
      const res = await api.post('orders/checkout/');
      alert(`Order ${res.data.id} Placed Successfully! Total: ₹${res.data.total_amount}`);
      fetchCart();
    } catch (err) {
      alert("Checkout failed. Ensure cart is not empty.");
    }
  };

  if (!cart || cart.items.length === 0) return <div className="p-20 text-center">Your cart is empty.</div>;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8 text-center">Your Bulk Order Cart</h1>
      <div className="space-y-4">
        {cart.items.map(item => (
          <div key={item.id} className="bg-secondary p-4 rounded-xl border border-white/5 flex justify-between items-center">
            <div>
              <p className="font-bold text-lg">{item.variation.product_name}</p>
              <p className="text-sm text-textMuted">Size: {item.variation.size} | Color: {item.variation.color}</p>
              <p className="text-accent font-medium mt-1">{item.quantity} units @ ₹{item.variation.b2b_price}</p>
            </div>
            <button className="text-red-500 hover:bg-red-500/10 p-2 rounded-full transition-all">
              <Trash2 size={20} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-12 p-6 bg-white/5 rounded-xl border border-white/10 text-center">
        <p className="text-textMuted mb-2">Order summary will be calculated at next step</p>
        <button onClick={handleCheckout} className="w-full max-w-sm bg-white text-primary font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200 transition-all">
          <CreditCard size={20} /> Place Bulk Order
        </button>
      </div>
    </div>
  );
};

export default Cart;