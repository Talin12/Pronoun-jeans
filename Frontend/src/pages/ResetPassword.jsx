import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../api/axios';
import Seo from '../components/seo/Seo';

const ResetPassword = () => {
  const { uid, token }                  = useParams();
  const navigate                        = useNavigate();
  const [password, setPassword]         = useState('');
  const [confirm, setConfirm]           = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [loading, setLoading]           = useState(false);
  const [success, setSuccess]           = useState(false);
  const [error, setError]               = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      await api.post('accounts/password-reset/confirm/', { uid, token, password });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'This reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center px-4">
      {/* Canonical deliberately drops the uid/token segments — a one-time reset
          credential has no business in a tag meant to be published. */}
      <Seo
        title="Reset Password"
        description="Set a new password for your Pronoun Jeans wholesale partner account."
        canonical="/reset-password"
        noindex
      />
      <div className="w-full max-w-md">

        <div className="text-center mb-10">
          <span className="text-3xl font-black tracking-tighter text-gray-900 dark:text-zinc-100">
            PRONOUN<span className="text-accent">.</span>
          </span>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mt-2">Wholesale Partner Portal</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm px-8 py-10">
          {success ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-gray-900 dark:text-zinc-100 text-xl font-bold mb-2">Password Reset!</h3>
              <p className="text-gray-500 dark:text-zinc-400 text-sm">Redirecting you to login…</p>
            </div>
          ) : (
            <>
              <h2 className="text-gray-900 dark:text-zinc-100 text-xl font-bold mb-1">Set New Password</h2>
              <p className="text-gray-500 dark:text-zinc-400 text-sm mb-8">Choose a strong password for your account.</p>

              {error && (
                <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-600 dark:text-red-400 text-sm font-medium px-4 py-3 rounded-xl mb-6">
                  <AlertCircle className="w-4 h-4 shrink-0" />{error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="text-gray-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest block mb-1.5">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password} onChange={e => setPassword(e.target.value)}
                      required placeholder="Min. 8 characters"
                      className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 focus:border-accent text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-xl pl-11 pr-11 py-3 text-sm transition-colors focus:outline-none"
                    />
                    <button type="button" onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors p-1">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-gray-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest block mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500 pointer-events-none" />
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={confirm} onChange={e => setConfirm(e.target.value)}
                      required placeholder="Repeat your password"
                      className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 focus:border-accent text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-xl pl-11 pr-11 py-3 text-sm transition-colors focus:outline-none"
                    />
                    <button type="button" onClick={() => setShowConfirm(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors p-1">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2.5 bg-accent hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-6 py-3.5 rounded-xl transition-all text-sm">
                  {loading ? <><Loader2 className="animate-spin w-4 h-4" /> Resetting…</> : 'Reset Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
