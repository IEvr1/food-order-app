# Food Order App

Online food ordering for a single shop (takeaway + delivery), with SMS confirmation, Google Maps delivery zones, and an owner dashboard.

## Features

- Customer menu/cart at `/chat` (Greek/English)
- Pickup or delivery with Google Maps pin + delivery radius validation
- SMS order confirmation with manage link (`/l/:code`)
- Order history (last 4) and cancel while status is CONFIRMED
- Owner dashboard: live order queue, KPIs, closures, emergency cancel, shop settings
- Delivery dashboard: driver queue (ready + on the way), separate signed link

## Setup

1. **Create a new PostgreSQL database** (do not reuse `salon_booking`):

```bash
createdb food_order
```

2. Copy environment file and set `DATABASE_URL`:

```bash
copy .env.example .env
```

3. Install and migrate:

```bash
npm install
npx prisma migrate deploy
```

4. Start dev server:

```bash
npm run dev
```

Open [http://localhost:3002/chat](http://localhost:3002/chat).

## Dashboard

Generate a signed dashboard link:

```bash
npm run dashboard:link
```

Open `/dashboard?code=...` then configure delivery in **Settings** (shop location + radius km).

### Delivery dashboard

Generate a signed delivery link for drivers:

```bash
npm run delivery:link
```

Open `/dashboard/delivery?code=...`. Drivers see only today's delivery orders that are **ready for pickup** or **on the way**. Kitchen marks orders as ready on the owner dashboard; drivers mark **on the way** (SMS to customer) and **done**.

| Dashboard | Delivery flow step |
|-----------|-------------------|
| Owner `/dashboard` | PREPARING → **Ready for delivery** (READY) |
| Driver `/dashboard/delivery` | READY → **On the way** → **Done** |

The delivery link cannot access owner pages (settings, KPIs, etc.). The owner dashboard link can preview `/dashboard/delivery`.

## Required env (production)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL (`food_order` or hosted DB) |
| `APP_BASE_URL` | Public URL for this shop — chat, dashboard, **and** SMS manage links (`/l/:code`) |
| `SMS_LINK_SECRET` | Signs customer manage links |
| `DASHBOARD_LINK_SECRET` | Signs owner dashboard and delivery links |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps + Places for delivery |

SMS via Twilio and/or `SMS_GATEWAY_URL` + `SMS_GATEWAY_API_KEY`.

**One domain per restaurant:** set only `APP_BASE_URL` (e.g. `https://souvlaki.nexaipla.com`). SMS links look like `https://souvlaki.nexaipla.com/l/Ab12Cd34` — no separate orders subdomain.

## Pages

- `/` → `/chat`
- `/chat` — customer ordering
- `/dashboard` — owner (signed link)
- `/dashboard/delivery` — driver queue (separate signed link)
- `/dashboard/settings` — shop location & delivery radius
- `/l/:code` — SMS short link

## Deployment model

**Ένα εστιατόριο = ένα Vercel project + μία PostgreSQL βάση.**

The app is single-tenant in code (`shop.findFirst()`). To onboard another restaurant, deploy again — same Git repo, isolated resources. Do **not** share `DATABASE_URL` or secrets between shops.

| Per restaurant | |
|----------------|--|
| Vercel project | Link same repo, separate env |
| `DATABASE_URL` | Dedicated Postgres (e.g. Neon) |
| Secrets | Own `SMS_LINK_SECRET`, `DASHBOARD_LINK_SECRET`, Twilio, Maps key |
| `APP_BASE_URL` | One subdomain for everything, e.g. `https://souvlaki.nexaipla.com` (chat + SMS links) |

**Quick onboarding:** new DB → new Vercel project → env vars → `prisma migrate deploy` → DNS → `npm run dashboard:link` → configure shop in Settings.

Multi-tenant single deployment (`/{slug}/chat`) is **not** planned for MVP. See [`DECISIONS.md`](DECISIONS.md) ADR-006 for full checklist and rationale.

## Notes

- Cyprus phones: 8 digits without `+357`
- Payment: cash on pickup / on delivery (no online payment in MVP)
- Seed shop **Souvlaki House** is created on first API call
