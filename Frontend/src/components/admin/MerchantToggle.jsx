import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Check, Info, Loader, RefreshCw, ShoppingBag } from 'lucide-react';
import { syncProductToMerchant } from '../../api/adminApi';

/**
 * "List on Google Merchant" — the switch that replaces typing every product
 * into Merchant Center a second time by hand.
 *
 * The push runs server-side after the save commits, so the state shown here
 * is whatever the last fetch saw: 'pending' until the push lands, then 'live'
 * or 'error'. The error is spelled out rather than hidden behind a red dot,
 * because the usual causes — no MRP on any variation, no image — are things
 * the admin fixes in this same editor.
 *
 * Below the switch is the readiness list: what is still missing before this
 * product makes a good listing. It shows whether the toggle is on or off,
 * because its job is to answer "why can't I list this yet" before the client
 * flips the switch and waits for a failure to tell them.
 *
 * Every line carries the place it is fixed, and `onFix` takes the admin
 * there — the right wizard step, the right variant's panel open, the cursor
 * in the field. Naming a field they then have to go and find is the part of
 * a checklist that makes people ignore it.
 */

const STATES = {
  live: {
    icon: Check,
    cls: 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20',
    label: 'Live on Google',
  },
  pending: {
    icon: Loader,
    cls: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20',
    label: 'Sending to Google…',
  },
  error: {
    icon: AlertCircle,
    cls: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20',
    label: 'Not listed',
  },
};

/** One line saying how far off this product is, in plain words. */
function summarise({ ready, blockers, warnings }) {
  if (!ready) {
    return blockers === 1
      ? '1 thing must be added before Google will accept this product'
      : `${blockers} things must be added before Google will accept this product`;
  }
  if (warnings > 0) {
    return warnings === 1
      ? 'Ready to list — 1 detail would make it a better listing'
      : `Ready to list — ${warnings} details would make it a better listing`;
  }
  return 'Ready to list — nothing missing';
}

export default function MerchantToggle({ productId, isNew, value, onChange, status, onStatusChange, readiness, onFix }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const configured = status?.configured !== false;
  const state = status?.state || (value ? 'pending' : 'off');
  const badge = STATES[state];

  // A brand-new product has no row to push yet, and an unconfigured server
  // would accept the toggle and silently do nothing — say so instead.
  const locked = isNew || !configured;

  const syncNow = async () => {
    setBusy(true);
    setNote('');
    try {
      const res = await syncProductToMerchant(productId);
      onStatusChange?.(res.merchant_status);
      setNote(res.detail || 'Sent.');
    } catch (err) {
      setNote(err?.response?.data?.detail || 'Could not reach Google. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-gray-200 dark:border-white/10 p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <ShoppingBag size={18} className="mt-0.5 shrink-0 text-gray-400 dark:text-zinc-500" />
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">
              List on Google Merchant
            </p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5 max-w-md">
              Publishes this product to Google Shopping with its MRP and wholesale
              price. Turn it off to remove the listing from Google.
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={!!value}
          aria-label="List this product on Google Merchant Center"
          disabled={locked}
          onClick={() => onChange(!value)}
          className={`inline-flex items-center gap-2 shrink-0 pl-1.5 pr-3 py-1 rounded-full border text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed ${
            value
              ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20'
              : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-zinc-400 border-gray-200 dark:border-white/10'
          }`}
        >
          <span className={`relative w-7 h-4 rounded-full transition-colors ${value ? 'bg-green-500' : 'bg-gray-300 dark:bg-zinc-600'}`}>
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${value ? 'left-3.5' : 'left-0.5'}`} />
          </span>
          {value ? 'On' : 'Off'}
        </button>
      </div>

      {isNew && (
        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-3">
          Save the product first — it needs a price and an image before Google will take it.
        </p>
      )}

      {!configured && !isNew && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
          Google Merchant Center is not connected on this server, so this toggle is disabled.
        </p>
      )}

      {readiness && !isNew && (
        <div className="mt-3 rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-white/5">
            {readiness.ready
              ? <Check size={13} className="shrink-0 text-green-600 dark:text-green-400" />
              : <AlertCircle size={13} className="shrink-0 text-red-600 dark:text-red-400" />}
            <p className="text-xs font-bold text-gray-700 dark:text-zinc-200">
              {summarise(readiness)}
            </p>
          </div>

          {readiness.checks?.length > 0 && (
            <ul className="divide-y divide-gray-100 dark:divide-white/5">
              {readiness.checks.map((c) => (
                <li key={`${c.level}-${c.field}`} className="flex items-start gap-2 px-3 py-2">
                  {c.level === 'blocker'
                    ? <AlertCircle size={13} className="mt-0.5 shrink-0 text-red-500" />
                    : <Info size={13} className="mt-0.5 shrink-0 text-amber-500" />}
                  <div className="min-w-0">
                    <p className={`text-xs font-bold ${
                      c.level === 'blocker'
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}>
                      {c.label}
                      {c.level === 'blocker' && (
                        <span className="ml-1.5 font-normal text-[10px] uppercase tracking-wide opacity-70">
                          required
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{c.detail}</p>
                    {c.fix && onFix && (
                      <button type="button" onClick={() => onFix(c.fix)}
                        className="inline-flex items-center gap-1 mt-1.5 text-xs font-bold text-accent hover:underline">
                        Take me there
                        {/* The destination is named so the jump is never a
                            surprise, and so the admin can get there by hand
                            if they would rather. */}
                        <span className="font-semibold text-gray-400 dark:text-zinc-500">
                          · {c.fix.label}
                        </span>
                        <ArrowRight size={12} className="shrink-0" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {value && badge && !isNew && configured && (
        <div className={`flex items-start gap-2 text-xs font-semibold rounded-lg border px-3 py-2 mt-3 ${badge.cls}`}>
          <badge.icon size={14} className={`mt-0.5 shrink-0 ${state === 'pending' ? 'animate-spin' : ''}`} />
          <span>
            {badge.label}
            {status?.detail && <span className="block font-normal mt-0.5">{status.detail}</span>}
          </span>
        </div>
      )}

      {value && !isNew && configured && (
        <div className="flex items-center gap-3 mt-3">
          <button type="button" onClick={syncNow} disabled={busy}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-zinc-100 disabled:opacity-50">
            {busy ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Send to Google now
          </button>
          {note && <span className="text-xs text-gray-400 dark:text-zinc-500">{note}</span>}
        </div>
      )}
    </div>
  );
}
