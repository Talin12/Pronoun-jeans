import React, { useState } from 'react';
import {
  X, Mail, User, Building, Phone, FileText,
  Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import api from '../../api/axios';

const EMPTY_FORM = {
  email:        '',
  first_name:   '',
  last_name:    '',
  company_name: '',
  phone_number: '',
  gst_number:   '',
};

const OnboardBuyerModal = ({ onClose, onSuccess }) => {
  const [form, setForm]           = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [result, setResult]   = useState(null);

  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('accounts/agent/onboard-manual/', form);
      setResult(res.data);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to onboard buyer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/5">
          <div>
            <h3 className="text-gray-900 dark:text-zinc-100 text-lg font-bold">Onboard New Buyer</h3>
            <p className="text-gray-500 dark:text-zinc-400 text-sm mt-0.5">
              Buyer will be verified and mapped to you immediately.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6">
          {/* Success state */}
          {result ? (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center py-2">
                <div className="w-14 h-14 rounded-full bg-green-50 dark:bg-green-500/10 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
                </div>
                <h4 className="text-gray-900 dark:text-zinc-100 font-bold text-base mb-1">Buyer Onboarded!</h4>
                <p className="text-gray-500 dark:text-zinc-400 text-sm">{result.email} has been added to your buyer list.</p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 rounded-xl p-4">
                <p className="text-blue-700 dark:text-blue-400 text-xs font-bold uppercase tracking-widest mb-1">Next Step</p>
                <p className="text-blue-700 dark:text-blue-300 text-sm">
                  Ask <span className="font-bold">{result.email}</span> to visit the portal, click <span className="font-bold">"Forgot Password"</span> on the login page, and set their own password.
                </p>
              </div>

              <button onClick={onClose}
                className="w-full bg-accent hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm transition-colors">
                Done
              </button>
            </div>
          ) : (
            /* Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
                  <AlertCircle className="w-4 h-4 shrink-0" />{error}
                </div>
              )}

              <ModalInput icon={Mail}     label="Business Email *"  type="email" placeholder="buyer@company.com"       value={form.email}        onChange={set('email')} required />

              <div className="grid grid-cols-2 gap-4">
                <ModalInput icon={User}   label="First Name"        placeholder="Rajesh"                               value={form.first_name}   onChange={set('first_name')} />
                <ModalInput icon={User}   label="Last Name"         placeholder="Kumar"                                value={form.last_name}    onChange={set('last_name')} />
              </div>

              <ModalInput icon={Building} label="Company Name *"    placeholder="Kumar Textiles Pvt. Ltd."             value={form.company_name} onChange={set('company_name')} required />
              <ModalInput icon={Phone}    label="Phone Number *"    placeholder="+91 98765 43210"                      value={form.phone_number} onChange={set('phone_number')} required />
              <ModalInput icon={FileText} label="GST Number"        placeholder="22AAAAA0000A1Z5 (optional)"           value={form.gst_number}   onChange={set('gst_number')} />

              <div className="flex items-center gap-3 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 font-bold py-3 rounded-xl text-sm transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-colors">
                  {loading ? <><Loader2 className="animate-spin w-4 h-4" /> Creating…</> : 'Onboard Buyer'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

const ModalInput = ({ icon: Icon, label, type = 'text', placeholder, value, onChange, required }) => (
  <div>
    <label className="text-gray-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest block mb-1.5">{label}</label>
    <div className="relative">
      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500 pointer-events-none" />
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} required={required}
        className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 focus:border-accent text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none transition-colors" />
    </div>
  </div>
);

export default OnboardBuyerModal;