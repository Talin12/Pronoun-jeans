"""
SKU generation for product variants.

One format, built automatically for every variant so nobody types one:

    574_BLACK_30TO36_4PCS
    │   │     │      └─ pieces in the chosen set breakdown
    │   │     └─ size set name, spaces removed
    │   └─ colour
    └─ product code (falls back to the slug when no code is set)

Parts that do not apply are left out rather than filled with a placeholder — a
variant with no colour reads 574_30TO36_4PCS, not 574_C_30TO36_4PCS. Underscore
separates the parts, so hyphens inside a code survive intact.

Shared by the bulk builder and single-variant creation; both must produce the
same SKU for the same inputs.
"""

import re

SEPARATOR = '_'

# Generous caps: enough that real colour and size-set names survive whole
# ("30 TO 36", "MIDNIGHT BLUE"), short enough to stay inside sku's 100 chars
# even once the uniqueness suffix is added.
CODE_MAX  = 16
PART_MAX  = 16


def token(value, length=PART_MAX):
    """Upper-case alphanumerics only — "30 TO 36" becomes "30TO36"."""
    return re.sub(r'[^A-Z0-9]+', '', str(value or '').upper())[:length]


def sku_prefix(product, override=None):
    """
    The leading part: an explicit override, else the product code, else the slug.

    The code exists to be the SKU prefix, so it beats the slug — which comes
    from the full product name and is long and unreadable.
    """
    raw = override or getattr(product, 'code', None) or getattr(product, 'slug', None)
    return token(raw, CODE_MAX) or 'SKU'


def build_sku(product, color=None, size_set=None, breakdown=None, *,
              prefix=None, taken=()):
    """
    CODE_COLOUR_SIZESET_<n>PCS for one variant.

    `taken` is a collection of SKUs already in use; a clash gets _2, _3, … so
    two variants differing only in something absent from the format (a second
    breakdown of the same set, say) still each get a unique SKU.
    """
    parts = [sku_prefix(product, prefix)]

    color_name = getattr(color, 'name', color)
    if color_name:
        parts.append(token(color_name))

    size_name = getattr(size_set, 'name', size_set)
    if size_name:
        parts.append(token(size_name))

    pieces = getattr(breakdown, 'pieces', breakdown)
    if pieces:
        parts.append(f'{int(pieces)}PCS')

    base = SEPARATOR.join(p for p in parts if p)
    sku, n = base, 2
    while sku in taken:
        sku = f'{base}{SEPARATOR}{n}'
        n += 1
    return sku
