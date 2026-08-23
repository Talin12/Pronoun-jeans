import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import Seo from '../components/seo/Seo';
import { usePrerenderReady } from '../hooks/usePrerenderReady';

const NotFound = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  usePrerenderReady();

  return (
    <div className="min-h-[80vh] bg-gray-50 dark:bg-zinc-950 flex items-center justify-center px-4">
      {/* Canonical tracks the URL that missed, so the tag stays honest even
          though noindex means Google will not act on it. */}
      <Seo
        title="Page Not Found"
        description="This page does not exist. Browse the Pronoun Jeans wholesale catalogue of men's jeans, cargo pants and joggers, available in bulk size sets."
        canonical={pathname}
        noindex
      />
      <div className="w-full max-w-lg text-center">

        {/* 404 number — large, understated, on-brand */}
        <div className="relative mb-6 select-none">
          <span className="text-[9rem] sm:text-[11rem] font-black tracking-tighter text-gray-100 dark:text-zinc-800 leading-none block">
            404
          </span>
          {/* Accent underline bar — brand red */}
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-1 bg-accent rounded-full" />
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm flex items-center justify-center">
            <Search className="w-6 h-6 text-gray-400 dark:text-zinc-500" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-gray-900 dark:text-zinc-100 text-2xl sm:text-3xl font-bold mb-3 tracking-tight">
          Page Not Found
        </h1>

        {/* Subtext */}
        <p className="text-gray-500 dark:text-zinc-400 text-sm sm:text-base leading-relaxed mb-8 max-w-sm mx-auto">
          The page you're looking for doesn't exist or may have been moved.
          Let's get you back to the catalog.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => navigate('/catalog')}
            className="w-full sm:w-auto bg-accent hover:bg-red-700 text-white font-bold px-7 py-2.5 rounded-xl transition-colors text-sm uppercase tracking-wide"
          >
            Browse Catalog
          </button>
          <button
            onClick={() => navigate(-1)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-zinc-300 font-semibold px-7 py-2.5 rounded-xl transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>

      </div>
    </div>
  );
};

export default NotFound;