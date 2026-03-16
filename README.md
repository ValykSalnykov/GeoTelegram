<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# GeoTelegram

Real-time geolocation intelligence tool for public Telegram channels.

Monitors Telegram channels for location mentions, extracts addresses with AI (OpenAI), geocodes them, and displays them on an interactive map. Built with **Next.js 15**, deployed on **Vercel**, with optional persistence via **Supabase**.

---

## Features

- Scrape messages from any public Telegram channel
- Extract street addresses and locations using OpenAI GPT-4o-mini
- Geocode with Google Maps API (batch) or Nominatim/OSM (free fallback)
- Visualise results on an interactive Leaflet map
- Detect locations near the Raduzhny zone (within 10 km)
- Manual message input for testing
- Persist today's processed tasks to Supabase (optional)
- Real-time sync across browser tabs via Supabase Realtime

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/ValykSalnykov/GeoTelegram
cd GeoTelegram
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | ✅ | Server-side OpenAI key for address extraction |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | ✖ | Enables fast batch geocoding; falls back to Nominatim |
| `NEXT_PUBLIC_SUPABASE_URL` | ✖ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✖ | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✖ | Elevated server access (defaults to anon key) |

### 3. Set up Supabase (optional but recommended)

1. Create a free project at [supabase.com](https://supabase.com)
2. Open the **SQL Editor** and run `supabase/migrations/001_init.sql`
3. Copy your Project URL and Anon Key into `.env.local`

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ValykSalnykov/GeoTelegram)

1. Push the repository to GitHub
2. Import it in [Vercel](https://vercel.com)
3. Add the environment variables in **Project → Settings → Environment Variables**
4. Deploy

> **Tip:** When connecting Vercel to Supabase via the Vercel Integration, the integration automatically injects `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## Project Structure

```
app/
  layout.tsx                    # Root HTML layout
  page.tsx                      # Home page (server component)
  globals.css                   # Tailwind v4 import
  api/
    health/route.ts             # GET /api/health
    locations/route.ts          # GET|POST /api/locations  (Supabase)
    extract_locations/route.ts  # POST /api/extract_locations  (OpenAI)
    poll_channel/route.ts       # GET /api/poll_channel  (Telegram scraper)

components/
  ClientWrapper.tsx             # 'use client' wrapper for SSR-safe dynamic import
  GeoTelegramApp.tsx            # Main application shell
  MapView.tsx                   # Leaflet map (client-only)

lib/
  supabase.ts                   # Supabase client helpers
  types.ts                      # Shared TypeScript types

utils/
  streets.ts                    # Odesa street name list

supabase/
  migrations/001_init.sql       # Supabase schema
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19, Tailwind CSS v4 |
| Map | Leaflet + react-leaflet |
| AI | OpenAI GPT-4o-mini (Responses API) |
| Geocoding | Google Maps Geocoding API / Nominatim |
| Scraping | Cheerio (Telegram web preview) |
| Database | Supabase (PostgreSQL + Realtime) |
| Hosting | Vercel |
