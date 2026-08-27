import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, FolderTree, ImagePlus, Loader, Play, Search,
  UploadCloud, X, Star,
} from 'lucide-react';
import {
  attachMedia, detachMedia, getAttachments, listAssets, listMediaSections,
  reorderMedia, uploadAssetsInBatches,
} from '../../api/adminApi';

/**
 * Marks a tile as a video. Every grid here renders `thumb_url` into an <img>,
 * and for a video that URL is a poster frame — so without this badge a clip is
 * indistinguishable from a still.
 */
const VideoBadge = ({ size = 'md' }) => (
  <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
    <span className={`${size === 'sm' ? 'w-6 h-6' : 'w-8 h-8'} rounded-full bg-black/60 flex items-center justify-center`}>
      <Play className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} text-white fill-white ml-0.5`} />
    </span>
  </span>
);

const isVideo = (asset) => asset?.media_type === 'video';

/**
 * Upload-once / choose-anywhere media picker for the custom admin.
 *
 * Renders the entity's current attachments (drag to reorder, click × to detach)
 * plus a "Choose from library" modal with Library + Upload tabs. Uploading a
 * duplicate reuses the existing asset (dedup) instead of erroring. Mirrors the
 * Django-admin picker, but JWT-authed via /api/admin/media/*.
 *
 * One picker owns exactly one `role`, and lists/detaches only that role. The
 * cover (role="primary") and the gallery are separate slots on the same
 * product: removing a gallery image leaves the cover alone, and vice versa.
 * The same asset may sit in both — detaching it from one keeps the other.
 *
 * `categoryId` preselects that library section, so adding images to a boxer
 * product starts from the Boxers photos and "All images" is one click away.
 *
 * Videos are offered for gallery roles only. The single-image slots — the
 * cover, the category tile, the hero banner — are rendered as <img> across the
 * storefront and the share card, so the server refuses a video there; hiding
 * them from the picker means the admin never meets that refusal.
 */
export default function MediaPicker({
  type, id, role = 'gallery', single = false, folder = '', label = 'Images',
  categoryId = null,
}) {
  const [items, setItems]   = useState([]);
  const [open, setOpen]     = useState(false);
  const [loading, setLoad]  = useState(false);
  const dragId = useRef(null);

  // Scoped to this picker's role: the cover and the gallery are independent
  // slots, so each picker shows and removes only its own attachments.
  const load = useCallback(() => {
    if (!id) return;
    setLoad(true);
    getAttachments(type, id, role)
      .then(d => setItems(d.attachments || []))
      .finally(() => setLoad(false));
  }, [type, id, role]);

  useEffect(() => { load(); }, [load]);

  const handleDetach = (attId) =>
    detachMedia(type, id, attId).then(load);

  const handleAttach = (mediaIds) => {
    const ids = single ? mediaIds.slice(0, 1) : mediaIds;
    return attachMedia(type, id, ids, role).then(load);
  };

  const applyOrder = (from, to) => {
    if (from < 0 || to < 0 || to >= items.length || from === to) return;
    const order = items.map(a => a.id);
    order.splice(to, 0, order.splice(from, 1)[0]);
    setItems(order.map(oid => items.find(a => a.id === oid)));  // optimistic
    reorderMedia(type, id, order).then(load);
  };

  // drag reorder (desktop)
  const onDrop = (targetId) =>
    applyOrder(items.findIndex(a => a.id === dragId.current),
               items.findIndex(a => a.id === targetId));

  // HTML5 drag events don't fire on touch, so phones reorder with these.
  const nudge = (attId, delta) => {
    const from = items.findIndex(a => a.id === attId);
    applyOrder(from, from + delta);
  };

  if (!id) {
    return (
      <div className="text-sm text-gray-400 dark:text-zinc-500 border border-dashed border-gray-200 dark:border-white/10 rounded-xl px-4 py-6 text-center">
        Save the product first to add {label.toLowerCase()}.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-3">
        {items.map((att) => (
          <div
            key={att.id}
            draggable={!single}
            onDragStart={() => { dragId.current = att.id; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(att.id)}
            className="relative group w-24 h-24 rounded-xl overflow-hidden border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800"
          >
            <img src={att.media.thumb_url} alt={att.media.alt_text || ''}
                 className="w-full h-full object-cover" />
            {isVideo(att.media) && <VideoBadge size="sm" />}
            {!single && !att.media.alt_text && (
              <span className="absolute bottom-1 left-1 text-[10px] font-bold px-1 rounded bg-amber-500/90 text-white">alt?</span>
            )}
            {single && (
              <span className="absolute bottom-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent text-white flex items-center gap-0.5">
                <Star size={9} className="fill-white" /> cover
              </span>
            )}
            {/* Detach stays visible on touch: with no hover on a phone, a
                hover-only control would make images impossible to remove. */}
            <button
              type="button"
              onClick={() => handleDetach(att.id)}
              className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              title="Remove"
            >
              <X size={14} />
            </button>

            {/* Touch reordering — hidden once hover-drag is available. */}
            {!single && items.length > 1 && (
              <div className="sm:hidden absolute bottom-1 inset-x-1 flex justify-between">
                <button type="button" onClick={() => nudge(att.id, -1)} aria-label="Move earlier"
                  className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30"
                  disabled={items[0]?.id === att.id}>
                  <ChevronLeft size={14} />
                </button>
                <button type="button" onClick={() => nudge(att.id, 1)} aria-label="Move later"
                  className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30"
                  disabled={items[items.length - 1]?.id === att.id}>
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 dark:border-white/15 text-gray-400 dark:text-zinc-500 hover:border-accent hover:text-accent flex flex-col items-center justify-center gap-1 transition-colors"
        >
          <ImagePlus size={22} />
          <span className="text-[11px] font-semibold">
            {single ? (items.length ? 'Replace' : 'Set cover') : 'Add'}
          </span>
        </button>
      </div>
      {loading && <p className="text-xs text-gray-400 flex items-center gap-1"><Loader size={12} className="animate-spin" /> loading…</p>}

      {open && (
        <LibraryModal
          folder={folder}
          single={single}
          allowVideo={role === 'gallery'}
          categoryId={categoryId}
          onClose={() => setOpen(false)}
          onConfirm={(ids) => handleAttach(ids).then(() => setOpen(false))}
        />
      )}
    </div>
  );
}

/**
 * Library + Upload modal.
 *
 * Exported because the bulk variant builder picks images before the variants
 * they belong to exist — it collects asset ids and attaches them afterwards,
 * rather than attaching to an entity as MediaPicker does.
 *
 * `allowVideo` false hides clips from the grid and refuses them on upload, for
 * the slots that can only hold a still.
 */
export function LibraryModal({ folder, single, allowVideo = true, categoryId, onClose, onConfirm }) {
  const [tab, setTab]         = useState('library');
  const [assets, setAssets]   = useState([]);
  const [page, setPage]       = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [search, setSearch]   = useState('');
  const [selected, setSel]    = useState(new Map());
  const [loading, setLoad]    = useState(false);
  const [uploads, setUploads] = useState([]);
  const [sections, setSecs]   = useState([]);
  // Which library section we are browsing/uploading into. '' = All images.
  const [section, setSection] = useState(categoryId ? String(categoryId) : '');
  const fileRef = useRef(null);

  useEffect(() => {
    listMediaSections().then(d => setSecs(d.sections || [])).catch(() => setSecs([]));
  }, []);

  const fetchAssets = useCallback((reset) => {
    setLoad(true);
    const p = reset ? 1 : page;
    listAssets({ page: p, search, ...(section ? { category: section } : {}) })
      .then(d => {
        // Filtered client-side rather than by a query param: the page the
        // server returned is what "Load more" pages through, and dropping a few
        // tiles from it keeps that cursor honest.
        const results = (d.results || []).filter(a => allowVideo || !isVideo(a));
        setAssets(prev => reset ? results : [...prev, ...results]);
        setHasNext(d.has_next);
        setPage(p + 1);
      })
      .finally(() => setLoad(false));
  }, [page, search, section, allowVideo]);

  useEffect(() => {
    const t = setTimeout(() => fetchAssets(true), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, section]);

  const toggle = (asset) => {
    setSel(prev => {
      const next = single ? new Map() : new Map(prev);
      if (prev.has(asset.id)) next.delete(asset.id);
      else next.set(asset.id, asset);
      return next;
    });
  };

  const doUpload = async (files) => {
    if (!files || !files.length) return;

    // Caught here as well as server-side: a clip dropped onto a cover picker
    // would otherwise upload in full — tens of megabytes — before the attach
    // step rejected it.
    const picked = Array.from(files);
    const rejected = allowVideo ? [] : picked.filter(f => f.type.startsWith('video/'));
    const accepted = allowVideo ? picked : picked.filter(f => !f.type.startsWith('video/'));
    if (rejected.length) {
      setUploads(prev => [
        ...rejected.map(f => ({ name: f.name, status: 'videos cannot be used here' })),
        ...prev,
      ]);
    }
    if (!accepted.length) return;
    files = accepted;

    const names = Array.from(files).map(f => ({ name: f.name, status: 'waiting…' }));
    setUploads(prev => [...names, ...prev]);

    // Compressed in the browser and batched by size, so a slow phone connection
    // or one rejected file cannot take the whole selection down. Per-file
    // reasons are shown against each row.
    const { results, errors } = await uploadAssetsInBatches(files, folder, section || undefined, {
      // Rows are prepended, so index i is file i of this selection.
      onProgress: ({ phase, done }) => setUploads(prev => prev.map((u, i) => {
        if (phase === 'compressing') {
          return i === done && u.status === 'waiting…' ? { ...u, status: 'preparing…' } : u;
        }
        return u.status === 'preparing…' || u.status === 'waiting…'
          ? { ...u, status: 'uploading…' } : u;
      })),
    });

    setUploads(prev => prev.map(u => {
      const ok = results.find(r => r.sourceFilename === u.name);
      if (ok) return { ...u, status: ok.deduplicated ? 'already in library — reused' : 'uploaded' };
      const bad = errors.find(e => e.filename === u.name);
      return bad ? { ...u, status: bad.error } : u;
    }));

    if (results.length) {
      setSel(prev => {
        const next = single ? new Map() : new Map(prev);
        results.forEach(r => next.set(r.asset.id, r.asset));
        return next;
      });
      fetchAssets(true);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm"
         onClick={onClose}>
      {/* Full-height sheet on a phone, centred dialog from sm up. */}
      <div className="bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-3xl h-[92vh] sm:h-auto sm:max-h-[85vh] flex flex-col overflow-hidden"
           onClick={(e) => e.stopPropagation()}>
        {/* Header / tabs */}
        <div className="flex items-center gap-1 px-4 py-3 border-b border-gray-100 dark:border-white/5">
          {['library', 'upload'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold capitalize transition-colors ${
                tab === t ? 'bg-accent/10 text-accent' : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}>{t}</button>
          ))}
          <button onClick={onClose} className="ml-auto p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200"><X size={20} /></button>
        </div>

        {/* Section — which slice of the library we browse and upload into */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-white/[0.02]">
          <FolderTree size={15} className="text-accent shrink-0" />
          <span className="hidden sm:inline text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400">Section</span>
          <select value={section} onChange={e => setSection(e.target.value)}
            className="flex-1 sm:flex-none min-w-0 sm:ml-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm font-semibold text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40">
            <option value="">All images</option>
            {sections.filter(s => !s.parent).map(m => (
              <optgroup key={m.id} label={m.name}>
                <option value={m.id}>{m.name} ({m.count})</option>
                {sections.filter(s => s.parent === m.id).map(s => (
                  <option key={s.id} value={s.id}>{m.name} → {s.name} ({s.count})</option>
                ))}
              </optgroup>
            ))}
          </select>
          {section && (
            <button onClick={() => setSection('')}
              className="text-xs font-semibold text-gray-400 hover:text-accent">show all</button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'library' ? (
            <>
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search filename, title, alt, tag…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40" />
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {assets.map(a => (
                  <button key={a.id} type="button" onClick={() => toggle(a)}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                      selected.has(a.id) ? 'border-accent ring-2 ring-accent/30' : 'border-transparent hover:border-gray-300 dark:hover:border-white/20'
                    }`}>
                    <img src={a.thumb_url} alt={a.alt_text || a.original_filename} loading="lazy"
                         className="w-full h-full object-cover bg-gray-100 dark:bg-zinc-800" />
                    {isVideo(a) && !selected.has(a.id) && <VideoBadge />}
                    {selected.has(a.id) && (
                      <span className="absolute inset-0 bg-accent/10 flex items-center justify-center">
                        <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center">✓</span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {loading && <p className="text-center text-sm text-gray-400 mt-4 flex items-center justify-center gap-1"><Loader size={14} className="animate-spin" /> loading…</p>}
              {hasNext && !loading && (
                <button onClick={() => fetchAssets(false)}
                  className="mx-auto mt-4 block px-4 py-1.5 rounded-lg text-sm font-semibold text-accent hover:bg-accent/10">Load more</button>
              )}
              {!loading && !assets.length && (
                <p className="text-center text-sm text-gray-400 py-10">No images yet — switch to the Upload tab.</p>
              )}
            </>
          ) : (
            <div>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); doUpload(e.dataTransfer.files); }}
                className="border-2 border-dashed border-gray-300 dark:border-white/15 rounded-2xl py-12 text-center cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors"
              >
                <UploadCloud size={36} className="mx-auto text-gray-400 mb-2" />
                <p className="text-sm font-semibold text-gray-600 dark:text-zinc-300">
                  Drag {allowVideo ? 'images or videos' : 'images'} here, or click to browse — they go to{' '}
                  <span className="text-accent">
                    {sections.find(s => String(s.id) === section)?.name || 'All images'}
                  </span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  JPG, PNG, WebP, AVIF · up to 15 MB
                  {allowVideo && ' — MP4, WebM, MOV · up to 100 MB'}
                  {' · many at once · uploaded once, reused anywhere'}
                </p>
                {allowVideo && (
                  <p className="text-xs text-gray-400 mt-1">
                    A video is uploaded as-is and takes a while on a slow connection — leave this tab open.
                  </p>
                )}
                <input ref={fileRef} type="file" multiple
                       accept={allowVideo ? 'image/*,.heic,.heif,video/*' : 'image/*,.heic,.heif'} className="hidden"
                       onChange={(e) => { doUpload(e.target.files); e.target.value = ''; }} />
              </div>
              {uploads.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {uploads.map((u, i) => (
                    <li key={i} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-zinc-800">
                      <span className="truncate text-gray-700 dark:text-zinc-300">{u.name}</span>
                      <span className={`text-xs font-semibold ml-3 shrink-0 text-right ${
                        u.status === 'uploaded' ? 'text-green-600 dark:text-green-400'
                        : u.status.includes('reused') ? 'text-amber-600 dark:text-amber-400'
                        : u.status === 'waiting…' ? 'text-gray-400'
                        : 'text-red-500'}`}>{u.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-white/5">
          <span className="text-sm text-gray-500 dark:text-zinc-400">{selected.size} selected</span>
          {/* onConfirm's second argument is the full asset objects, for callers
              that want thumbnails before anything is attached. */}
          <button
            onClick={() => selected.size
              ? onConfirm(Array.from(selected.keys()), Array.from(selected.values()))
              : onClose()}
            className="px-5 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition">
            {selected.size ? `Add ${selected.size}` : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
