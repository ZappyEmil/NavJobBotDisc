# NavJobBotDisc

Discord webhook job monitor for the NAV Arbeidsplassen vacancy feed.

## What it does

NavJobBotDisc fetches vacancy changes from NAV Arbeidsplassen, stores the newest version of each vacancy locally, scores jobs by relevance, and posts matching jobs to Discord using a webhook.

This is v1. It uses JSON storage, not SQLite:

- `./data/vacancies.json`
- `./data/feed-cache.json`

The `data` directory is created automatically when needed.

## Important: NAV feed architecture

The NAV Arbeidsplassen API is not a normal search API. It is a feed/change stream.

The app therefore works like this:

1. Fetch newest feed page from NAV.
2. Follow `next_id` across multiple feed pages.
3. Fetch full feed entry details for each feed item.
4. Store or update the latest version locally by vacancy UUID.
5. Filter and score jobs locally.
6. Post new relevant jobs to Discord.

## Normal sync vs backfill

There are two modes:

### Normal sync

Normal sync is for daily operation. It checks a small number of newest feed pages.

Default:

```env
MAX_FEED_PAGES=3
```

### Backfill

Backfill is for first setup or when you want to scan further back in the feed to find existing relevant jobs.

Default:

```env
INITIAL_BACKFILL_PAGES=20
MAX_POSTS_PER_RUN=10
```

Backfill bypasses feed-page cache so it actually walks backward through feed pages.

## GitHub Actions

The workflow is here:

```txt
.github/workflows/nav-sync.yml
```

It runs automatically every day using GitHub cron.

GitHub cron uses UTC. The workflow is currently set to:

```yaml
- cron: "0 6 * * *"
```

That is 08:00 in Norway during summer time. In winter it is 07:00 Norwegian time unless adjusted.

### Manual run

Go to:

```txt
Actions → NAV job sync → Run workflow
```

Options:

- `backfill=false`: normal sync
- `backfill=true`: scan more feed pages
- `max_posts=10`: maximum Discord posts in that run

For first real scan, use:

```txt
backfill=true
max_posts=10
```

If that works and you want more results, run again with a higher `max_posts`, for example `20`.

## Environment setup

Create `.env` from `.env.example` for local runs:

```env
NAV_FEED_TOKEN=
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your/webhook
MIN_RELEVANCE_SCORE=18
MAX_FEED_PAGES=3
INITIAL_BACKFILL_PAGES=20
MAX_POSTS_PER_RUN=10
```

`NAV_FEED_TOKEN` and `DISCORD_WEBHOOK_URL` are secrets. Do not hardcode them. Do not commit `.env`.

For GitHub Actions, add them as repository secrets:

```txt
Settings → Secrets and variables → Actions → New repository secret
```

Required secrets:

```txt
NAV_FEED_TOKEN
DISCORD_WEBHOOK_URL
```

## Discord webhook setup

In Discord:

1. Server Settings
2. Integrations
3. Webhooks
4. New Webhook
5. Copy webhook URL into `.env` locally or GitHub Actions secret in GitHub

## Install locally

```bash
npm install
```

## Run locally

Run scheduler:

```bash
npm run dev
```

Run one normal real sync:

```bash
npm run sync
```

Run local backfill:

```bash
npm run backfill
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

## Duplicate prevention

The app stores:

- vacancy UUID
- latest `sistEndret`
- whether it has been posted to Discord
- latest posted `sistEndret`

It does not repost identical jobs after restart. It only reposts if a vacancy has materially changed through a newer `sistEndret`.

## Local relevance filtering

Relevant keywords include politics, public administration, analysis, digitalisation, AI, policy and advisory work.

The filter now requires at least one strong match. Weak generic terms like `kommunikasjon` are not enough alone.

Clearly wrong occupational matches are excluded, including common healthcare, school, retail and service terms such as:

- sykepleier
- lege
- helsefagarbeider
- barnehage
- lærer
- renholder
- kokk
- sjåfør

Current scoring logic:

- title strong match: high score
- jobtitle strong match: high score
- employer/sector strong match: medium score
- category strong match: medium score
- description strong match: low score
- newer ad bonus: small bonus
- expired/inactive/excluded ads: excluded

## Useful scripts

```bash
npm run dev
npm run sync
npm run backfill
npm run mock
npm run build
npm start
```

## Notes

This app intentionally uses Discord webhooks only. It is not a full Discord bot. No slash commands, no gateway connection, no bot token.
