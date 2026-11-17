import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Package, Ruler, Layers, Truck, Feather, Scissors, IndianRupee,
  MapPin, Phone, Mail, Clock, Sparkles, BadgeCheck, Store, Shirt,
} from 'lucide-react';
import Seo from '../components/seo/Seo';
import { usePrerenderReady } from '../hooks/usePrerenderReady';
import {
  ABOUT_TITLE, ABOUT_DESCRIPTION, BUSINESS, mark, formatPhone, telHref,
} from '../content/seoContent';
import { aboutContent, aboutAddressLines, aboutHighlights } from '../content/aboutContent';

// The copy lives in src/content/aboutContent.js, which aboutPage() in
// api/render.js renders from too — the server HTML and this page cannot say
// different things. Which of the client's two texts appears is decided by
// ASSUMPTIONS.aboutVariant. Everything below is layout: no sentence is
// written here, and the business facts come from BUSINESS.

const HIGHLIGHT_ICONS = { package: Package, ruler: Ruler, layers: Layers, truck: Truck };

// One icon per value card, by the card's id. A card the client adds later
// falls back to a neutral mark rather than breaking the grid.
const CARD_ICONS = {
  'comfort-first': Feather,
  'quality-craftsmanship': Scissors,
  'honest-pricing': IndianRupee,
};

// Section headings get a quiet mark so the page reads as a sequence rather
// than a wall. Unknown ids fall back, so new sections need no code change.
const SECTION_ICONS = {
  'who-we-are': Store,
  'designed-for-comfort': Feather,
  'products-quality': Shirt,
  'quality-that-makes-a-difference': BadgeCheck,
  'wholesale-ordering': Package,
  'supporting-retailers': Truck,
  'serving-buyers': Truck,
  'what-we-stand-for': Sparkles,
  'our-philosophy': Sparkles,
  'our-commitment': BadgeCheck,
};

const AboutUs = () => {
  const { h1, tagline, intro, sections, closing } = aboutContent();
  const highlights = aboutHighlights();
  usePrerenderReady();

  return (
    <div className="bg-gray-50 dark:bg-zinc-950 min-h-screen">
      <Seo title={ABOUT_TITLE} description={ABOUT_DESCRIPTION} canonical="/about" />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-gray-200 dark:border-white/5 bg-white dark:bg-zinc-900">
        {/* Soft accent wash. Pointer-events-none so it never eats a click. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 w-[28rem] h-[28rem] rounded-full bg-accent/5 blur-3xl" />
          <div className="absolute -bottom-32 -left-24 w-[24rem] h-[24rem] rounded-full bg-accent/5 blur-3xl" />
        </div>

        {/* Tighter top padding on a phone: it removes dead space above the
            fold and, with it, the overlap between the floating WhatsApp
            button (fixed bottom-right) and this section's primary CTA. */}
        <div className="relative max-w-5xl mx-auto px-6 pt-10 sm:pt-20 pb-14 sm:pb-16 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5 text-accent text-xs font-black uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5" />
            {mark(BUSINESS.brand)}
          </span>

          <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 dark:text-zinc-100 leading-[1.08] tracking-tight">
            {h1}
          </h1>

          <p className="mt-6 text-lg sm:text-xl font-bold text-gray-700 dark:text-zinc-300 max-w-3xl mx-auto leading-relaxed">
            {tagline}
          </p>

          {(intro ?? []).length > 0 && (
            <div className="mt-8 space-y-4 max-w-3xl mx-auto text-left">
              {intro.map((para) => (
                <p key={para.slice(0, 40)} className="text-base text-gray-600 dark:text-zinc-400 leading-relaxed">
                  {para}
                </p>
              ))}
            </div>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/catalog"
              className="inline-flex items-center gap-2 bg-accent hover:bg-red-700 text-white font-bold px-7 py-3 rounded-full transition-colors text-sm"
            >
              Browse Wholesale Catalog <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-800 hover:border-accent dark:hover:border-accent text-gray-900 dark:text-zinc-100 font-bold px-7 py-3 rounded-full transition-colors text-sm"
            >
              Talk to our team
            </Link>
          </div>
        </div>
      </section>

      {/* ── What a buyer checks first ────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 -mt-8 relative z-10">
        {/* Two up on a phone rather than four full-width rows of mostly
            whitespace; four across once there is room. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {highlights.map((item) => {
            const Icon = HIGHLIGHT_ICONS[item.icon] ?? Package;
            return (
              <div
                key={item.label}
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 p-5 shadow-sm"
              >
                <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-3">
                  <Icon className="w-4 h-4 text-accent" />
                </div>
                <p className="text-gray-400 dark:text-zinc-500 text-[11px] font-black uppercase tracking-widest">
                  {item.label}
                </p>
                <p className="mt-1 text-gray-900 dark:text-zinc-100 text-sm font-bold leading-snug">
                  {item.value}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── The client's sections ────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 py-16 sm:py-20 space-y-14 sm:space-y-16">
        {sections.map((section) => {
          const Icon = SECTION_ICONS[section.id] ?? BadgeCheck;

          if (section.cards) {
            return (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <SectionHeading icon={Icon} text={section.heading} centered />
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-5">
                  {section.cards.map((card) => {
                    const CardIcon = CARD_ICONS[card.id] ?? BadgeCheck;
                    return (
                      <div
                        key={card.title}
                        className="group bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 p-6 shadow-sm hover:border-accent/40 hover:shadow-md transition-all"
                      >
                        <div className="w-11 h-11 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4 group-hover:bg-accent group-hover:border-accent transition-colors">
                          <CardIcon className="w-5 h-5 text-accent group-hover:text-white transition-colors" />
                        </div>
                        <h3 className="text-gray-900 dark:text-zinc-100 font-bold text-base mb-2">{card.title}</h3>
                        <p className="text-gray-500 dark:text-zinc-400 text-sm leading-relaxed">{card.body}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          }

          return (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 p-7 sm:p-10 shadow-sm">
                <SectionHeading icon={Icon} text={section.heading} />
                <div className="mt-5 space-y-4 border-l-2 border-accent/20 pl-5 sm:pl-6">
                  {section.paragraphs.map((para) => (
                    <p key={para.slice(0, 40)} className="text-base text-gray-600 dark:text-zinc-400 leading-relaxed">
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* ── Sign-off and where to find us ────────────────────────────── */}
      <section className="border-t border-gray-200 dark:border-white/5 bg-white dark:bg-zinc-900">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="text-center">
            {closing.lines.map((line, i) => (
              <p
                key={line}
                className={i === 0
                  ? 'text-xl sm:text-2xl font-black text-gray-900 dark:text-zinc-100'
                  : 'mt-3 text-sm text-gray-500 dark:text-zinc-400'}
              >
                {line}
              </p>
            ))}
          </div>

          {closing.showAddress && (
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <a
                href={BUSINESS.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="sm:col-span-2 flex items-start gap-3 rounded-2xl border border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-zinc-800/50 p-5 hover:border-accent/40 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <p className="text-gray-400 dark:text-zinc-500 text-[11px] font-black uppercase tracking-widest">Visit us</p>
                  <address className="not-italic mt-1 text-sm text-gray-600 dark:text-zinc-400 leading-relaxed">
                    {aboutAddressLines().map((line, i) => (
                      <React.Fragment key={line}>{i > 0 && <br />}{line}</React.Fragment>
                    ))}
                  </address>
                </div>
              </a>

              <div className="rounded-2xl border border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-zinc-800/50 p-5 space-y-3">
                <a href={telHref(BUSINESS.phone)} className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-zinc-400 hover:text-accent transition-colors">
                  <Phone className="w-4 h-4 text-accent shrink-0" />
                  {formatPhone(BUSINESS.phone)}
                </a>
                <a href={`mailto:${BUSINESS.email}`} className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-zinc-400 hover:text-accent transition-colors break-all">
                  <Mail className="w-4 h-4 text-accent shrink-0" />
                  {BUSINESS.email}
                </a>
                <p className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-zinc-400">
                  <Clock className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span>
                    {BUSINESS.hoursLabel}
                    {BUSINESS.closedLabel && (
                      <><br /><span className="text-xs text-gray-400 dark:text-zinc-500">{BUSINESS.closedLabel}</span></>
                    )}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="border-t border-gray-200 dark:border-white/5">
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-zinc-100 mb-3">
            Ready to stock {mark(BUSINESS.brand)}?
          </h2>
          <p className="text-gray-500 dark:text-zinc-400 mb-8 text-sm max-w-xl mx-auto">
            Join our network of wholesale partners across India.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/catalog"
              className="inline-flex items-center gap-2 bg-accent hover:bg-red-700 text-white font-bold px-8 py-3.5 rounded-full transition-colors text-sm"
            >
              Browse Wholesale Catalog <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 hover:border-accent dark:hover:border-accent text-gray-900 dark:text-zinc-100 font-bold px-8 py-3.5 rounded-full transition-colors text-sm"
            >
              Request a partner account
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

const SectionHeading = ({ icon: Icon, text, centered = false }) => (
  <div className={`flex items-center gap-3 ${centered ? 'justify-center text-center' : ''}`}>
    <span className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
      <Icon className="w-[18px] h-[18px] text-accent" />
    </span>
    <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-zinc-100 tracking-tight">
      {text}
    </h2>
  </div>
);

export default AboutUs;
