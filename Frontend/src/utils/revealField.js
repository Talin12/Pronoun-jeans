/**
 * Scroll to a field, focus it and flash it.
 *
 * Used by the Merchant readiness panel: a finding names the field that fixes
 * it, and clicking it should land the cursor in that field rather than telling
 * the admin which step to go and look in.
 *
 * The target is usually not mounted when this is called. Jumping to a field
 * means changing the wizard step, and a variant field also means opening that
 * row's panel — both land a render or two later, and a variant panel that has
 * to mount a form can take a few more. So this polls animation frames for the
 * element instead of guessing a timeout, and gives up quietly rather than
 * throwing if the field genuinely is not there.
 */

const FLASH_MS = 1800;
const MAX_FRAMES = 60;      // ~1s at 60fps, enough for a step change plus a panel.
const FOCUSABLE = 'input, select, textarea, button, [tabindex]';

export function revealField(field, { variation, onMissing } = {}) {
  if (!field) return;

  // Variant fields exist once per row -- every row has an availability
  // switch, and the form fields exist on whichever panel is open. So a
  // finding about a variant is matched on the row id as well as the field,
  // or it would land on whichever row happens to come first in the DOM.
  const selector = variation
    ? `[data-fix="${field}"][data-fix-variation="${variation}"]`
    : `[data-fix="${field}"]`;

  let frames = 0;
  const tick = () => {
    const el = document.querySelector(selector);
    if (!el) {
      if (frames++ < MAX_FRAMES) requestAnimationFrame(tick);
      else onMissing?.(field);
      return;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // The marker sits on the field's wrapper so the label flashes with it,
    // but the cursor belongs in the control itself.
    const control = el.matches(FOCUSABLE) ? el : el.querySelector(FOCUSABLE);
    // preventScroll: the smooth scroll above is already underway, and focus()
    // would otherwise snap it to the element instantly.
    control?.focus({ preventScroll: true });

    el.classList.add('fix-flash');
    setTimeout(() => el.classList.remove('fix-flash'), FLASH_MS);
  };

  requestAnimationFrame(tick);
}

export default revealField;
