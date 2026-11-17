import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Seo from '../components/seo/Seo';
import { usePrerenderReady } from '../hooks/usePrerenderReady';
import { ABOUT_TITLE, ABOUT_DESCRIPTION, BUSINESS, mark } from '../content/seoContent';
import { aboutContent, aboutAddressLines } from '../content/aboutContent';

// The copy lives in src/content/aboutContent.js, which aboutPage() in
// api/render.js renders from too — the server HTML and this page cannot say
// different things. Which of the client's two texts appears is decided by
// ASSUMPTIONS.aboutVariant.

const Divider = () => (
  <div className="border-t border-gray-200 dark:border-white/5 max-w-4xl mx-auto" />
);

const AboutUs = () => {
  const { h1, tagline, sections, closing } = aboutContent();
  usePrerenderReady();

  return (
    <div className="bg-gray-50 dark:bg-zinc-950 min-h-screen">

      <Seo
        title={ABOUT_TITLE}
        description={ABOUT_DESCRIPTION}
        canonical="/about"
      />

      {/* Hero — the only <h1> on the page */}
      <div className="max-w-4xl mx-auto px-6 py-24 text-center">
        <h1 className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-zinc-100 leading-tight mb-8">
          {h1}
        </h1>
        <p className="text-lg font-semibold text-gray-700 dark:text-zinc-300 leading-relaxed">
          {tagline}
        </p>
      </div>

      {sections.map((section) => (
        <React.Fragment key={section.id}>
          <Divider />
          <div className="max-w-4xl mx-auto px-6 py-20">
            <h2
              id={section.id}
              className="text-2xl font-black text-gray-900 dark:text-zinc-100 text-center mb-8 scroll-mt-24"
            >
              {section.heading}
            </h2>

            {section.cards ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mt-4">
                {section.cards.map((card) => (
                  <div key={card.title} className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
                    <div className="w-2 h-2 rounded-full bg-accent mb-4" />
                    <h3 className="text-gray-900 dark:text-zinc-100 font-bold text-base mb-2">{card.title}</h3>
                    <p className="text-gray-500 dark:text-zinc-400 text-sm leading-relaxed">{card.body}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {section.paragraphs.map((para) => (
                  <p key={para.slice(0, 40)} className="text-base text-gray-600 dark:text-zinc-400 leading-relaxed">
                    {para}
                  </p>
                ))}
              </div>
            )}
          </div>
        </React.Fragment>
      ))}

      <Divider />

      {/* Closing line and the business address */}
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <p className="text-lg font-black text-gray-900 dark:text-zinc-100 mb-6">{closing.line}</p>
        {closing.showAddress && (
          <address className="not-italic text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
            <a href={BUSINESS.mapUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors">
              {aboutAddressLines().map((line, i) => (
                <React.Fragment key={line}>{i > 0 && <br />}{line}</React.Fragment>
              ))}
            </a>
          </address>
        )}
      </div>

      {/* CTA */}
      <div className="border-t border-gray-200 dark:border-white/5">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-black text-gray-900 dark:text-zinc-100 mb-4">
            Ready to stock {mark(BUSINESS.brand)}?
          </h2>
          <p className="text-gray-500 dark:text-zinc-400 mb-8 text-sm">
            Join our network of wholesale partners across India.
          </p>
          <Link
            to="/catalog"
            className="inline-flex items-center gap-2 bg-accent hover:bg-red-700 text-white font-bold px-8 py-3 rounded-full transition-colors text-sm"
          >
            Browse Wholesale Catalog <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

    </div>
  );
};

export default AboutUs;
