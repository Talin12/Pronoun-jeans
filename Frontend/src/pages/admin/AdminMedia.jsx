import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Images, Loader, Search, UploadCloud, FolderTree, X, Check, FolderInput,
} from 'lucide-react';
import {
  listAssets, listMediaSections, uploadAssetsInBatches, categorizeAssets,
} from '../../api/adminApi';

const PAGE_TITLE = 'Media Library';

/**
 * The whole media library, section by section.
 *
 * "All images" holds everything; every category is also a section, so boxer
 * photos can be uploaded straight into Boxers and picked from there later
 * without wading through the entire library. Sections are additive — an image
 * filed under Boxers still appears in All images.
 */
export default function AdminMedia() {
  const [sections, setSections] = useState([]);
  const [total, setTotal]       = useState(0);
  const [active, setActive]     = useState(null);   // null = All images
  const [assets, setAssets]     = useState([]);
  const [page, setPage]         = useState(1);
  const [hasNext, setHasNext]   = useState(false);
  const [search, setSearch]     = useState('');
  const [loading, setLoad]      = useState(false);
  const [uploads, setUploads]   = useState([]);
  const [selected, setSel]      = useState(new Set());
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const [progress, setProgress] = useState('');
  const fileRef = useRef(null);

  const loadSections = useCallback(() => {
    listMediaSections()
      .then(d => { setSections(d.sections || []); setTotal(d.total || 0); })
      .catch(() => setSections([]));
  }, []);
  useEffect(loadSections, [loadSections]);

  const fetchAssets = useCallback((reset, pageOverride) => {
    setLoad(true);
    const p = reset ? 1 : (pageOverride || page);
    listAssets({ page: p, search, ...(active ? { category: active } : {}) })
      .then(d => {
        setAssets(prev => (reset ? (d.results || []) : [...prev, ...(d.results || [])]));
        setHasNext(!!d.has_next);
        setPage(p + 1);
      })
      .catch(() => { if (reset) setAssets([]); })
      .finally(() => setLoad(false));
  }, [page, search, active]);

  // Re-query whenever the section or the search text changes.
  useEffect(() => {
    const t = setTimeout(() => { setSel(new Set()); fetchAssets(true); }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, active]);

  const doUpload = async (files) => {
    if (!files || !files.length) return;
    setError('');
    const queued = Array.from(files).map(f => ({ name: f.name, status: 'waiting…' }));
    setUploads(prev => [...queued, ...prev]);

    // Small batches: one slow or rejected file no longer costs the whole set.
    const { results, errors } = await uploadAssetsInBatches(files, undefined, active, {
      onProgress: ({ done, total }) => setProgress(done < total ? `${done} of ${total} uploaded…` : ''),
    });

    setUploads(prev => prev.map(u => {
      const ok  = results.find(r => r.asset.original_filename === u.name);
      if (ok) return { ...u, status: ok.deduplicated ? 'already in library — filed here too' : 'uploaded' };
      const bad = errors.find(e => e.filename === u.name);
      if (bad) return { ...u, status: bad.error };
      return u;
    }));

    if (errors.length) {
      setError(`${errors.length} of ${queued.length} failed — ${errors[0].error}`);
    }
    if (results.length) { fetchAssets(true); loadSections(); }
  };

  const toggleSel = (id) => setSel(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const fileInto = (categoryId, remove = false) => {
    if (!selected.size || !categoryId) return;
    setBusy(true); setError('');
    categorizeAssets(Array.from(selected), remove ? { remove: [Number(categoryId)] } : { add: [Number(categoryId)] })
      .then(() => { setSel(new Set()); fetchAssets(true); loadSections(); })
      .catch(() => setError('Could not update sections. Please try again.'))
      .finally(() => setBusy(false));
  };

  const mains       = sections.filter(s => !s.parent);
  const activeName  = active
    ? (sections.find(s => s.id === active)?.name || 'Category')
    : 'All images';

  // Chips in a scrolling strip on phones, a vertical rail from lg up.
  const SectionButton = ({ id, name, count, indent }) => (
    <button onClick={() => setActive(id)}
      className={`shrink-0 lg:w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition text-left whitespace-nowrap border lg:border-0 ${
        indent ? 'lg:pl-8' : ''
      } ${
        active === id
          ? 'bg-accent/10 text-accent border-accent/30'
          : 'text-gray-600 dark:text-zinc-400 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
      }`}>
      <span className="truncate">
        {indent && <span className="lg:hidden text-gray-400">↳ </span>}{name}
      </span>
      <span className="text-xs text-gray-400 shrink-0">{count}</span>
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <p className="text-accent text-xs font-black uppercase tracking-widest mb-1">Admin Panel</p>
      <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100 mb-6">{PAGE_TITLE}</h1>

      <div className="grid lg:grid-cols-[15rem_1fr] gap-6 items-start">
        {/* Sections — sticky scrolling strip on phones, rail on desktop */}
        <div className="lg:bg-white lg:dark:bg-zinc-900 lg:border border-gray-100 dark:border-white/5 rounded-2xl lg:p-3 sticky top-0 z-10 bg-gray-50 dark:bg-zinc-950 py-2 lg:static lg:py-3">
          <p className="hidden lg:block px-3 pt-1 pb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Sections</p>

          <div className="flex lg:block gap-2 lg:gap-0 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-visible">
            <button onClick={() => setActive(null)}
              className={`shrink-0 lg:w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-bold transition text-left whitespace-nowrap border lg:border-0 ${
                active === null
                  ? 'bg-accent/10 text-accent border-accent/30'
                  : 'text-gray-700 dark:text-zinc-300 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}>
              <span className="flex items-center gap-2"><Images size={15} /> All images</span>
              <span className="text-xs text-gray-400">{total}</span>
            </button>

            {mains.map(m => (
              <React.Fragment key={m.id}>
                <SectionButton id={m.id} name={m.name} count={m.count} />
                {sections.filter(s => s.parent === m.id).map(s => (
                  <SectionButton key={s.id} id={s.id} name={s.name} count={s.count} indent />
                ))}
              </React.Fragment>
            ))}
          </div>

          {!mains.length && (
            <p className="px-3 py-2 text-xs text-gray-400">
              No categories yet — add one under Categories.
            </p>
          )}
        </div>

        {/* Section contents */}
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h2 className="text-lg font-black text-gray-900 dark:text-zinc-100 flex items-center gap-2">
              {active ? <FolderTree size={17} className="text-accent" /> : <Images size={17} className="text-accent" />}
              {activeName}
            </h2>
            <div className="relative flex-1 min-w-[12rem]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search filename, title, alt, tag…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40" />
            </div>
          </div>

          {/* Upload — lands in the section you are looking at */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); doUpload(e.dataTransfer.files); }}
            className="border-2 border-dashed border-gray-300 dark:border-white/15 rounded-2xl py-8 text-center cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors mb-4"
          >
            <UploadCloud size={30} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm font-semibold text-gray-600 dark:text-zinc-300">
              Drag images here, or click to browse — uploads go to <span className="text-accent">{activeName}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              JPG, PNG, WebP, AVIF · up to 15 MB each · many at once, sent a few at a time
            </p>
            {progress && (
              <p className="text-xs font-semibold text-accent mt-2 flex items-center justify-center gap-1.5">
                <Loader size={12} className="animate-spin" /> {progress}
              </p>
            )}
            <input ref={fileRef} type="file" multiple accept="image/*" className="hidden"
              onChange={e => { doUpload(e.target.files); e.target.value = ''; }} />
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-sm font-semibold text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {uploads.length > 0 && (
            <ul className="mb-4 space-y-1.5">
              {uploads.slice(0, 8).map((u, i) => (
                <li key={i} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-zinc-800">
                  <span className="truncate text-gray-700 dark:text-zinc-300">{u.name}</span>
                  <span className={`text-xs font-semibold ml-3 shrink-0 text-right ${
                    u.status === 'uploaded' ? 'text-green-600 dark:text-green-400'
                    : u.status.includes('already') ? 'text-amber-600 dark:text-amber-400'
                    : u.status === 'waiting…' ? 'text-gray-400'
                    : 'text-red-500'}`}>{u.status}</span>
                </li>
              ))}
              {uploads.length > 8 && <li className="text-xs text-gray-400 px-3">+{uploads.length - 8} more</li>}
            </ul>
          )}

          {/* Bulk section actions */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4 px-4 py-3 rounded-2xl bg-accent/5 border border-accent/20">
              <span className="text-sm font-bold text-accent">{selected.size} selected</span>
              <span className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-zinc-300 ml-auto">
                <FolderInput size={15} /> File into
              </span>
              <select defaultValue="" disabled={busy}
                onChange={e => { fileInto(e.target.value); e.target.value = ''; }}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm">
                <option value="">Choose section…</option>
                {mains.map(m => (
                  <optgroup key={m.id} label={m.name}>
                    <option value={m.id}>{m.name}</option>
                    {sections.filter(s => s.parent === m.id).map(s => (
                      <option key={s.id} value={s.id}>{m.name} → {s.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {active && (
                <button onClick={() => fileInto(active, true)} disabled={busy}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-white/5">
                  Remove from {activeName}
                </button>
              )}
              <button onClick={() => setSel(new Set())} className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200"><X size={16} /></button>
            </div>
          )}

          {/* Grid */}
          {!loading && !assets.length ? (
            <div className="text-center py-16 text-gray-400">
              <Images size={38} className="mx-auto mb-3 opacity-40" />
              <p className="font-semibold">No images in {activeName} yet</p>
              <p className="text-sm mt-1">Drop files above to upload them straight into this section.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {assets.map(a => (
                <button key={a.id} type="button" onClick={() => toggleSel(a.id)}
                  title={a.original_filename}
                  className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                    selected.has(a.id) ? 'border-accent ring-2 ring-accent/30' : 'border-transparent hover:border-gray-300 dark:hover:border-white/20'
                  }`}>
                  <img src={a.thumb_url} alt={a.alt_text || a.original_filename} loading="lazy"
                    className="w-full h-full object-cover bg-gray-100 dark:bg-zinc-800" />
                  {selected.has(a.id) && (
                    <span className="absolute inset-0 bg-accent/10 flex items-center justify-center">
                      <span className="w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center"><Check size={14} /></span>
                    </span>
                  )}
                  {!active && a.categories?.length > 0 && (
                    <span className="absolute bottom-1 left-1 right-1 truncate text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white">
                      {a.categories.map(c => c.name).join(', ')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {loading && <p className="text-center text-sm text-gray-400 mt-4 flex items-center justify-center gap-1"><Loader size={14} className="animate-spin" /> loading…</p>}
          {hasNext && !loading && (
            <button onClick={() => fetchAssets(false)}
              className="mx-auto mt-4 block px-4 py-1.5 rounded-lg text-sm font-semibold text-accent hover:bg-accent/10">Load more</button>
          )}
        </div>
      </div>
    </div>
  );
}
