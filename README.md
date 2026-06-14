# Food Order App

Online food ordering for a single shop (takeaway + delivery), with SMS confirmation, Google Maps delivery zones, and an owner dashboard.

## Features

- Customer menu/cart at `/chat` (Greek/English)
- Pickup or delivery with Google Maps pin + delivery radius validation
- SMS order confirmation with manage link (`/l/:code`)
- Order history (last 4) and cancel while status is CONFIRMED
- Owner dashboard: live order queue, KPIs, closures, emergency cancel, shop settings

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

## Required env (production)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL (`food_order` or hosted DB) |
| `APP_BASE_URL` | Public URL for SMS links |
| `SMS_LINK_SECRET` | Signs customer manage links |
| `DASHBOARD_LINK_SECRET` | Signs owner dashboard links |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps + Places for delivery |

SMS via Twilio and/or `SMS_GATEWAY_URL` + `SMS_GATEWAY_API_KEY`.

## Pages

- `/` → `/chat`
- `/chat` — customer ordering
- `/dashboard` — owner (signed link)
- `/dashboard/settings` — shop location & delivery radius
- `/l/:code` — SMS short link

## Notes

- Cyprus phones: 8 digits without `+357`
- Payment: cash on pickup / on delivery (no online payment in MVP)
- Seed shop **Souvlaki House** is created on first API call
