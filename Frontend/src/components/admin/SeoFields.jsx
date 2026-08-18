import React from 'react';
import { ChevronDown, ChevronUp, Search, Sparkles } from 'lucide-react';

// Matches the panel's existing label styling, so the SEO section does not read
// as a bolted-on afterthought. Inputs stay with their callers, which already
// define the shared control class.
const labelCls = 'block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1.5';

/**
 * Characters used against the limit.
 *
 * Amber once the text is long enough to risk truncation in a search result,
 * red past the hard column limit — which the server would reject with a 400,
 * so it is worth seeing before pressing Save.
 */
export function CharCount({ value, max, soft }) {
  const length = (value || '').length;
  const warnAt = soft ?? Math.round(max * 0.9);
  const tone = length > max
    ? 'text-red-600 dark:text-red-400'
    : length >= warnAt
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-gray-400 dark:text-zinc-500';
  return (
    <span className={`text-xs font-semibold tabular-nums ${tone}`}>
      {length}/{max}
    </span>
  );
}

/** Label and counter on one line, so the count sits beside what it counts. */
export function FieldHeader({ label, value, max, soft }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-1.5">
      <span className={`${labelCls} mb-0`}>{label}</span>
      <CharCount value={value} max={max} soft={soft} />
    </div>
  );
}

/**
 * Roughly what the page will look like in a search result.
 *
 * Not pixel-accurate — Google measures pixels, not characters, and rewrites
 * descriptions when it feels like it. It is here so the person writing the copy
 * can see where it gets cut off and whether it reads as a sentence, which a
 * bare textarea does not show.
 */
export function GooglePreview({ url, title, description, generatedTitle, generatedDescription }) {
  const clip = (text, max) => {
    const value = (text || '').trim();
    return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-950 p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Search size={12} className="text-gray-400" />
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500">
          Search result preview
        </span>
      </div>

      <p className="text-xs text-gray-600 dark:text-zinc-400 truncate">{url}</p>
      <p className="text-[#1a0dab] dark:text-[#8ab4f8] text-lg leading-snug mt-0.5 truncate">
        {clip(title, 60) || 'Untitled'}
      </p>
      <p className="text-sm text-gray-600 dark:text-zinc-400 leading-snug mt-1">
        {clip(description, 160) || 'No description.'}
      </p>

      {(generatedTitle || generatedDescription) && (
        <p className="flex items-start gap-1.5 text-xs text-gray-400 dark:text-zinc-500 mt-3 pt-3 border-t border-gray-100 dark:border-white/5">
          <Sparkles size={12} className="mt-0.5 shrink-0" />
          <span>
            {generatedTitle && generatedDescription
              ? 'Both generated from the product details. Fill the fields above to override.'
              : generatedTitle
                ? 'Title generated from the product details.'
                : 'Description generated from the product details.'}
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * Collapsed by default. Nobody filling in a product needs SEO in their way,
 * and the existing steps were laid out before this section existed.
 */
export function SeoSection({ open, onToggle, subtitle, overridden, children }) {
  return (
    <div className="mt-6 border-t border-gray-100 dark:border-white/5 pt-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left group"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-sm font-black text-gray-900 dark:text-zinc-100">SEO</span>
            {overridden > 0 && (
              <span className="text-[10px] font-black uppercase tracking-widest text-accent bg-accent/10 rounded-full px-2 py-0.5">
                {overridden} custom
              </span>
            )}
          </span>
          <span className="block text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{subtitle}</span>
        </span>
        <span className="shrink-0 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-zinc-300">
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </button>

      {open && <div className="mt-4 space-y-4">{children}</div>}
    </div>
  );
}
