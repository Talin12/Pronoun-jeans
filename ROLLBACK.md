# ROLLBACK — media library deploy

Known-good pre-medialib commit: **`0526ced`** (`feat: email buyers when admin approves…`).
Latest verified DB backup: **`Backend/rehearsal/prod_dump.sql`** (pointer to newest timestamped dump).

Read the symptom row, do the action. Details below the table.

## Symptom → action

| Symptom | Action |
|---|---|
| **Storefront images broken / blank** | Frontend only. **Vercel → roll back frontend** (§1a). Backend is fine — do NOT touch it. |
| **Admin errors / 500s after deploy** | **Render → redeploy `0526ced`** (§1b). |
| **Site down (storefront or API 5xx)** | **Render → redeploy `0526ced`** (§1b). If storefront-only, also Vercel rollback (§1a). |
| **Product images wrong AFTER someone used the picker** | Code revert does NOT fix this. **Data rollback** (§2) — the picker changed legacy image columns. |
| **Not sure** | Vercel rollback (§1a) first (instant, safe). If still broken, Render redeploy `0526ced` (§1b). |

---

## 1. Code rollback (redeploy, never force-push — keep the media-library work in git)

### 1a. Frontend (Vercel) — fixes storefront visuals, leaves backend running
1. Vercel → project → **Deployments**.
2. Find the last known-good deployment (before the media-library frontend deploy).
3. **⋯ → Promote to Production** (a.k.a. Rollback).
   Instant. Backend/Render is untouched.

### 1b. Backend (Render) — redeploy the known-good commit
1. Render → the backend service → **Manual Deploy → Deploy a specific commit**.
2. Enter **`0526ced`** → Deploy.
   (Or **Rollback** to the previous successful deploy if it was `0526ced`.)
3. Do NOT `git push --force`. The media-library commits stay in history; you are only
   redeploying an older commit.

---

## 2. Data rollback (only if the picker was used and changed image data)

**A code revert does NOT undo data.** While live, the picker's attach/detach ran
`_sync_legacy`, which writes to the LEGACY image columns:
- overwrote **`Product.image` / `ProductVariation.image` / `Category.image` / `HeroSlide.image`**,
- created/deleted **`ProductImage` / `VariationImage` / `ProductColorImage`** rows.

Reverting code leaves those changes in place. To recover the image data:

> ⚠️ **A full restore overwrites the ENTIRE `public` schema — it reverts every table to
> the dump's moment, discarding orders/users/carts created since. Prefer targeted recovery.**

**Preferred — targeted (only the affected rows), if you know which product(s):**
Restore just those products' image fields/rows from the dump into a scratch DB and copy
back. Ask for help rather than guessing under pressure.

**Last resort — full restore from the verified dump** (accepts loss of post-dump writes):
```bash
# Restores production public schema from the dump. DESTRUCTIVE to newer data.
# Session pooler (port 5432), NOT the 6543 transaction pooler.
DUMP=Backend/rehearsal/prod_dump.sql
psql "postgresql://postgres.<ref>:<pw>@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" \
  && psql "postgresql://postgres.<ref>:<pw>@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres" \
  < "$DUMP"
```
The dump is verified restorable (row counts matched production exactly for all seven
image tables).

**Best case: no data rollback needed.** If nobody used the picker, the deploy changed
**zero** rows (proven inert) — code rollback alone is sufficient.

---

## 3. Leave this alone — do NOT panic-drop

The **`medialib_mediaasset`** and **`medialib_mediaattachment`** tables can stay in the
database after any code revert. With the media-library code gone, **nothing reads them** —
they are inert and harmless. Dropping them is unnecessary and risks nothing-gained mistakes.
Leave them.

---

## 4. Verify healthy after rollback
1. **Storefront** (`https://www.pronounjeans.com`): Home hero + category images load;
   open a category and a product — images render, no broken slots.
2. **API**: `GET /api/health/` → 200; `GET /api/products/categories/` → 200 with data.
3. **Admin** (`/admin/`): loads, open a Product change page — no 500.
4. **Images correct**: spot-check 2–3 products' images match what they were before.
5. If you did a data restore: confirm recent legitimate data (latest orders) is present or
   knowingly accepted as lost.
