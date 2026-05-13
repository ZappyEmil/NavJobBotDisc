# NavJobBotDisc

Discord webhook job monitor for NAV Arbeidsplassen vacancy feed.

## What it does

NavJobBotDisc fetches vacancy changes from NAV Arbeidsplassen, stores the newest version of each vacancy locally, scores jobs by relevance, and posts matching jobs to Discord using a webhook.

The first version uses JSON storage, not SQLite:

- `./data/vacancies.json`
- `./data/feed-cache.json`

The `data` directory is created automatically when needed.

## Important: NAV feed architecture

The NAV Arbeidsplassen API is not a normal search API. It is a feed/change stream.

The app therefore works like this:

1. Fetch newest feed page from NAV.
2. Fetch full feed entry details for each feed item.
3. Store or update the latest version locally by vacancy UUID.
4. Filter and score jobs locally.
5. Post new relevant jobs to Discord.

## Environment setup

Create `.env` from `.env.example`:

```env
NAV_FEED_TOKEN=
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your/webhook
```

`NAV_FEED_TOKEN` is a secret. Do not hardcode it. Do not commit `.env`.

If `NAV_FEED_TOKEN` is missing, the app does not crash. Real feed sync is disabled and you can use mock mode.

## Discord webhook setup

In Discord:

1. Server Settings
2. Integrations
3. Webhooks
4. New Webhook
5. Copy webhook URL into `.env`

## Install

```bash
npm install
```

## Run locally

Run scheduler:

```bash
npm run dev
```

Run one real sync:

```bash
npm run sync
```

Test Discord output with mock data:

```bash
npm run mock
```

Build:

```bash
npm run build
```

Run compiled app:

```bash
npm start
```

## Scheduler

The app schedules sync every morning at `08:00 Europe/Oslo`.

## Duplicate prevention

The app stores:

- vacancy UUID
- latest `sistEndret`
- whether it has been posted to Discord
- latest posted `sistEndret`

It does not repost identical jobs after restart. It only reposts if a vacancy has materially changed through a newer `sistEndret`.

## Local relevance filtering

Relevant keywords include politics, public administration, analysis, digitalisation, AI, policy, communication and advisory work.

Scoring weights:

- title match: +10
- jobtitle match: +8
- employer/sector match: +6
- category match: +4
- description match: +3
- newer ad bonus: +1 to +5
- expired/inactive ads: excluded

## Scripts

```bash
npm run dev
npm run sync
npm run mock
npm run build
npm start
```
