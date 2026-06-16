# Architecture decisions

Log of product, security, and infrastructure choices for **Food Order App** — single-shop online ordering (pickup + delivery) with SMS manage links and an owner dashboard.

Use this file to record what we decided, what we fixed, and what to do next.

---

## ADR-001: Single-shop MVP (no multi-tenancy)

**Status:** Accepted  
**Date:** 2026-06

### Context

The app serves one restaurant per deployment. The schema includes `shopId` on all major models, but routing and queries use `prisma.shop.findFirst()` everywhere.

### Decision

Keep **single-tenant-in-code** for MVP. One shop per database, one Vercel project, one set of secrets.

### Rationale

- Fastest path to production for the first customer.
- Full data isolation without RLS or tenant routing complexity.
- SMS links, dashboard links, and cron jobs are naturally scoped to one shop.

### Consequences

- Onboarding a second restaurant = **new deployment** (Neon DB, Vercel project, env vars, subdomain) — ops work, not a code refactor.
- Path-based multi-tenancy (`/{slug}/chat`) is **deferred** until there is a clear need for many shops on one platform.

### Related files

- [`prisma/schema.prisma`](prisma/schema.prisma)
- [`src/lib/bootstrap.ts`](src/lib/bootstrap.ts) — seed shop on first API call

---

## ADR-002: Capability-based auth (no user accounts)

**Status:** Accepted  
**Date:** 2026-06

### Context

Neither customers nor owners log in with passwords. Access is granted by possession of signed links and HTTP-only cookies.

### Decision

| Actor | Mechanism |
|-------|-----------|
| **Customer** | SMS link (`/l/:code` or `/r/:token`) → `shop_manage_session` cookie (JWT, 30 min default) |
| **Owner** | Signed dashboard link → `dashboard_access` cookie (HMAC-SHA256) |

No `User` model, no RBAC, no OAuth.

### Rationale

- Matches the SMS-first ordering flow.
- Minimal friction for customers (no account creation).
- Owner access is revocable by rotating `DASHBOARD_LINK_SECRET`.

### Consequences

- **All dashboard server actions must verify the cookie** — page access via `src/proxy.ts` is not enough; actions are callable directly.
- Permanent dashboard links (no `exp`) grant long-lived access; prefer expiring links for production.
- Short codes (`/l/:code`, 8 chars) rely on entropy + expiry; rate limiting on redemption is recommended (see ADR-007).

### Related files

- [`src/lib/dashboard-auth.ts`](src/lib/dashboard-auth.ts)
- [`src/lib/manage-session.ts`](src/lib/manage-session.ts)
- [`src/lib/deep-link-token.ts`](src/lib/deep-link-token.ts)
- [`src/proxy.ts`](src/proxy.ts)

---

## ADR-003: Customer data segregation in manage APIs

**Status:** Accepted  
**Date:** 2026-06

### Decision

Every customer manage endpoint scopes by **both** `session.shopId` and `session.phoneE164`. Cross-customer access returns **403**.

Applies to: `/api/orders/manage/summary`, `cancel`, `modify`, `focus`.

### Rationale

Session cookie binds to one phone number. Order lookups must confirm the order’s customer matches that phone.

### Verification

Covered by `scripts/security-audit.mjs` — integration test creates an order, establishes session, confirms summary is scoped, and rejects focus on a foreign order ID.

---

## ADR-004: PII handling and retention

**Status:** Accepted (policy); **Partial** (automation)

### Decision

| Data | Storage | Retention |
|------|---------|-----------|
| Name, phone, address, GPS coords | Plain text in PostgreSQL | Up to 12 months after last order (privacy policy) |
| SMS manage tokens | SHA-256 hash in DB; raw token never stored | Token TTL (30 min – 7 days) |
| Dashboard / manage cookies | Signed values; httpOnly, sameSite=lax | Session / link TTL |

Retention logic lives in [`src/lib/retention-cleanup.ts`](src/lib/retention-cleanup.ts) (`DATA_RETENTION_DAYS`, default 365).

### Gap

`runRetentionCleanup()` is **not scheduled**. GDPR retention claim in [`src/app/privacy/page.tsx`](src/app/privacy/page.tsx) is not enforced automatically.

### Next step → see [NS-001](#ns-001-schedule-data-retention-cleanup)

---

## ADR-005: Security audit fixes (2026-06-14)

**Status:** Accepted / Implemented

### Context

Automated security audit (`npm run security:audit`) — 31 checks covering auth, segregation, input validation, PII exposure, and integration flow.

### Finding (critical, fixed)

Dashboard server actions in [`src/app/dashboard/order-actions.ts`](src/app/dashboard/order-actions.ts) had **no auth check**, while [`actions.ts`](src/app/dashboard/actions.ts) and [`emergency-actions.ts`](src/app/dashboard/emergency-actions.ts) did.

Anyone could invoke `updateOrderStatusFromDashboard`, `updateShopDeliverySettings`, or `validateShopDeliveryZone` without a valid `dashboard_access` cookie.

### Fix

Added `requireDashboardAuth()` (uses `isDashboardMutationAuthorized`) to all three actions.

### Audit result

**31/31 checks pass** when dev server is running on port 3002.

### Related files

- [`scripts/security-audit.mjs`](scripts/security-audit.mjs)
- [`package.json`](package.json) — `"security:audit"` script

---

## ADR-006: Deployment model — ξεχωριστό Vercel project + DB ανά εστιατόριο

**Status:** Accepted  
**Date:** 2026-06-14

### Context

The codebase is **single-tenant**: `prisma.shop.findFirst()` everywhere, one shop seeded per database. When we onboard more than one restaurant, we need isolation without a multi-tenant refactor.

### Decision

**Ένα deployment ανά εστιατόριο** — ίδιο Git repo, ξεχωριστά resources:

| Resource | Ανά εστιατόριο |
|----------|----------------|
| **Vercel project** | Ένα (link στο ίδιο repo) |
| **PostgreSQL** | Ξεχωριστή βάση (`DATABASE_URL`) |
| **Secrets** | Ξεχωριστά: `SMS_LINK_SECRET`, `DASHBOARD_LINK_SECRET`, Twilio, Maps key |
| **Public URL** | Ένα subdomain ανά shop — `APP_BASE_URL` για chat, dashboard και SMS links (`/l/:code`) |
| **Shop data** | Seed / ρυθμίσεις μόνο σε αυτή τη βάση |

Δεν μοιράζουμε βάση ή Vercel project μεταξύ εστιατορίων. SMS links, dashboard links, cron και PII μένουν πλήρως απομονωμένα.

### Rationale

- Ταχύτερο onboarding — χωρίς αλλαγές κώδικα (RLS, tenant routing, `/{slug}/chat`).
- Πλήρης data isolation: παραγγελίες, πελάτες, tokens, ρυθμίσεις delivery.
- Ανεξάρτητα secrets και SMS — fault σε ένα shop δεν επηρεάζει άλλο.
- Ταιριάζει με ADR-001 (single-shop MVP).

### What we do **not** do (deferred)

- **Multi-tenant single app** — ένα deployment, πολλά shops, path-based routing (`/{slug}/chat`). Μόνο αν χρειαστεί κεντρική πλατφόρμα με πολλούς tenants και shared admin.

### Onboarding checklist (νέο εστιατόριο)

1. Δημιουργία Postgres DB (π.χ. Neon) — **νέα βάση, όχι reuse**
2. Νέο Vercel project → link ίδιο Git repo
3. Env vars (βλ. README) — **νέα secrets**, `APP_BASE_URL` = production URL του shop (chat + SMS links, ένα domain)
4. `prisma migrate deploy` στη νέα βάση
5. `npm run dashboard:link` — link ιδιοκτήτη για αυτό το deployment
6. DNS subdomain → Vercel domain
7. Google Maps API key — restrict σε domain αυτού του deployment
8. Ρύθμιση shop name / menu / delivery στο dashboard Settings

**Εκτιμώμενος χρόνος:** ~30–60 λεπτά ops ανά εστιατόριο, χωρίς αλλαγές κώδικα.

### Related files

- [`README.md`](README.md) — Notes / Deployment
- [`src/lib/sms-link-base.ts`](src/lib/sms-link-base.ts) — `APP_BASE_URL`
- [`DECISIONS.md`](DECISIONS.md) — ADR-001

---

# Next steps and suggestions

Prioritized backlog from security review and operational gaps. Status: **Open** until implemented.

---

### NS-001: Schedule data retention cleanup

**Priority:** High  
**Effort:** Small  
**Status:** Open

Wire [`runRetentionCleanup()`](src/lib/retention-cleanup.ts) to a scheduled job.

**Options:**

1. **Vercel Cron** — daily route e.g. `GET /api/cron/retention` protected by `CRON_SECRET` header
2. **External scheduler** — GitHub Actions, Neon cron, etc.

**Acceptance criteria:**

- Expired SMS tokens and conversation sessions deleted daily
- Eligible customers (no active orders, last order &gt; retention window) deleted in batches
- Log summary (counts deleted) for ops visibility

---

### NS-002: Add rate limiting

**Priority:** High  
**Effort:** Medium  
**Status:** Open

No rate limits today on high-abuse surfaces:

| Surface | Risk |
|---------|------|
| `POST /api/orders` | Spam orders, SMS cost |
| `GET /l/[code]`, `GET /r/[token]` | Short-code brute force |
| Dashboard link redemption | Token guessing |

**Suggested approach:**

- Vercel Firewall / WAF rules, or
- Upstash Redis sliding window per IP + per phone on order creation

**Acceptance criteria:**

- Order creation capped (e.g. 5/hour per IP, 3/hour per phone)
- Link redemption capped (e.g. 20/min per IP)
- 429 response with retry hint

---

### NS-003: Dashboard links with expiry by default

**Priority:** Medium  
**Effort:** Small  
**Status:** Open

`createDashboardAccessCode()` supports permanent links (no `exp`). Production should default to **90-day TTL** unless `--permanent` is explicitly passed in `scripts/create-dashboard-link.mjs`.

**Acceptance criteria:**

- `npm run dashboard:link` prints expiry date
- Document rotation procedure in README

---

### NS-004: Add `.env.example`

**Priority:** Medium  
**Effort:** Small  
**Status:** Open

README references `.env.example` but the file is missing from the repo.

**Include:**

- All required and optional vars with comments
- No real secrets
- Dev vs production notes (`SMS_LINK_SECRET`, `DASHBOARD_LINK_SECRET` required in prod)

---

### NS-005: Expand automated test coverage

**Priority:** Medium  
**Effort:** Medium  
**Status:** Open

`npm run security:audit` covers auth, validation, and one integration path. Gaps:

| Area | Suggestion |
|------|------------|
| Server actions | Test dashboard mutations reject without cookie (Playwright or action-level tests) |
| Delivery zone | Unit tests for `validateDeliveryLocation` edge cases |
| Order lifecycle | E2E: order → manage → cancel → status transitions |
| CI | Run `security:audit` in GitHub Actions against preview deploy |

---

### NS-006: Harden short-link redemption

**Priority:** Medium  
**Effort:** Small–Medium  
**Status:** Open

Short codes are 8 alphanumeric chars (~218 trillion space) but `/l/[code]` has no rate limit and invalid codes silently redirect to `/chat`.

**Suggestions:**

- Log failed redemption attempts (without leaking valid codes)
- Optional: increase code length to 10+ for new tokens
- Combine with NS-002 rate limiting

---

### NS-007: Google Maps API key restrictions

**Priority:** Medium  
**Effort:** Small (GCP console)  
**Status:** Open

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is client-exposed by design.

**Action:** In Google Cloud Console, restrict key to:

- HTTP referrers: production + preview domains only
- APIs: Maps JavaScript API, Places API (only what the app uses)

---

### NS-008: Field-level encryption (optional, deferred)

**Priority:** Low  
**Status:** Deferred

PII (name, phone, address, coordinates) is stored in plain text. Acceptable for MVP with access-controlled DB and single-tenant deployments.

**Revisit if:** multi-tenant platform, shared DB, or regulatory requirement beyond current privacy policy.

---

### NS-009: Self-service data erasure

**Priority:** Low  
**Status:** Deferred

Privacy policy directs users to contact the shop for deletion. No API for customer-initiated erasure.

**Future option:** authenticated manage session could expose “delete my data” that anonymizes or removes customer record when no active orders.

---

### NS-010: Rename legacy “salon” helpers

**Priority:** Low  
**Effort:** Small  
**Status:** Open

Timezone utilities still use `salonLocal*` naming from a prior codebase (`salonLocalDayBoundsUtc`, etc.). Rename to `shopLocal*` for clarity — cosmetic, no behaviour change.

---

## Quick reference: run security audit

```bash
npm run dev              # port 3002
npm run security:audit   # 31 automated checks
npm run dashboard:link   # generate owner link
```

---

## Decision log

| ID | Title | Status |
|----|-------|--------|
| ADR-001 | Single-shop MVP | Accepted |
| ADR-002 | Capability-based auth | Accepted |
| ADR-003 | Customer data segregation | Accepted |
| ADR-004 | PII handling and retention | Accepted / automation pending |
| ADR-005 | Security audit fixes (2026-06-14) | Implemented |
| ADR-006 | Deployment model — Vercel + DB ανά εστιατόριο | Accepted |
| NS-001 | Schedule retention cleanup | Open |
| NS-002 | Rate limiting | Open |
| NS-003 | Dashboard link expiry default | Open |
| NS-004 | `.env.example` | Open |
| NS-005 | Expanded test coverage | Open |
| NS-006 | Short-link hardening | Open |
| NS-007 | Maps API key restrictions | Open |
| NS-008 | Field-level encryption | Deferred |
| NS-009 | Self-service erasure | Deferred |
| NS-010 | Rename salon → shop helpers | Open |
