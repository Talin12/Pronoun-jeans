import React from 'react';
import { Loader } from 'lucide-react';

/**
 * The Active/Inactive tag doubles as the switch — one click publishes or
 * unpublishes a product, no trip through the editor. Purely presentational:
 * the caller owns the optimistic update and the rollback.
 */
export default function StatusToggle({ active, busy, onToggle }) {
  const label = active ? 'Active — click to deactivate' : 'Inactive — click to activate';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={onToggle}
      className={`inline-flex items-center gap-2 shrink-0 pl-1.5 pr-3 py-1 rounded-full border text-xs font-bold transition disabled:cursor-wait ${
        active
          ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20 hover:bg-green-100 dark:hover:bg-green-500/20'
          : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-zinc-400 border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/10'
      }`}
    >
      <span className={`relative w-7 h-4 rounded-full transition-colors ${active ? 'bg-green-500' : 'bg-gray-300 dark:bg-zinc-600'}`}>
        {busy ? (
          <Loader size={12} className="animate-spin absolute top-0.5 left-2 text-white" />
        ) : (
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${active ? 'left-3.5' : 'left-0.5'}`} />
        )}
      </span>
      {active ? 'Active' : 'Inactive'}
    </button>
  );
}
