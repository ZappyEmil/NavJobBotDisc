# NavJobBotDisc

Discord webhook job monitor for the NAV Arbeidsplassen vacancy feed.

## What it does

NavJobBotDisc fetches vacancy changes from NAV Arbeidsplassen, stores the newest version of each vacancy locally, scores jobs by relevance, and posts matching jobs to Discord using a webhook.

This is v1. It uses JSON storage, not SQLite:

- `./data/vacancies.json`
- `./data/feed-cache.json`

The `data` directory is created automatically when needed.

## Project layout

```txt
src/index.ts                    Daily local scheduler
src/config.ts                   Environment/config parsing
src/nav/syncJobVacancies.ts     Main sync/backfill job
src/nav/navFeedClient.ts        NAV feed HTTP client
src/discord/postJobs.ts         Discord webhook posting
src/scoring/relevanceScoring.ts Local relevance scoring
src/storage/vacancyStore.ts     JSON file storage
src/mock/mockVacancies.ts       Mock Discord output
.github/workflows/nav-sync.yml  Scheduled GitHub Actions run
```

## Environment setup

Create `.env` from `.env.example` for local runs. Real tokens and webhook URLs are secrets. Do not hardcode them and do not commit `.env`.

```env
NAV_FEED_TOKEN=
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook_id/your_webhook_token
MIN_RELEVANCE_SCORE=18
MAX_FEED_PAGES=3
INITIAL_BACKFILL_PAGES=20
BACKFILL_DAYS=60
MAX_POSTS_PER_RUN=10
```

Required GitHub Actions secrets:

```txt
NAV_FEED_TOKEN
DISCORD_WEBHOOK_URL
```

Add them in GitHub under `Settings -> Secrets and variables -> Actions -> New repository secret`.

## Windows PowerShell setup

Run these commands from the repository folder:

```powershell
node --version
npm --version
Copy-Item .env.example .env
notepad .env
npm install
npm run build
npm run mock
npm run sync
```

For the first real scan, use backfill:

```powershell
npm run backfill
```

`npm run backfill` is cross-platform and works in Windows PowerShell because it passes `--backfill` to the TypeScript script instead of using shell-specific environment variable syntax.

## Discord webhook setup

In Discord:

1. Open Server Settings.
2. Open Integrations.
3. Open Webhooks.
4. Create a webhook for the target channel.
5. Copy the webhook URL into `.env` locally or into the `DISCORD_WEBHOOK_URL` GitHub Actions secret.

## Webhook output

The bot sends grouped Discord embeds instead of one message per vacancy. This avoids channel spam while preserving each job's title, source, timestamp, category, employer, deadline, match terms, and link.

Example digest:

```txt
Title: NAV job alerts - 3 new matches
Description: Relevant NAV Arbeidsplassen vacancies grouped into a compact digest to avoid channel spam.

Field: Politisk rådgiver - Oslo kommune
Kilde: NAV Arbeidsplassen
Kategori: Politikk/policy
Arbeidsgiver: Oslo kommune
Sted: Oslo
Frist: 2026-06-01
Oppdatert: 2026-05-16T08:15:00Z
Match: politikk, rådgiver, offentlig sektor
Lenke: Åpne stilling
Kort: Kort utdrag fra stillingsannonsen...
```

Output safety:

- Discord webhook URLs are validated but never logged.
- 429 and 5xx responses are retried with backoff.
- Failed responses log status plus a short response body.
- Embeds and fields are truncated below Discord limits.
- Large result sets are split across multiple digest messages.
- If no new matching jobs are found, the run logs that result and sends no job alert.

## Useful scripts

```bash
npm run dev       # Start the local 08:00 Europe/Oslo scheduler
npm run sync      # Run one normal sync
npm run backfill  # Run a backfill scan
npm run mock      # Test Discord output with mock data
npm run check     # Type-check without writing dist
npm run build     # Compile TypeScript to dist
npm start         # Run the compiled scheduler
```

## NAV feed architecture

The NAV Arbeidsplassen API is a continuous feed/change stream, not a normal search API.

```txt
GET /api/v1/feed             = first feed page for historical/backfill
GET /api/v1/feed?last=true   = newest feed page for polling
GET /api/v1/feed/{feedPageId}= specific feed page
GET /api/v1/feedentry/{id}   = details for one feed entry
```

The app fetches feed pages, follows `next_url`, fetches relevant feed entry details, stores or updates each vacancy by UUID, hides inactive/expired vacancies, scores jobs locally, and posts new relevant jobs to Discord.

## GitHub Actions

The workflow is `.github/workflows/nav-sync.yml`. It runs daily at `0 6 * * *` UTC and can also be started manually from `Actions -> NAV job sync -> Run workflow`.

Manual options:

- `backfill=false`: normal sync
- `backfill=true`: scan from `/api/v1/feed` using `If-Modified-Since`
- `max_posts=10`: maximum Discord posts in that run

## Duplicate prevention

The app stores vacancy UUID, latest `sistEndret`, whether the job has been posted, and the latest posted `sistEndret`. It does not repost identical jobs after restart. It only reposts if a vacancy materially changes through a newer `sistEndret`.

## Notes

This app intentionally uses Discord webhooks only. It is not a full Discord bot: no slash commands, no gateway connection, and no bot token.
