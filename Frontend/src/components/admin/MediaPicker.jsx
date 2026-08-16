import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader, Search, Trash2, UploadCloud, X, Star } from 'lucide-react';
import {
  attachMedia, detachMedia, getAttachments, listAssets, reorderMedia, uploadAssets,
} from '../../api/adminApi';

/**
 * Upload-once / choose-anywhere image picker for the custom admin.
 *
 * Renders the entity's current attachments (drag to reorder, click × to detach)
 * plus a "Choose from library" modal with Library + Upload tabs. Uploading a
 * duplicate reuses the existing asset (dedup) instead of erroring. Mirrors the
 * Django-admin picker, but JWT-authed via /api/admin/media/*.
 */
export default function MediaPicker({
  type, id, role = 'gallery', single = false, folder = '', label = 'Images',
}) {
  const [items, setItems]   = useState([]);
  const [open, setOpen]     = useState(false);
  const [loading, setLoad]  = useState(false);
  const dragId = useRef(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoad(true);
    getAttachments(type, id)
      .then(d => setItems(d.attachments || []))
      .finally(() => setLoad(false));
  }, [type, id]);

  useEffect(() => { load(); }, [load]);

  const handleDetach = (attId) =>
    detachMedia(type, id, attId).then(load);

  const handleAttach = (mediaIds) => {
    const ids = single ? mediaIds.slice(0, 1) : mediaIds;
    return attachMedia(type, id, ids, role).then(load);
  };

  // drag reorder
  const onDrop = (targetId) => {
    const from = items.findIndex(a => a.id === dragId.current);
    const to   = items.findIndex(a => a.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const order = items.map(a => a.id);
    order.splice(to, 0, order.splice(from, 1)[0]);
    setItems(order.map(oid => items.find(a => a.id === oid)));  // optimistic
    reorderMedia(type, id, order).then(load);
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
            {!single && !att.media.alt_text && (
              <span className="absolute bottom-1 left-1 text-[10px] font-bold px-1 rounded bg-amber-500/90 text-white">alt?</span>
            )}
            {single && (
              <span className="absolute bottom-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent text-white flex items-center gap-0.5">
                <Star size={9} className="fill-white" /> cover
              </span>
            )}
            <button
              type="button"
              onClick={() => handleDetach(att.id)}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 dark:border-white/15 text-gray-400 dark:text-zinc-500 hover:border-accent hover:text-accent flex flex-col items-center justify-center gap-1 transition-colors"
        >
          <ImagePlus size={22} />
          <span className="text-[11px] font-semibold">{single ? 'Set cover' : 'Add'}</span>
        </button>
      </div>
      {loading && <p className="text-xs text-gray-400 flex items-center gap-1"><Loader size={12} className="animate-spin" /> loading…</p>}

      {open && (
        <LibraryModal
          folder={folder}
          single={single}
          onClose={() => setOpen(false)}
          onConfirm={(ids) => handleAttach(ids).then(() => setOpen(false))}
        />
      )}
    </div>
  );
}

// ── Library + Upload modal ─────────────────────────────────────────────────
function LibraryModal({ folder, single, onClose, onConfirm }) {
  const [tab, setTab]         = useState('library');
  const [assets, setAssets]   = useState([]);
  const [page, setPage]       = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [search, setSearch]   = useState('');
  const [selected, setSel]    = useState(new Map());
  const [loading, setLoad]    = useState(false);
  const [uploads, setUploads] = useState([]);
  const fileRef = useRef(null);

  const fetchAssets = useCallback((reset) => {
    setLoad(true);
    const p = reset ? 1 : page;
    listAssets({ page: p, search })
      .then(d => {
        setAssets(prev => reset ? (d.results || []) : [...prev, ...(d.results || [])]);
        setHasNext(d.has_next);
        setPage(p + 1);
      })
      .finally(() => setLoad(false));
  }, [page, search]);

  useEffect(() => {
    const t = setTimeout(() => fetchAssets(true), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const toggle = (asset) => {
    setSel(prev => {
      const next = single ? new Map() : new Map(prev);
      if (prev.has(asset.id)) next.delete(asset.id);
      else next.set(asset.id, asset);
      return next;
    });
  };

  const doUpload = (files) => {
    if (!files || !files.length) return;
    const names = Array.from(files).map(f => ({ name: f.name, status: 'uploading…' }));
    setUploads(prev => [...names, ...prev]);
    uploadAssets(files, folder).then(d => {
      const results = d.results || [];
      setUploads(prev => prev.map(u => {
        const match = results.find(r => r.asset.original_filename === u.name);
        if (!match) return u;
        return { ...u, status: match.deduplicated ? 'already in library — reused' : 'uploaded' };
      }));
      setSel(prev => {
        const next = single ? new Map() : new Map(prev);
        results.forEach(r => next.set(r.asset.id, r.asset));
        return next;
      });
      fetchAssets(true);
    }).catch(() => {
      setUploads(prev => prev.map(u => ({ ...u, status: 'failed' })));
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
         onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'library' ? (
            <>
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search filename, title, alt, tag…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40" />
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {assets.map(a => (
                  <button key={a.id} type="button" onClick={() => toggle(a)}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                      selected.has(a.id) ? 'border-accent ring-2 ring-accent/30' : 'border-transparent hover:border-gray-300 dark:hover:border-white/20'
                    }`}>
                    <img src={a.thumb_url} alt={a.alt_text || a.original_filename} loading="lazy"
                         className="w-full h-full object-cover bg-gray-100 dark:bg-zinc-800" />
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
                <p className="text-sm font-semibold text-gray-600 dark:text-zinc-300">Drag images here, or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP, AVIF · up to 15 MB · uploaded once, reused anywhere</p>
                <input ref={fileRef} type="file" multiple accept="image/*" className="hidden"
                       onChange={(e) => { doUpload(e.target.files); e.target.value = ''; }} />
              </div>
              {uploads.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {uploads.map((u, i) => (
                    <li key={i} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-zinc-800">
                      <span className="truncate text-gray-700 dark:text-zinc-300">{u.name}</span>
                      <span className={`text-xs font-semibold ml-3 shrink-0 ${
                        u.status === 'failed' ? 'text-red-500'
                        : u.status.includes('reused') ? 'text-amber-600 dark:text-amber-400'
                        : u.status === 'uploaded' ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>{u.status}</span>
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
          <button
            onClick={() => selected.size ? onConfirm(Array.from(selected.keys())) : onClose()}
            className="px-5 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition">
            {selected.size ? `Add ${selected.size}` : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
