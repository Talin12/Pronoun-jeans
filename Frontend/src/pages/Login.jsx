import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { Lock, Mail, Loader2 } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/catalog');
    } catch (err) {
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-primary px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md p-8 bg-secondary rounded-xl border border-white/10 shadow-2xl">
        <h2 className="text-3xl font-bold text-textMain mb-2 text-center">B2B Portal</h2>
        <p className="text-textMuted mb-8 text-center">Enter your credentials to access wholesale pricing</p>
        
        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 text-red-500 text-sm rounded">{error}</div>}

        <div className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-3 text-textMuted" size={20} />
            <input 
              type="email" placeholder="Email Address" required
              className="w-full bg-primary border border-white/10 rounded-lg py-3 pl-10 pr-4 focus:border-accent outline-none transition-all"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 text-textMuted" size={20} />
            <input 
              type="password" placeholder="Password" required
              className="w-full bg-primary border border-white/10 rounded-lg py-3 pl-10 pr-4 focus:border-accent outline-none transition-all"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <button 
          disabled={loading}
          className="w-full mt-8 bg-accent hover:bg-accent/90 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Login to Dashboard'}
        </button>
      </form>
    </div>
  );
};

export default Login;