import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Film, Plus, Loader, Trash2, GripVertical, Eye, EyeOff, AlertTriangle, Check,
} from 'lucide-react';
import {
  createHeroSlide, deleteHeroSlide, listHeroSlides, reorderHeroSlides,
  updateHeroSlide,
} from '../../api/adminApi';
import MediaPicker from '../../components/admin/MediaPicker';

/**
 * The storefront carousel, edited as one list.
 *
 * A slide is created caption-first and only then has an id for the picker to
 * attach an image to — so a brand-new slide legitimately has no picture for a
 * moment. That state is called out on the row rather than hidden, because a
 * slide without an image renders as a gap on the home page.
 */
export default function AdminHeroSlides() {
  const [slides, setSlides] = useState(null);
  const [busyId, setBusy]   = useState(null);
  const [error, setError]   = useState('');
  const [creating, setCreating] = useState(false);
  const dragId = useRef(null);

  const load = useCallback(() => {
    listHeroSlides()
      .then(setSlides)
      .catch(() => { setSlides([]); setError('Could not load the slides.'); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = () => {
    setCreating(true); setError('');
    createHeroSlide({ caption: '', is_active: false })
      .then(slide => setSlides(s => [...s, slide]))
      .catch(() => setError('Could not add a slide.'))
      .finally(() => setCreating(false));
  };

  /** Optimistic: the toggle and the caption should feel instant. */
  const patch = (slide, body, label) => {
    setBusy(slide.id); setError('');
    const before = { ...slide };
    setSlides(s => s.map(x => (x.id === slide.id ? { ...x, ...body } : x)));
    return updateHeroSlide(slide.id, body)
      .then(saved => setSlides(s => s.map(x => (x.id === slide.id ? { ...x, ...saved } : x))))
      .catch(() => {
        setSlides(s => s.map(x => (x.id === slide.id ? before : x)));
        setError(`Could not ${label}.`);
      })
      .finally(() => setBusy(null));
  };

  const remove = (slide) => {
    // A slide is one picture on the home page and nothing references it, so
    // deleting is safe and reversible by re-adding — no confirm modal for it.
    setBusy(slide.id); setError('');
    deleteHeroSlide(slide.id)
      .then(() => setSlides(s => s.filter(x => x.id !== slide.id)))
      .catch(() => setError('Could not delete that slide.'))
      .finally(() => setBusy(null));
  };

  const onDrop = (targetId) => {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;

    const next = [...slides];
    const fromIdx = next.findIndex(s => s.id === from);
    const toIdx   = next.findIndex(s => s.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    next.splice(toIdx, 0, next.splice(fromIdx, 1)[0]);

    const before = slides;
    setSlides(next);
    reorderHeroSlides(next.map(s => s.id))
      .then(setSlides)
      .catch(() => { setSlides(before); setError('Could not save the new order.'); });
  };

  const liveCount = slides?.filter(s => s.is_active && s.image_url).length ?? 0;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-accent text-xs font-black uppercase tracking-widest mb-1">Admin Panel</p>
          <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100">Hero Slides</h1>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mt-1">
            {slides === null ? '—'
              : `${liveCount} showing on the storefront · ${slides.length} total`}
          </p>
        </div>
        <button onClick={add} disabled={creating}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition shadow-sm shrink-0 disabled:opacity-60">
          {creating ? <Loader size={18} className="animate-spin" /> : <Plus size={18} />} Add Slide
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-sm font-semibold text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {slides === null ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader className="animate-spin" /></div>
      ) : !slides.length ? (
        <div className="text-center py-20 text-gray-400">
          <Film size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No slides yet</p>
          <p className="text-sm mt-1">Add one, drop in a picture, then switch it on.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {slides.map((slide, i) => (
            <div key={slide.id}
              draggable
              onDragStart={() => { dragId.current = slide.id; }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => onDrop(slide.id)}
              className={`bg-white dark:bg-zinc-900 border rounded-2xl p-4 transition-shadow hover:shadow-md ${
                slide.is_active && slide.image_url
                  ? 'border-gray-100 dark:border-white/5'
                  : 'border-dashed border-gray-300 dark:border-white/15'
              }`}>

              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2 pt-2 shrink-0">
                  <GripVertical size={16} className="text-gray-300 dark:text-zinc-600 cursor-grab active:cursor-grabbing" />
                  <span className="text-xs font-black text-gray-400 dark:text-zinc-500 w-4">{i + 1}</span>
                </div>

                <div className="flex-1 min-w-0 space-y-3">
                  <input
                    defaultValue={slide.caption}
                    placeholder="Caption (optional — shown over the image)"
                    onBlur={e => {
                      const value = e.target.value.trim();
                      if (value !== slide.caption) patch(slide, { caption: value }, 'save the caption');
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm font-semibold text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40" />

                  {/* type/role match the medialib slot HeroSlide.image is bridged to,
                      so a pick here also lands in the column the storefront reads.
                      onChange keeps the warning and the Live toggle honest without
                      refetching the list on every pick. */}
                  <MediaPicker
                    type="banner" id={slide.id} role="primary" single
                    folder="hero_slides" label="Slide image"
                    onChange={atts => setSlides(s => s.map(x => (
                      x.id === slide.id
                        ? { ...x, image_url: atts[0]?.media?.thumb_url || null }
                        : x
                    )))} />

                  {!slide.image_url && (
                    <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                      <AlertTriangle size={13} /> No image yet — this slide stays off the storefront.
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    onClick={() => patch(slide, { is_active: !slide.is_active }, 'change visibility')}
                    disabled={busyId === slide.id || !slide.image_url}
                    title={!slide.image_url ? 'Add an image before switching this on' : undefined}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                      slide.is_active
                        ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20'
                        : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-zinc-400 border-gray-200 dark:border-white/10'
                    }`}>
                    {busyId === slide.id ? <Loader size={13} className="animate-spin" />
                      : slide.is_active ? <Eye size={13} /> : <EyeOff size={13} />}
                    {slide.is_active ? 'Live' : 'Hidden'}
                  </button>

                  <button onClick={() => remove(slide)} disabled={busyId === slide.id}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition disabled:opacity-50">
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!!slides?.length && (
        <p className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-zinc-500 mt-6">
          <Check size={13} /> Drag a slide by its handle to reorder the carousel. Changes save as you make them.
        </p>
      )}
    </div>
  );
}
