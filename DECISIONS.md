# Architecture decisions

Log of significant product and infrastructure choices for this project.

---

## ADR-001: Domain layout (Nexaipla)

**Status:** Accepted  
**Date:** 2026-06-12

### Context

- `nexaipla.com` is the Nexaipla brand domain (email on Cloudflare/Zoho; apex reserved for a future company homepage).
- This salon booking app should not occupy the apex domain.
- We may onboard a handful of independent salon customers over time.

### Decisions

1. **Apex domain (`nexaipla.com`, `www`)** — Reserved for a future Nexaipla portfolio/marketing site. Not attached to this booking app. Portfolio build is deferred.

2. **First booking customer (now)** — Served from **`book.nexaipla.com`** on the existing `salon-booking` Vercel project. Production `APP_BASE_URL` = `https://book.nexaipla.com`.

3. **Additional salon customers (future, handful)** — **Separate Vercel deployment per customer**, same codebase, no multi-tenant refactor. Each customer gets:
   - Own Vercel project (link same Git repo)
   - Own database (`DATABASE_URL`)
   - Own env secrets and `APP_BASE_URL`
   - Own subdomain: **`{customer-slug}.nexaipla.com`** (e.g. `glow-beauty.nexaipla.com`, `studio-x.nexaipla.com`)

4. **When customer #2 arrives** — Either:
   - **Option A:** Keep customer 1 on `book.nexaipla.com`; add customer 2 on `{slug}.nexaipla.com`, or
   - **Option B:** Move customer 1 to `glow-beauty.nexaipla.com` for consistent `{slug}.nexaipla.com` naming for all salon customers.

   Both are DNS + Vercel domain changes only; no app code changes.

5. **Multi-tenant single app (`book.nexaipla.com/{slug}/chat`)** — **Deferred.** Revisit only if we scale to many salons or need a central NexAIPla booking platform with one login to manage all tenants. That path requires `Salon.slug`, path-based routing, and replacing `findFirst()` lookups throughout the app.

6. **Other Nexaipla products** — Unrelated apps (e.g. kids bonus, traffic dashboard) use their own subdomains (`kids.nexaipla.com`, etc.), not this repo.

### Rationale

- The app is **single-tenant in code** today (`prisma.salon.findFirst()` everywhere) despite a multi-`salonId` schema.
- Separate deployments per customer = **fastest path, least code change**, full data/SMS/dashboard isolation.
- Path-based multi-tenancy is unnecessary overhead for a handful of independent customers.

### Consequences

- Onboarding a new salon is primarily **ops** (~30–60 min): Neon DB, Vercel project, env vars, Cloudflare DNS.
- SMS links, dashboard links, and cron run per deployment; no cross-customer admin UI in this app.
- Immediate cutover work: add `book.nexaipla.com`, update `APP_BASE_URL`, remove apex domains from `salon-booking`.

### Related files

- [`src/lib/sms-link-base.ts`](src/lib/sms-link-base.ts) — `APP_BASE_URL` for SMS/deep links
- [`src/app/page.tsx`](src/app/page.tsx) — `/` redirects to `/chat`
- [`.env.example`](.env.example) — `APP_BASE_URL`, `CLOUDFLARE_API_TOKEN`
