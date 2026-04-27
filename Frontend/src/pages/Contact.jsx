import React, { useState } from 'react';
import { MapPin, Phone, Mail, Send, Loader2 } from 'lucide-react';

const Contact = () => {
  const [form, setForm]       = useState({ name: '', email: '', company: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="bg-gray-50 dark:bg-zinc-950 min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-20">

        <div className="mb-12 text-center">
          <span className="text-accent text-xs font-black uppercase tracking-widest block mb-3">Get in Touch</span>
          <h1 className="text-4xl font-black text-gray-900 dark:text-zinc-100 mb-3">Contact Our Wholesale Team</h1>
          <p className="text-gray-500 dark:text-zinc-400 text-base max-w-xl mx-auto">
            Reach out to discuss bulk orders, partnership inquiries, or any questions about our B2B programme.
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
                  <p className="text-gray-500 dark:text-zinc-400 text-sm mt-0.5 leading-relaxed">
                    Pronoun Jeans Pvt. Ltd.<br />
                    Textile Market, Ring Road<br />
                    Ahmedabad, Gujarat — 380001
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <p className="text-gray-900 dark:text-zinc-100 text-sm font-semibold">Phone</p>
                  <a href="tel:+919876543210" className="text-gray-500 dark:text-zinc-400 hover:text-accent text-sm mt-0.5 block transition-colors">
                    +91 98765 43210
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <p className="text-gray-900 dark:text-zinc-100 text-sm font-semibold">Email</p>
                  <a href="mailto:wholesale@pronoun.in" className="text-gray-500 dark:text-zinc-400 hover:text-accent text-sm mt-0.5 block transition-colors">
                    wholesale@pronoun.in
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-accent/5 border border-accent/20 rounded-2xl p-5">
              <p className="text-accent text-xs font-black uppercase tracking-widest mb-2">Business Hours</p>
              <p className="text-gray-700 dark:text-zinc-300 text-sm">Mon – Sat: 10:00 AM – 6:30 PM</p>
              <p className="text-gray-500 dark:text-zinc-400 text-xs mt-1">Sunday & Public Holidays: Closed</p>
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
                      onChange={v => setForm(p => ({ ...p, name: v }))} required />
                    <FormField label="Email Address *" type="email" placeholder="you@company.com" value={form.email}
                      onChange={v => setForm(p => ({ ...p, email: v }))} required />
                  </div>
                  <FormField label="Company Name" placeholder="Your Company Pvt. Ltd." value={form.company}
                    onChange={v => setForm(p => ({ ...p, company: v }))} />
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

const FormField = ({ label, type = 'text', placeholder, value, onChange, required }) => (
  <div>
    <label className="text-gray-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest block mb-1.5">{label}</label>
    <input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} required={required}
      className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent transition-colors" />
  </div>
);

export default Contact;