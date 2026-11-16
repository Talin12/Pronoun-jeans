/**
 * Flatten a DRF error body into one readable line.
 *
 * DRF nests errors to whatever depth the serializer nests, so a nested
 * serializer reports `{agent_profile: {agent_code: ["..."]}}`. The panel used
 * to join the top level only, which stringifies that inner object as
 * "[object Object]" — the error was there, just unreadable, which is how a
 * blocked save looked like a save that did nothing.
 *
 * Keys are joined with dots so the offending field is identifiable:
 *   "agent profile · agent code: That agent code already belongs to …"
 */
export function formatApiError(data, fallback = 'Save failed.') {
  const lines = [];

  const walk = (node, path) => {
    if (node === null || node === undefined) return;

    if (Array.isArray(node)) {
      // A list of plain messages, or a list of per-row error objects.
      const msgs = node.filter(v => v !== null && typeof v !== 'object');
      if (msgs.length) lines.push([path, msgs.join(' ')]);
      node.forEach((v, i) => {
        if (v && typeof v === 'object') {
          walk(v, Array.isArray(node) && node.length > 1 ? [...path, `#${i + 1}`] : path);
        }
      });
      return;
    }

    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
      return;
    }

    lines.push([path, String(node)]);
  };

  walk(data, []);

  if (!lines.length) return fallback;

  return lines
    .map(([path, msg]) => {
      // `detail` and `non_field_errors` carry no useful field name.
      const label = path
        .filter(p => p !== 'detail' && p !== 'non_field_errors')
        .map(p => p.replace(/_/g, ' '))
        .join(' · ');
      return label ? `${label}: ${msg}` : msg;
    })
    .join('  •  ');
}
