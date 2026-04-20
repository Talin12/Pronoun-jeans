import React from 'react';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="text-center py-20 px-6">
      <h1 className="text-5xl font-black mb-6">PRONOUN JEANS</h1>
      <p className="max-w-2xl mx-auto text-lg text-gray-600 mb-10">
        Fashion Should Empower, Not Constrict – Comfort is the Ultimate Luxury.
      </p>
      <button 
        onClick={() => navigate('/catalog')}
        className="bg-black text-white px-10 py-4 rounded-full font-bold"
      >
        VIEW WHOLESALE SHOP
      </button>
    </div>
  );
};

export default Home;