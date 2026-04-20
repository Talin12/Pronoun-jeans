import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { Package, Loader2 } from 'lucide-react';

const Catalog = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Use your local backend URL
  const BACKEND_URL = "http://localhost:8000";

  useEffect(() => {
    api.get('products/catalog/')
      .then(res => {
        const data = res.data.results || res.data || [];
        setProducts(data);
        // Debugging: This will show you exactly what is coming from the DB
        console.log("Raw Product Data from DB:", data); 
        setLoading(false);
      })
      .catch(err => {
        console.error("Fetch error:", err);
        setLoading(false);
      });
  }, []);

  const getImageUrl = (imagePath) => {
    if (!imagePath) return "https://placehold.co/400x500/16171d/white?text=No+Image";
    
    // If the path already includes http, use it as is.
    // If not, prepend the backend URL.
    const fullUrl = imagePath.startsWith('http') ? imagePath : `${BACKEND_URL}${imagePath}`;
    return fullUrl;
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#08060d]">
      <Loader2 className="animate-spin text-purple-500" size={48} />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#08060d] text-white p-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10">
        {products.map((product) => (
          <div key={product.id} className="bg-[#16171d] rounded-3xl overflow-hidden border border-white/5 hover:border-purple-500/30 transition-all group">
            <div className="h-80 bg-black relative overflow-hidden">
              <img 
                src={getImageUrl(product.image)} 
                alt={product.name} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                onError={(e) => {
                  console.error("Image failed to load at:", e.target.src);
                  // Use a different placeholder service that is more reliable
                  e.target.src = "https://placehold.co/400x500/16171d/white?text=Image+Error";
                }}
              />
              <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                <span className="text-xs font-bold text-purple-400">MOQ: {product.moq || 1} Units</span>
              </div>
            </div>
            
            <div className="p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-purple-500 mb-2">
                {product.category_name}
              </p>
              <h3 className="text-xl font-bold mb-6 line-clamp-2 h-14">
                {product.name}
              </h3>
              <button className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-purple-500 hover:text-white transition-all flex items-center justify-center gap-2">
                <Package size={18} /> View Variations
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Catalog;