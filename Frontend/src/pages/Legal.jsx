import React from 'react';

// ── Pre-built policy pages ────────────────────────────────────────────────────

const TERMS_SECTIONS = [
  {
    id: 'eligibility', title: 'Eligibility',
    body: `Access to Pronoun Jeans' wholesale portal is restricted to verified B2B partners, registered businesses, and authorised retail buyers. By accessing this portal, you confirm that you are purchasing for resale or commercial purposes, not for personal use.`,
  },
  {
    id: 'orders', title: 'Orders & MOQ',
    body: `All orders are subject to a Minimum Order Quantity (MOQ) as specified on each product listing. Orders below MOQ will not be processed. We reserve the right to cancel or hold orders that cannot be fulfilled due to stock constraints, and will notify you promptly in such cases.`,
  },
  {
    id: 'pricing', title: 'Pricing & Payment',
    body: `All prices displayed are exclusive of GST unless stated otherwise. Payment terms vary by payment method selected at checkout. Razorpay orders must be settled immediately. Net-30 and bank transfer orders are subject to credit approval and formal invoice terms.`,
  },
  {
    id: 'shipping', title: 'Shipping & Delivery',
    body: `We ship Pan-India via trusted logistics partners. Estimated delivery is 5–10 business days from dispatch confirmation. Risk of loss transfers to the buyer upon handover to the logistics partner. Pronoun Jeans is not liable for delays caused by courier partners or force majeure events.`,
  },
  {
    id: 'ip', title: 'Intellectual Property',
    body: `All product imagery, branding, and content on this portal are the intellectual property of Pronoun Jeans Pvt. Ltd. Partners may use approved product images solely for the purpose of retail resale. Reproduction, distribution, or modification of any content without prior written consent is strictly prohibited.`,
  },
  {
    id: 'termination', title: 'Termination',
    body: `We reserve the right to suspend or terminate portal access for any partner found to be in violation of these terms, engaging in fraudulent activity, or misrepresenting their business credentials. Termination does not affect the settlement of any outstanding dues.`,
  },
];

const PRIVACY_SECTIONS = [
  {
    id: 'collection', title: 'Information We Collect',
    body: `We collect business information you provide during registration, including company name, GST number, contact details, and order history. We also collect usage data such as pages visited and actions taken within the portal for analytics and security purposes.`,
  },
  {
    id: 'use', title: 'How We Use Your Information',
    body: `Your information is used to process orders, manage your partner account, communicate about shipments and invoices, and improve our portal experience. We do not use your data for unsolicited marketing without your explicit consent.`,
  },
  {
    id: 'sharing', title: 'Data Sharing',
    body: `We do not sell or rent your personal or business data to third parties. We share necessary information with logistics partners to fulfil orders, and with payment processors (Razorpay) to handle transactions. All third parties are bound by confidentiality agreements.`,
  },
  {
    id: 'security', title: 'Data Security',
    body: `All data is transmitted over HTTPS. Passwords are hashed and never stored in plain text. We implement industry-standard security measures including access controls and regular security audits. However, no system is completely immune to risk, and we encourage strong password practices.`,
  },
  {
    id: 'rights', title: 'Your Rights',
    body: `You have the right to access, correct, or request deletion of your business data at any time. To exercise these rights, contact us at wholesale@pronoun.in. We will respond to all valid requests within 7 working days.`,
  },
];

const REFUND_SECTIONS = [
  {
    id: 'eligibility', title: 'Return Eligibility',
    body: `Returns are accepted only for products that are defective, damaged in transit, or significantly different from what was ordered. All return claims must be raised within 48 hours of delivery with photographic evidence of the issue.`,
  },
  {
    id: 'process', title: 'Return Process',
    body: `To initiate a return, email wholesale@pronoun.in with your Order ID, a description of the issue, and supporting images. Our quality team will review your claim within 3 business days. Approved returns must be shipped back in original packaging.`,
  },
  {
    id: 'refunds', title: 'Refunds',
    body: `Approved refunds will be processed within 7–10 business days of receiving the returned goods. Refunds are issued to the original payment method. For bank transfer orders, refunds are credited via NEFT/RTGS within the same period.`,
  },
  {
    id: 'exclusions', title: 'Non-Returnable Items',
    body: `Items that have been used, washed, altered, or damaged by the buyer are not eligible for return. Bulk orders where the return claim exceeds 5% of the total units ordered are subject to additional review and approval by our management team.`,
  },
];

const PAGES = {
  terms:   { title: 'Terms & Conditions',  updated: 'April 2026', sections: TERMS_SECTIONS },
  privacy: { title: 'Privacy Policy',       updated: 'April 2026', sections: PRIVACY_SECTIONS },
  refund:  { title: 'Refund Policy',        updated: 'April 2026', sections: REFUND_SECTIONS },
};

// ── Reusable Legal Layout ─────────────────────────────────────────────────────

const Legal = ({ page = 'terms' }) => {
  const { title, updated, sections } = PAGES[page] || PAGES.terms;

  return (
    <div className="bg-gray-50 dark:bg-zinc-950 min-h-screen">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-white/5 bg-white dark:bg-zinc-900">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <p className="text-accent text-xs font-black uppercase tracking-widest mb-2">Legal</p>
          <h1 className="text-3xl font-black text-gray-900 dark:text-zinc-100">{title}</h1>
          <p className="text-gray-400 dark:text-zinc-500 text-sm mt-2">Last updated: {updated}</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 flex gap-10 items-start">

        {/* Sticky TOC */}
        <aside className="hidden lg:block w-52 shrink-0 sticky top-24">
          <p className="text-gray-400 dark:text-zinc-500 text-xs font-black uppercase tracking-widest mb-4">Contents</p>
          <nav className="space-y-1">
            {sections.map((s, i) => (
              <a key={s.id} href={`#${s.id}`}
                className="flex items-center gap-2 text-sm text-gray-500 dark:text-zinc-400 hover:text-accent dark:hover:text-accent transition-colors py-1">
                <span className="text-accent font-bold text-xs w-4">{i + 1}.</span>
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-28">
              <h2 className="text-gray-900 dark:text-zinc-100 text-lg font-bold mb-3 flex items-center gap-2">
                <span className="text-accent text-sm font-black">{i + 1}.</span>
                {s.title}
              </h2>
              <p className="text-gray-600 dark:text-zinc-400 text-sm leading-7">{s.body}</p>
            </section>
          ))}

          {/* Contact note */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 p-6 shadow-sm mt-6">
            <p className="text-gray-600 dark:text-zinc-400 text-sm leading-relaxed">
              Questions about this policy? Contact us at{' '}
              <a href="mailto:wholesale@pronoun.in" className="text-accent hover:underline font-semibold">
                wholesale@pronoun.in
              </a>{' '}
              or call <a href="tel:+919876543210" className="text-accent hover:underline font-semibold">+91 98765 43210</a>.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Legal;