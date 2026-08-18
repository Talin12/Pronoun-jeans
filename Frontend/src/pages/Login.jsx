import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import {
  Lock, Mail, ArrowRight, Loader2, AlertCircle,
  CheckCircle2, X, Building, Phone, FileText, Tag, Eye, EyeOff,
} from 'lucide-react';
import api from '../api/axios';

const Login = () => {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [showRequest, setShowRequest]   = useState(false);
  const [showForgot, setShowForgot]     = useState(false);

  const login    = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();
  const from     = location.state?.from?.pathname || null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const decoded = await login(email, password);
      if (decoded?.is_agent) {
        navigate('/agent', { replace: true });
      } else {
        navigate(from || '/', { replace: true });
      }
    } catch (err) {
      const data       = err.response?.data;
      const backendMsg = data?.non_field_errors?.[0] || data?.detail;
      if (err.response?.status === 400 && backendMsg) {
        setError(backendMsg);
      } else {
        setError('Invalid email or password. Please try again.');
      }
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-gray-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">Password</label>
                <button type="button" onClick={() => setShowForgot(true)} className="text-accent text-xs font-semibold hover:underline">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  required placeholder="Enter your password"
                  className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 focus:border-accent text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-xl pl-11 pr-11 py-3 text-sm transition-colors focus:outline-none"
                />
                <button type="button" onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors p-1">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
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

      {showRequest && <RequestAccessModal onClose={() => setShowRequest(false)} />}
      {showForgot  && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
    </div>
  );
};

const RequestAccessModal = ({ onClose }) => {
  const [form, setForm]             = useState({
    email: '', company_name: '', phone_number: '', gst_number: '', agent_code: '', password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [success, setSuccess]           = useState(false);
  const [errors, setErrors]             = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    try {
      await api.post('accounts/request-access/', form);
      setSuccess(true);
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        // Map DRF field errors (e.g. { agent_code: ['Invalid Agent Code'] })
        const fieldErrors = {};
        Object.entries(data).forEach(([key, val]) => {
          fieldErrors[key] = Array.isArray(val) ? val[0] : val;
        });
        setErrors(fieldErrors);
      } else {
        setErrors({ non_field: 'Failed to submit. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const set = (key) => (v) => setForm((p) => ({ ...p, [key]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 shadow-xl p-8 max-h-[90vh] overflow-y-auto">

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
            <p className="text-gray-500 dark:text-zinc-400 text-sm mb-6">
              We'll review your application and reach out within 24 hours.
            </p>
            <button onClick={onClose} className="bg-accent hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.non_field && (
              <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0" />{errors.non_field}
              </div>
            )}

            <ModalInput
              icon={Mail} label="Business Email *" type="email"
              placeholder="you@company.com"
              value={form.email} onChange={set('email')}
              error={errors.email}
            />
            <ModalInput
              icon={Building} label="Company Name *"
              placeholder="Your Company Pvt. Ltd."
              value={form.company_name} onChange={set('company_name')}
              error={errors.company_name}
            />
            <ModalInput
              icon={Phone} label="Phone Number *"
              placeholder="+91 98765 43210"
              value={form.phone_number} onChange={set('phone_number')}
              error={errors.phone_number}
            />
            <ModalInput
              icon={FileText} label="GST Number (optional)"
              placeholder="22AAAAA0000A1Z5"
              value={form.gst_number} onChange={set('gst_number')}
              error={errors.gst_number}
            />

            {/* Divider */}
            <div className="border-t border-gray-100 dark:border-white/5 pt-1" />

            <ModalInput
              icon={Tag} label="Referral / Agent Code (optional)"
              placeholder="e.g. AGT-001"
              value={form.agent_code} onChange={set('agent_code')}
              error={errors.agent_code}
              hint="Enter the code shared by your sales agent to be mapped automatically."
            />

            <div className="border-t border-gray-100 dark:border-white/5 pt-1" />

            <ModalPasswordInput
              label="Set Password *"
              placeholder="Min. 8 characters"
              value={form.password} onChange={set('password')}
              show={showPassword} onToggle={() => setShowPassword(p => !p)}
              error={errors.password}
            />

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

const ModalInput = ({ icon: Icon, label, type = 'text', placeholder, value, onChange, error, hint }) => (
  <div>
    <label className="text-gray-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest block mb-1.5">{label}</label>
    <div className="relative">
      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500 pointer-events-none" />
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full bg-gray-50 dark:bg-zinc-800 border text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none transition-colors ${
          error
            ? 'border-red-300 dark:border-red-500/50 focus:border-red-500'
            : 'border-gray-200 dark:border-white/10 focus:border-accent'
        }`}
      />
    </div>
    {hint && !error && <p className="text-gray-400 dark:text-zinc-500 text-xs mt-1">{hint}</p>}
    {error && <p className="text-red-500 dark:text-red-400 text-sm mt-1">{error}</p>}
  </div>
);

const ModalPasswordInput = ({ label, placeholder, value, onChange, show, onToggle, error, hint }) => (
  <div>
    <label className="text-gray-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest block mb-1.5">{label}</label>
    <div className="relative">
      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500 pointer-events-none" />
      <input
        type={show ? 'text' : 'password'}
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-gray-50 dark:bg-zinc-800 border text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none transition-colors ${
          error
            ? 'border-red-300 dark:border-red-500/50 focus:border-red-500'
            : 'border-gray-200 dark:border-white/10 focus:border-accent'
        }`}
      />
      <button type="button" onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors p-1">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
    {hint && !error && <p className="text-gray-400 dark:text-zinc-500 text-xs mt-1">{hint}</p>}
    {error && <p className="text-red-500 dark:text-red-400 text-sm mt-1">{error}</p>}
  </div>
);

const ForgotPasswordModal = ({ onClose }) => {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.post('accounts/password-reset/', { email: email.trim().toLowerCase() });
      setSuccess(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 shadow-xl p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-gray-900 dark:text-zinc-100 text-lg font-bold">Reset Password</h3>
            <p className="text-gray-500 dark:text-zinc-400 text-sm mt-0.5">Enter your registered email address.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-green-50 dark:bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <h4 className="text-gray-900 dark:text-zinc-100 font-bold mb-2">Check your inbox</h4>
            <p className="text-gray-500 dark:text-zinc-400 text-sm mb-6">
              A password reset link has been sent to <span className="font-medium text-gray-700 dark:text-zinc-300">{email}</span>. Check your spam folder if you don't see it.
            </p>
            <button onClick={onClose} className="bg-accent hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0" />{error}
              </div>
            )}
            <ModalInput
              icon={Mail} label="Email Address" type="email"
              placeholder="partner@company.com"
              value={email} onChange={setEmail}
            />
            <button type="submit" disabled={loading || !email.trim()}
              className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-red-700 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors">
              {loading ? <><Loader2 className="animate-spin w-4 h-4" /> Sending…</> : 'Send Reset Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;