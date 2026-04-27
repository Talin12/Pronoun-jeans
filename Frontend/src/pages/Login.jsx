import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { Lock, Mail, ArrowRight, Loader2, AlertCircle, CheckCircle2, X, Building, Phone, FileText } from 'lucide-react';
import api from '../api/axios';

const Login = () => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [showRequest, setShowRequest] = useState(false);

  const login    = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();
  const from     = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-10">
          <span className="text-3xl font-black tracking-tighter text-gray-900 dark:text-zinc-100">
            PRONOUN<span className="text-accent">.</span>
          </span>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mt-2">Wholesale Partner Portal</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm px-8 py-10">
          <h2 className="text-gray-900 dark:text-zinc-100 text-xl font-bold mb-1">Sign in to your account</h2>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mb-8">Enter your credentials to access wholesale pricing.</p>

          {error && (
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-600 dark:text-red-400 text-sm font-medium px-4 py-3 rounded-xl mb-6">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-gray-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest block mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500 pointer-events-none" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="partner@company.com"
                  className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 focus:border-accent text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-xl pl-11 pr-4 py-3 text-sm transition-colors focus:outline-none" />
              </div>
            </div>

            <div>
              <label className="text-gray-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest block mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500 pointer-events-none" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••••••"
                  className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 focus:border-accent text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-xl pl-11 pr-4 py-3 text-sm transition-colors focus:outline-none" />
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 bg-accent hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-6 py-3.5 rounded-xl transition-all text-sm">
              {loading ? <><Loader2 className="animate-spin w-4 h-4" /> Signing in…</> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        </div>

        <div className="text-center mt-6 space-y-2">
          <p className="text-gray-400 dark:text-zinc-600 text-xs leading-relaxed">
            Access is restricted to approved wholesale partners.
          </p>
          <button onClick={() => setShowRequest(true)} className="text-accent text-xs font-semibold hover:underline">
            Request Partner Access →
          </button>
        </div>
      </div>

      {/* Request Access Modal */}
      {showRequest && <RequestAccessModal onClose={() => setShowRequest(false)} />}
    </div>
  );
};

const RequestAccessModal = ({ onClose }) => {
  const [form, setForm]         = useState({ email: '', company_name: '', phone_number: '', gst_number: '' });
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('accounts/request-access/', form);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 shadow-xl p-8">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-gray-900 dark:text-zinc-100 text-lg font-bold">Request Partner Access</h3>
            <p className="text-gray-500 dark:text-zinc-400 text-sm mt-0.5">Our team will review and contact you.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-green-50 dark:bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <h4 className="text-gray-900 dark:text-zinc-100 font-bold text-base mb-2">Request Submitted!</h4>
            <p className="text-gray-500 dark:text-zinc-400 text-sm mb-6">We'll review your application and reach out within 24 hours.</p>
            <button onClick={onClose} className="bg-accent hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0" />{error}
              </div>
            )}

            <ModalInput icon={Mail} label="Business Email *" type="email" placeholder="you@company.com"
              value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} />

            <ModalInput icon={Building} label="Company Name *" placeholder="Your Company Pvt. Ltd."
              value={form.company_name} onChange={v => setForm(p => ({ ...p, company_name: v }))} />

            <ModalInput icon={Phone} label="Phone Number *" placeholder="+91 98765 43210"
              value={form.phone_number} onChange={v => setForm(p => ({ ...p, phone_number: v }))} />

            <ModalInput icon={FileText} label="GST Number (optional)" placeholder="22AAAAA0000A1Z5"
              value={form.gst_number} onChange={v => setForm(p => ({ ...p, gst_number: v }))} />

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-red-700 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm mt-2">
              {loading ? <><Loader2 className="animate-spin w-4 h-4" /> Submitting…</> : 'Submit Request'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

const ModalInput = ({ icon: Icon, label, type = 'text', placeholder, value, onChange }) => (
  <div>
    <label className="text-gray-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest block mb-1.5">{label}</label>
    <div className="relative">
      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500 pointer-events-none" />
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 focus:border-accent text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none transition-colors" />
    </div>
  </div>
);

export default Login;