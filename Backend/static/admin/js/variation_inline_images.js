(function () {
  'use strict';

  function getCsrf() {
    const c = document.cookie.split(';').find(s => s.trim().startsWith('csrftoken='));
    return c ? c.trim().split('=')[1] : '';
  }

  function buildThumb(id, url, deleteUrl) {
    const wrap = document.createElement('div');
    wrap.className = 'var-thumb';
    wrap.dataset.imageId = id;
    wrap.style.cssText = 'position:relative;display:inline-block;';
    wrap.innerHTML =
      `<img src="${url}" style="height:48px;width:48px;object-fit:cover;border-radius:4px;">` +
      `<button type="button" class="var-thumb-del" data-url="${deleteUrl}" ` +
      `style="position:absolute;top:-6px;right:-6px;background:#e74c3c;color:#fff;` +
      `border:none;border-radius:50%;width:16px;height:16px;cursor:pointer;` +
      `font-size:10px;line-height:1;padding:0;">&times;</button>`;
    return wrap;
  }

  function wireDeletes(widget) {
    widget.querySelectorAll('.var-thumb-del:not([data-wired])').forEach(btn => {
      btn.dataset.wired = '1';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const resp = await fetch(btn.dataset.url, {
            method: 'POST',
            headers: { 'X-CSRFToken': getCsrf() },
          });
          if (resp.ok) btn.closest('.var-thumb').remove();
          else btn.disabled = false;
        } catch (_) {
          btn.disabled = false;
        }
      });
    });
  }

  function initWidget(widget) {
    if (widget.dataset.initialized) return;
    widget.dataset.initialized = '1';

    const uploadUrl     = widget.dataset.uploadUrl;
    const thumbsWrap    = widget.querySelector('.var-thumbs');
    const picker        = widget.querySelector('.var-img-picker');

    wireDeletes(widget);

    picker.addEventListener('change', async () => {
      const files = Array.from(picker.files);
      if (!files.length) return;

      const fd = new FormData();
      files.forEach(f => fd.append('images', f));

      try {
        const resp = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'X-CSRFToken': getCsrf() },
          body: fd,
        });
        const data = await resp.json();
        (data.images || []).forEach(img => {
          const deleteUrl = uploadUrl.replace('upload-images/', `delete-image/${img.id}/`);
          const thumb = buildThumb(img.id, img.url, deleteUrl);
          thumbsWrap.appendChild(thumb);
          wireDeletes(widget);
        });
        if (data.errors && data.errors.length) {
          alert('Some images could not be uploaded:\n\n' + data.errors.join('\n'));
        } else if (data.error) {
          alert('Image upload failed: ' + data.error);
        }
      } catch (e) {
        console.error('Variation image upload failed', e);
        alert('Image upload failed. Please check your connection and try again.');
      }

      picker.value = '';
    });
  }

  function initAll() {
    document.querySelectorAll('.var-img-widget:not([data-initialized])').forEach(initWidget);
  }

  window.addEventListener('load', initAll);

  // Re-init when Django adds a new inline row
  document.addEventListener('formset:added', initAll);
})();
