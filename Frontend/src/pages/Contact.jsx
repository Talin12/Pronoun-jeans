import React, { useState } from 'react';
import { MapPin, Phone, Mail, Send, Loader2 } from 'lucide-react';
import Seo from '../components/seo/Seo';
import JsonLd from '../components/seo/JsonLd';
import { contactLocalBusinessSchema } from '../config/schema';
import { usePrerenderReady } from '../hooks/usePrerenderReady';
import {
  BUSINESS, ADDRESS_LINES, CONTACT_TITLE, CONTACT_DESCRIPTION, CONTACT_HEADING, CONTACT_INTRO,
  formatPhone, telHref, waHref, WHATSAPP_ENQUIRY,
} from '../content/seoContent';
import { ASSUMPTIONS } from '../content/assumptions';
import { mobileFieldError, normaliseIndianMobile } from '../utils/indianMobile';

const Contact = () => {
  const [form, setForm] = useState({
    name: '', email: '', mobile: '', company: '', message: '', whatsappOptIn: false,
  });
  const [mobileError, setMobileError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  usePrerenderReady();

  const setField = (key) => (value) => setForm((p) => ({ ...p, [key]: value }));

  // WARNING: nothing receives this submission. There is no endpoint, no model
  // and no notification email anywhere in the repo — handleSubmit has only
  // ever flipped `submitted`, so every enquiry typed into this form since it
  // shipped has been discarded while the page answered "Message Sent!". The
  // mobile number and the WhatsApp opt-in below are normalised and held in
  // state ready to post, but until a POST target exists they go the same way.
  // Reported to the client 18 Nov 2026; do not read this as working.
  const handleSubmit = (e) => {
    e.preventDefault();
    const error = mobileFieldError(form.mobile, { required: ASSUMPTIONS.mobileRequired });
    setMobileError(error);
    if (error) return;
    // The ten-digit form, which is what any future endpoint should store.
    setForm((p) => ({ ...p, mobile: normaliseIndianMobile(p.mobile) }));
    setSubmitted(true);
  };

  return (
    <div className="bg-gray-50 dark:bg-zinc-950 min-h-screen">
      <Seo
        title={CONTACT_TITLE}
        description={CONTACT_DESCRIPTION}
        canonical="/contact"
      >
        <JsonLd data={contactLocalBusinessSchema()} />
      </Seo>
      <div className="max-w-5xl mx-auto px-6 py-20">

        <div className="mb-12 text-center">
          <span className="text-accent text-xs font-black uppercase tracking-widest block mb-3">Get in Touch</span>
          <h1 className="text-4xl font-black text-gray-900 dark:text-zinc-100 mb-3">{CONTACT_HEADING}</h1>
          <p className="text-gray-500 dark:text-zinc-400 text-base max-w-xl mx-auto">
            {CONTACT_INTRO}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">

          {/* Left — contact details */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 p-6 shadow-sm space-y-5">
              <h2 className="text-gray-900 dark:text-zinc-100 font-bold text-base">Our Details</h2>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <p className="text-gray-900 dark:text-zinc-100 text-sm font-semibold">Address</p>
                  <a href={BUSINESS.mapUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 dark:text-zinc-400 hover:text-accent text-sm mt-0.5 leading-relaxed block transition-colors">
                    {[BUSINESS.displayName, ...ADDRESS_LINES].map((line, i) => (
                      <React.Fragment key={line}>{i > 0 && <br />}{line}</React.Fragment>
                    ))}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <p className="text-gray-900 dark:text-zinc-100 text-sm font-semibold">Phone</p>
                  <a href={telHref(BUSINESS.phone)} className="text-gray-500 dark:text-zinc-400 hover:text-accent text-sm mt-0.5 block transition-colors">
                    {formatPhone(BUSINESS.phone)}
                  </a>
                  <a href={waHref(BUSINESS.whatsapp, WHATSAPP_ENQUIRY)} target="_blank" rel="noopener noreferrer" className="text-gray-500 dark:text-zinc-400 hover:text-accent text-sm mt-0.5 block transition-colors">
                    WhatsApp: {formatPhone(BUSINESS.whatsapp)}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <p className="text-gray-900 dark:text-zinc-100 text-sm font-semibold">Email</p>
                  <a href={`mailto:${BUSINESS.email}`} className="text-gray-500 dark:text-zinc-400 hover:text-accent text-sm mt-0.5 block transition-colors">
                    {BUSINESS.email}
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-accent/5 border border-accent/20 rounded-2xl p-5">
              <p className="text-accent text-xs font-black uppercase tracking-widest mb-2">Business Hours</p>
              <p className="text-gray-700 dark:text-zinc-300 text-sm">{BUSINESS.hoursLabel}</p>
              {BUSINESS.closedLabel && (
                <p className="text-gray-500 dark:text-zinc-400 text-xs mt-1">{BUSINESS.closedLabel}</p>
              )}
            </div>
          </div>

          {/* Right — message form */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 p-8 shadow-sm">
              <h2 className="text-gray-900 dark:text-zinc-100 font-bold text-base mb-6">Send us a Message</h2>

              {submitted ? (
                <div className="text-center py-10">
                  <div className="w-14 h-14 rounded-full bg-green-50 dark:bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                    <Send className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-gray-900 dark:text-zinc-100 font-bold mb-2">Message Sent!</h3>
                  <p className="text-gray-500 dark:text-zinc-400 text-sm">Our team will get back to you within 24 hours.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="Your Name *" placeholder="Rajesh Kumar" value={form.name}
                      onChange={setField('name')} required />
                    <FormField label="Email Address *" type="email" placeholder="you@company.com" value={form.email}
                      onChange={setField('email')} required />
                  </div>

                  {/* Phone is the primary channel in this trade, so it sits
                      directly under the email and ahead of the company name. */}
                  <FormField
                    label={`Mobile Number${ASSUMPTIONS.mobileRequired ? ' *' : ''}`}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="+91 98765 43210"
                    value={form.mobile}
                    onChange={(v) => { setForm(p => ({ ...p, mobile: v })); if (mobileError) setMobileError(''); }}
                    onBlur={() => setMobileError(
                      mobileFieldError(form.mobile, { required: ASSUMPTIONS.mobileRequired }),
                    )}
                    required={ASSUMPTIONS.mobileRequired}
                    error={mobileError}
                    errorId="contact-mobile-error"
                  />

                  {ASSUMPTIONS.whatsappConsentCheckbox && (
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.whatsappOptIn}
                        onChange={e => setForm(p => ({ ...p, whatsappOptIn: e.target.checked }))}
                        className="mt-0.5 w-4 h-4 rounded border-gray-300 dark:border-white/20 bg-gray-50 dark:bg-zinc-800 text-accent accent-accent focus:outline-none focus:ring-2 focus:ring-accent/40 shrink-0"
                      />
                      <span className="text-gray-500 dark:text-zinc-400 text-xs leading-relaxed">
                        You may contact me on WhatsApp about this enquiry.
                      </span>
                    </label>
                  )}

                  <FormField label="Company Name" placeholder="Your Company Pvt. Ltd." value={form.company}
                    onChange={setField('company')} />
                  <div>
                    <label className="text-gray-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest block mb-1.5">Message *</label>
                    <textarea rows={5} required placeholder="Tell us about your requirements — categories, quantities, locations..."
                      value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                      className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent transition-colors resize-none" />
                  </div>
                  <button type="submit"
                    className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-red-700 text-white font-bold px-6 py-3.5 rounded-xl transition-colors text-sm">
                    <Send className="w-4 h-4" /> Send Message
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// The error styling is the one the sign-in modal's fields already use
// (src/pages/Login.jsx), so a bad mobile number looks like every other
// rejected field on the site rather than like a new invention.
const FormField = ({
  label, type = 'text', placeholder, value, onChange, required,
  inputMode, autoComplete, onBlur, error, errorId,
}) => (
  <div>
    <label className="text-gray-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest block mb-1.5">{label}</label>
    <input
      type={type} placeholder={placeholder} value={value}
      onChange={e => onChange(e.target.value)} onBlur={onBlur} required={required}
      inputMode={inputMode} autoComplete={autoComplete}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? errorId : undefined}
      className={`w-full bg-gray-50 dark:bg-zinc-800 border text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors ${
        error
          ? 'border-red-300 dark:border-red-500/50 focus:border-red-500'
          : 'border-gray-200 dark:border-white/10 focus:border-accent'
      }`} />
    {error && <p id={errorId} className="text-red-500 dark:text-red-400 text-sm mt-1">{error}</p>}
  </div>
);

export default Contact;