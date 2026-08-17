(function () {
  'use strict';

  // ── Master size order ─────────────────────────────────────────────────────
  // 2XL, not XXL — the run reads 2XL, 3XL, 4XL without switching notation.
  const ALL_SIZES = [
    'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL',
    '26', '28', '30', '32', '34', '36', '38', '40', '42', '44', '46',
  ];

  function getMembersBetween(fromSize, toSize) {
    const fromIdx = ALL_SIZES.indexOf(fromSize);
    const toIdx   = ALL_SIZES.indexOf(toSize);
    if (fromIdx === -1 || toIdx === -1 || fromIdx > toIdx) return [];
    return ALL_SIZES.slice(fromIdx, toIdx + 1);
  }

  function parseBreakdown(str) {
    const map = {};
    if (!str) return map;
    str.split(',').forEach(function (part) {
      const m = part.trim().match(/^(\d+)x(.+)$/);
      if (m) map[m[2].trim()] = parseInt(m[1], 10);
    });
    return map;
  }

  function buildBreakdownString(builderEl) {
    const parts = [];
    builderEl.querySelectorAll('.sb-pill').forEach(function (pill) {
      const qty  = parseInt(pill.querySelector('.sb-qty').value, 10);
      const size = pill.dataset.size;
      if (qty > 0) parts.push(qty + 'x' + size);
    });
    return parts.join(', ');
  }

  // ── Check if we are on the SizeSet page ───────────────────────────────────
  function isSizeSetPage() {
    return window.location.href.includes('/products/sizeset/');
  }

  // ── Update the read-only Name field ──────────────────────────────────────
  function updateNameField() {
    const nameInput = document.getElementById('id_name');
    const fromSel   = document.getElementById('sb-from-select');
    const toSel     = document.getElementById('sb-to-select');
    if (!nameInput || !fromSel || !toSel) return;
    nameInput.value = (fromSel.value && toSel.value)
      ? fromSel.value + ' TO ' + toSel.value
      : '';
  }

  function getCurrentMembers() {
    const fromSel = document.getElementById('sb-from-select');
    const toSel   = document.getElementById('sb-to-select');
    if (!fromSel || !toSel) return [];
    return getMembersBetween(fromSel.value, toSel.value);
  }

  // ── Render pill quantity selects into a breakdown_string input ────────────
  function renderBuilderIntoInput(inputEl, members) {
    if (!inputEl) return;

    const existing = inputEl.parentNode.querySelector('.sb-builder');
    if (existing) existing.remove();

    if (!members || members.length === 0) {
      inputEl.style.display = '';
      return;
    }

    inputEl.style.display = 'none';
    const existing_qtys = parseBreakdown(inputEl.value);

    const builder = document.createElement('div');
    builder.className = 'sb-builder';
    builder.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;align-items:center;padding:4px 0;';

    members.forEach(function (size) {
      const pill = document.createElement('span');
      pill.className    = 'sb-pill';
      pill.dataset.size = size;
      pill.style.cssText = 'display:inline-flex;align-items:center;gap:3px;background:#f8f9fa;border:1px solid #ced4da;border-radius:4px;padding:2px 8px;font-size:12px;';

      const lbl = document.createElement('span');
      lbl.textContent   = size + ':';
      lbl.style.cssText = 'font-weight:600;color:#495057;white-space:nowrap;';

      const sel = document.createElement('select');
      sel.className = 'sb-qty';
      sel.style.cssText = 'border:none;background:transparent;font-size:12px;font-weight:700;color:#212529;cursor:pointer;padding:0 2px;outline:none;width:40px;';

      for (let i = 0; i <= 5; i++) {
        const opt       = document.createElement('option');
        opt.value       = i;
        opt.textContent = i;
        const defaultQty = existing_qtys[size] !== undefined ? existing_qtys[size] : 1;
        if (i === defaultQty) opt.selected = true;
        sel.appendChild(opt);
      }

      // change handled by document-level delegation in initSizeSetPage

      pill.appendChild(lbl);
      pill.appendChild(sel);
      builder.appendChild(pill);
    });

    inputEl.parentNode.insertBefore(builder, inputEl.nextSibling);

    const str      = buildBreakdownString(builder);
    const initRow  = inputEl.closest('tr, .form-row');
    const initLbl  = initRow ? initRow.querySelector('input[id*="label"], input[name*="label"]') : null;
    inputEl.value  = str;
    if (initLbl) initLbl.value = str;
  }

  // ── Refresh all breakdown_string inputs ───────────────────────────────────
  function refreshAllBreakdownBuilders() {
    const members = getCurrentMembers();
    document.querySelectorAll(
      'input[id*="breakdown_string"], input[name*="breakdown_string"]'
    ).forEach(function (inputEl) {
      renderBuilderIntoInput(inputEl, members);
    });
  }

  // ── Inject From/To dropdowns above the Name field ─────────────────────────
  function injectFromToDropdowns() {
    const nameInput = document.getElementById('id_name');
    if (!nameInput || document.getElementById('sb-from-select')) return;

    nameInput.readOnly         = true;
    nameInput.style.background = '#e9ecef';
    nameInput.style.color      = '#6c757d';
    nameInput.style.cursor     = 'not-allowed';

    const existingName = nameInput.value.trim();
    let existingFrom = '', existingTo = '';
    const match = existingName.match(/^(.+)\s+TO\s+(.+)$/i);
    if (match) {
      existingFrom = match[1].trim();
      existingTo   = match[2].trim();
    }

    function makeSelect(id, preselect) {
      const sel = document.createElement('select');
      sel.id            = id;
      sel.style.cssText = 'height:31px;padding:4px 8px;font-size:13px;border:1px solid #ced4da;border-radius:4px;background:#fff;cursor:pointer;min-width:110px;';
      const blank       = document.createElement('option');
      blank.value       = '';
      blank.textContent = '— select —';
      sel.appendChild(blank);
      ALL_SIZES.forEach(function (size) {
        const opt       = document.createElement('option');
        opt.value       = size;
        opt.textContent = size;
        if (size === preselect) opt.selected = true;
        sel.appendChild(opt);
      });
      return sel;
    }

    function makeLabel(text) {
      const lbl = document.createElement('span');
      lbl.textContent   = text;
      lbl.style.cssText = 'font-size:13px;font-weight:600;color:#495057;white-space:nowrap;';
      return lbl;
    }

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;';

    const fromSel = makeSelect('sb-from-select', existingFrom);
    const toSel   = makeSelect('sb-to-select',   existingTo);

    wrapper.appendChild(makeLabel('From:'));
    wrapper.appendChild(fromSel);
    wrapper.appendChild(makeLabel('To:'));
    wrapper.appendChild(toSel);

    nameInput.parentNode.insertBefore(wrapper, nameInput);

    // ── Event binding ─────────────────────────────────────────────────────
    // Jazzmin applies Select2 to ALL selects after DOMContentLoaded.
    // Select2 fires jQuery change events — not native DOM events — so
    // native addEventListener misses them. jQuery document-level delegation
    // catches both native and jQuery-triggered change events reliably.
    function onRangeChange() {
      updateNameField();
      refreshAllBreakdownBuilders();
    }

    if (window.jQuery) {
      jQuery(document).on('change', '#sb-from-select', onRangeChange);
      jQuery(document).on('change', '#sb-to-select',   onRangeChange);

      // Destroy Select2 on our custom selects so they render as plain
      // native dropdowns — the From/To pickers don't need Select2's search UI.
      setTimeout(function () {
        try { jQuery('#sb-from-select').select2('destroy'); } catch (e) {}
        try { jQuery('#sb-to-select').select2('destroy'); } catch (e) {}
      }, 300);
    } else {
      fromSel.addEventListener('change', onRangeChange);
      toSel.addEventListener('change', onRangeChange);
    }
  }

  // ── Watch for new inline rows added via "Add another" ────────────────────
  function observeNewRows() {
    const observer = new MutationObserver(function () {
      const members = getCurrentMembers();
      document.querySelectorAll(
        'input[id*="breakdown_string"], input[name*="breakdown_string"]'
      ).forEach(function (inputEl) {
        if (inputEl.dataset.sbAttached) return;
        inputEl.dataset.sbAttached = '1';
        renderBuilderIntoInput(inputEl, members);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  function attachDelegatedQtyListener() {
    function onQtyChange(sel) {
      const builder = sel.closest('.sb-builder');
      if (!builder) return;
      const row     = builder.closest('tr, .form-row');
      const inputEl = row ? row.querySelector('input[id*="breakdown_string"], input[name*="breakdown_string"]') : null;
      const labelInp = row ? row.querySelector('input[id*="label"], input[name*="label"]') : null;
      const str = buildBreakdownString(builder);
      if (inputEl) inputEl.value = str;
      if (labelInp) labelInp.value = str;
    }

    if (window.jQuery) {
      jQuery(document).on('change', '.sb-qty', function () { onQtyChange(this); });
    } else {
      document.addEventListener('change', function (e) {
        if (e.target && e.target.classList.contains('sb-qty')) onQtyChange(e.target);
      });
    }
  }

  function initSizeSetPage() {
    injectFromToDropdowns();
    refreshAllBreakdownBuilders();
    observeNewRows();
    attachDelegatedQtyListener();
  }

  function init() {
    if (isSizeSetPage()) {
      initSizeSetPage();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
