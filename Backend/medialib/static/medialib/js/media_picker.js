/*
 * Reusable media-library picker for the Django admin.
 *
 * Drop a container anywhere:
 *   <div class="media-picker-field"
 *        data-api-base="/admin/medialib/api/"
 *        data-type="product" data-id="123" data-role="gallery"></div>
 *
 * It renders the entity's current attachments as a drag-to-reorder strip with a
 * "primary" toggle and per-image detach, plus a "Choose from library" button
 * that opens a shared modal (Library + Upload tabs). Uploading a duplicate says
 * "reusing existing image" instead of erroring — that's the whole point.
 */
(function () {
  'use strict';

  function getCookie(name) {
    const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? decodeURIComponent(m.pop()) : '';
  }
  const CSRF = getCookie('csrftoken');

  function api(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign(
      { 'X-CSRFToken': CSRF }, opts.headers || {}
    );
    if (opts.json !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.json);
      delete opts.json;
    }
    opts.credentials = 'same-origin';
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) { data.__status = r.status; throw data; }
        return data;
      });
    });
  }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'html') n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  // ── Shared modal (singleton) ───────────────────────────────────────────────
  let modal = null;

  function buildModal() {
    const overlay = el('div', { class: 'mp-overlay', style: 'display:none;' });
    const box = el('div', { class: 'mp-modal' });

    const tabs = el('div', { class: 'mp-tabs' });
    const tabLib = el('button', { type: 'button', class: 'mp-tab active', text: 'Library' });
    const tabUp = el('button', { type: 'button', class: 'mp-tab', text: 'Upload' });
    const closeBtn = el('button', { type: 'button', class: 'mp-close', html: '&times;' });
    tabs.appendChild(tabLib); tabs.appendChild(tabUp); tabs.appendChild(closeBtn);

    const search = el('input', { type: 'search', class: 'mp-search', placeholder: 'Search filename, title, alt, tag…' });
    const libPane = el('div', { class: 'mp-pane mp-library' });
    const grid = el('div', { class: 'mp-grid' });
    const more = el('button', { type: 'button', class: 'mp-more', text: 'Load more' });
    more.style.display = 'none';
    libPane.appendChild(search); libPane.appendChild(grid); libPane.appendChild(more);

    const upPane = el('div', { class: 'mp-pane mp-upload', style: 'display:none;' });
    const drop = el('div', { class: 'mp-drop', text: 'Drag images here, or click to browse' });
    const fileInput = el('input', { type: 'file', multiple: 'multiple', accept: 'image/*', style: 'display:none;' });
    const upList = el('div', { class: 'mp-uplist' });
    upPane.appendChild(drop); upPane.appendChild(fileInput); upPane.appendChild(upList);

    const footer = el('div', { class: 'mp-footer' });
    const selInfo = el('span', { class: 'mp-selinfo', text: '0 selected' });
    const confirm = el('button', { type: 'button', class: 'mp-confirm default', text: 'Add selected' });
    footer.appendChild(selInfo); footer.appendChild(confirm);

    box.appendChild(tabs); box.appendChild(libPane); box.appendChild(upPane); box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const state = {
      overlay: overlay, grid: grid, more: more, search: search, selInfo: selInfo,
      confirm: confirm, upList: upList, drop: drop, fileInput: fileInput,
      selected: new Map(), page: 1, pages: 1, ctx: null,
    };

    function close() { overlay.style.display = 'none'; }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    function showTab(which) {
      const lib = which === 'lib';
      tabLib.classList.toggle('active', lib);
      tabUp.classList.toggle('active', !lib);
      libPane.style.display = lib ? '' : 'none';
      upPane.style.display = lib ? 'none' : '';
    }
    tabLib.addEventListener('click', function () { showTab('lib'); });
    tabUp.addEventListener('click', function () { showTab('up'); });

    function updateSel() {
      state.selInfo.textContent = state.selected.size + ' selected';
    }

    function cardFor(asset) {
      const card = el('div', { class: 'mp-card', 'data-id': asset.id });
      const img = el('img', { src: asset.thumb_url, alt: asset.alt_text || asset.original_filename, loading: 'lazy' });
      card.appendChild(img);
      if (!asset.alt_text) card.appendChild(el('span', { class: 'mp-noalt', title: 'No alt text set', text: 'alt?' }));
      card.addEventListener('click', function () {
        // Single-select mode (e.g. a Cover image): picking one clears the rest.
        if (state.ctx && state.ctx.single) {
          const already = state.selected.has(asset.id);
          state.selected.clear();
          state.grid.querySelectorAll('.mp-card.sel').forEach(function (c) { c.classList.remove('sel'); });
          if (!already) { state.selected.set(asset.id, asset); card.classList.add('sel'); }
        } else if (state.selected.has(asset.id)) {
          state.selected.delete(asset.id); card.classList.remove('sel');
        } else {
          state.selected.set(asset.id, asset); card.classList.add('sel');
        }
        updateSel();
      });
      if (state.selected.has(asset.id)) card.classList.add('sel');
      return card;
    }

    function loadLibrary(reset) {
      if (reset) { state.page = 1; state.grid.innerHTML = ''; }
      const base = state.ctx.apiBase;
      const url = base + 'assets/?page=' + state.page +
        '&search=' + encodeURIComponent(state.search.value.trim());
      return api(url).then(function (data) {
        (data.results || []).forEach(function (a) { state.grid.appendChild(cardFor(a)); });
        state.pages = data.pages;
        state.more.style.display = data.has_next ? '' : 'none';
      });
    }
    state.loadLibrary = loadLibrary;
    more.addEventListener('click', function () { state.page += 1; loadLibrary(false); });

    let searchTimer = null;
    search.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { loadLibrary(true); }, 250);
    });

    // Upload handling
    function doUpload(files) {
      Array.prototype.forEach.call(files, function (file) {
        const row = el('div', { class: 'mp-uprow' }, [
          el('span', { class: 'mp-upname', text: file.name }),
          el('span', { class: 'mp-upstatus', text: 'uploading…' }),
        ]);
        state.upList.appendChild(row);
        const fd = new FormData();
        fd.append('files', file);
        if (state.ctx.folder) fd.append('folder', state.ctx.folder);
        api(state.ctx.apiBase + 'assets/upload/', { method: 'POST', body: fd })
          .then(function (data) {
            const res = (data.results || [])[0];
            const status = row.querySelector('.mp-upstatus');
            if (res) {
              status.textContent = res.deduplicated ? 'Already in library — reusing existing image' : 'uploaded';
              status.className = 'mp-upstatus ' + (res.deduplicated ? 'dedup' : 'ok');
              // auto-select the uploaded/deduped asset (single mode keeps only the latest)
              if (state.ctx && state.ctx.single) state.selected.clear();
              state.selected.set(res.asset.id, res.asset);
              updateSel();
            } else {
              const err = (data.errors || [])[0];
              status.textContent = err ? err.error : 'failed';
              status.className = 'mp-upstatus err';
            }
          })
          .catch(function () {
            const status = row.querySelector('.mp-upstatus');
            status.textContent = 'failed'; status.className = 'mp-upstatus err';
          });
      });
    }
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { doUpload(fileInput.files); fileInput.value = ''; });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) { doUpload(e.dataTransfer.files); });

    confirm.addEventListener('click', function () {
      const ids = Array.from(state.selected.keys());
      if (!ids.length) { close(); return; }
      state.ctx.onConfirm(ids).then(close);
    });

    state.open = function (ctx) {
      state.ctx = ctx;
      state.selected = new Map();
      state.upList.innerHTML = '';
      updateSel();
      showTab('lib');
      overlay.style.display = '';
      loadLibrary(true);
    };
    return state;
  }

  function openPicker(ctx) {
    if (!modal) modal = buildModal();
    modal.open(ctx);
  }

  // ── Field widget (per placement) ────────────────────────────────────────────
  function initField(container) {
    const base = container.dataset.apiBase;
    const type = container.dataset.type;
    const id = container.dataset.id;
    const role = container.dataset.role || 'gallery';
    const folder = container.dataset.folder || '';
    const single = container.dataset.single === 'true';
    const entityBase = base + type + '/' + id + '/';

    const strip = el('div', { class: 'mp-strip' });
    const addBtn = el('button', {
      type: 'button', class: 'mp-add',
      text: single ? '+ Choose cover from library' : '+ Choose from library',
    });
    container.appendChild(strip);
    container.appendChild(addBtn);

    let items = [];

    function render() {
      strip.innerHTML = '';
      items.forEach(function (att) {
        const cell = el('div', { class: 'mp-item', draggable: 'true', 'data-att': att.id });
        const img = el('img', { src: att.media.thumb_url, alt: att.media.alt_text || '' });
        cell.appendChild(img);
        if (att.role === 'primary') cell.appendChild(el('span', { class: 'mp-badge', text: 'primary' }));
        const rm = el('button', { type: 'button', class: 'mp-rm', html: '&times;', title: 'Detach' });
        rm.addEventListener('click', function (e) {
          e.stopPropagation();
          api(entityBase + 'detach/', { method: 'POST', json: { attachment_id: att.id } })
            .then(load);
        });
        cell.appendChild(rm);
        // drag reorder
        cell.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', att.id); cell.classList.add('drag'); });
        cell.addEventListener('dragend', function () { cell.classList.remove('drag'); });
        cell.addEventListener('dragover', function (e) { e.preventDefault(); });
        cell.addEventListener('drop', function (e) {
          e.preventDefault();
          const fromId = parseInt(e.dataTransfer.getData('text/plain'), 10);
          reorder(fromId, att.id);
        });
        strip.appendChild(cell);
      });
      if (!items.length) strip.appendChild(el('span', { class: 'mp-empty', text: 'No images yet.' }));
    }

    function load() {
      // Scoped to this widget's role, so a cover placement and a gallery
      // placement on the same object never list — or detach — each other's
      // attachments.
      return api(entityBase + 'attachments/?role=' + encodeURIComponent(role)).then(function (data) {
        items = data.attachments || [];
        render();
      });
    }

    function reorder(fromId, toId) {
      const ids = items.map(function (a) { return a.id; });
      const from = ids.indexOf(fromId), to = ids.indexOf(toId);
      if (from < 0 || to < 0 || from === to) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      api(entityBase + 'reorder/', { method: 'POST', json: { order: ids } }).then(load);
    }

    addBtn.addEventListener('click', function () {
      openPicker({
        apiBase: base,
        folder: folder,
        single: single,
        onConfirm: function (mediaIds) {
          // A single-slot role (e.g. cover) only ever attaches one asset.
          const ids = single ? mediaIds.slice(0, 1) : mediaIds;
          return api(entityBase + 'attach/', {
            method: 'POST', json: { media_ids: ids, role: role },
          }).then(load);
        },
      });
    });

    load();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.media-picker-field').forEach(initField);
  });
})();
