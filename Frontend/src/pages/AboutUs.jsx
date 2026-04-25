import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const AboutUs = () => {
  const navigate = useNavigate();

  return (
    <div className="bg-gray-50 dark:bg-zinc-950 min-h-screen">

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 py-24 text-center">
        <h1 className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-zinc-100 leading-tight mb-8">
          Fashion Should Empower, Not Constrict –{' '}
          <span className="text-accent">Comfort is the Ultimate Luxury.</span>
        </h1>
        <p className="text-lg font-semibold text-gray-700 dark:text-zinc-300 leading-relaxed mb-8">
          Awkward fits are our nemesis. At PRO-NOUN, we've never chased trends—we chase ease.
          We've been in rooms where "cool" was dictated by rigid styles, but we'd rather redefine it:
          cool is the man who moves freely, unapologetically, in clothes that bend with his life.
          No gimmicks, no pretense—just designs that let you be.
        </p>
        <p className="text-base text-gray-600 dark:text-zinc-400 leading-relaxed max-w-3xl mx-auto">
          A man's wardrobe should be two things: effortless and authentic. We believe luxury isn't in logos,
          but in the whisper-soft touch of cotton-Lycra, the precision of a stitch that outlasts seasons.
          We design for the man who <em>does</em>—whether he's navigating a workday or a weekend adventure—not
          the mannequin in a store window. Balance is everything, and it's hard: between durability and
          lightness, structure and stretch, trend and timelessness. Our relationships with fabric mills and
          tailors span years; this isn't fast fashion, it's <em>conscious craft.</em> Celebrity flash? We'd
          rather elevate the everyday. Our mission? To make budget-friendly pieces feel premium, and premium
          pieces feel lived-in. Confidence isn't vanity—it's self-respect. PRO-NOUN isn't about hiding behind
          layers; it's about clothes that reveal <em>you.</em> And casual? We've mastered it: every pair of
          joggers, every cargo short, is a lesson in refined ease.
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-white/5 max-w-4xl mx-auto" />

      {/* Values grid */}
      <div className="max-w-4xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-black text-gray-900 dark:text-zinc-100 text-center mb-12">What We Stand For</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            { title: 'Comfort First',    body: 'Every cut, every stitch is engineered around how the human body actually moves—not how it looks on a hanger.' },
            { title: 'Conscious Craft',  body: 'Long-term relationships with mills and tailors mean every piece is built to outlast fast fashion by years.' },
            { title: 'Honest Pricing',   body: 'Premium feel without the premium markup. Budget-friendly pieces that refuse to feel budget.' },
          ].map((item) => (
            <div key={item.title} className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
              <div className="w-2 h-2 rounded-full bg-accent mb-4" />
              <h3 className="text-gray-900 dark:text-zinc-100 font-bold text-base mb-2">{item.title}</h3>
              <p className="text-gray-500 dark:text-zinc-400 text-sm leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="border-t border-gray-200 dark:border-white/5">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-black text-gray-900 dark:text-zinc-100 mb-4">Ready to stock PRO-NOUN?</h2>
          <p className="text-gray-500 dark:text-zinc-400 mb-8 text-sm">
            Join our network of wholesale partners across India.
          </p>
          <button
            onClick={() => navigate('/catalog')}
            className="inline-flex items-center gap-2 bg-accent hover:bg-red-700 text-white font-bold px-8 py-3 rounded-full transition-colors text-sm"
          >
            Browse Wholesale Catalog <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

    </div>
  );
};

export default AboutUs;