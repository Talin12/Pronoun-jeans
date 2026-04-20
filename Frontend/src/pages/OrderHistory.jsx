import React, { useEffect, useState } from 'react';
import api from '../api/axios';

const OrderHistory = () => {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    api.get('orders/history/').then(res => setOrders(res.data));
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Order History</h1>
      <div className="space-y-6">
        {orders.map(order => (
          <div key={order.id} className="bg-secondary p-6 rounded-xl border border-white/5">
            <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-4">
              <div>
                <p className="text-sm text-textMuted">Order #{order.id}</p>
                <p className="font-bold">{new Date(order.created_at).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${order.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-green-500/20 text-green-500'}`}>
                  {order.status}
                </span>
                <p className="text-xl font-bold mt-1">₹{order.total_amount}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {order.items.map(item => (
                <div key={item.id} className="text-sm">
                  <p className="text-textMuted font-medium">{item.variation.product_name}</p>
                  <p>{item.quantity} x {item.variation.size}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrderHistory;