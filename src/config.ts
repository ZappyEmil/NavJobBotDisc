import 'dotenv/config';

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const value = Number(raw);
  if (Number.isFinite(value) && value >= 0) return value;

  console.warn(`${name} must be a non-negative number. Using default ${fallback}.`);
  return fallback;
}

function isDiscordWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['discord.com', 'discordapp.com'].includes(url.hostname) &&
      url.pathname.startsWith('/api/webhooks/')
    );
  } catch {
    return false;
  }
}

export const config = {
  navFeedToken: process.env.NAV_FEED_TOKEN?.trim() || '',
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL?.trim() || '',
  navBaseUrl: 'https://pam-stilling-feed.nav.no',
  dataDir: './data',
  vacanciesPath: './data/vacancies.json',
  feedCachePath: './data/feed-cache.json',
  minRelevanceScore: numberFromEnv('MIN_RELEVANCE_SCORE', 18),
  maxFeedPages: numberFromEnv('MAX_FEED_PAGES', 3),
  initialBackfillPages: numberFromEnv('INITIAL_BACKFILL_PAGES', 20),
  maxPostsPerRun: numberFromEnv('MAX_POSTS_PER_RUN', 10),
};

export function hasNavToken(): boolean {
  return config.navFeedToken.length > 0;
}

export function requireDiscordWebhook(): string {
  if (!config.discordWebhookUrl) {
    throw new Error('DISCORD_WEBHOOK_URL is missing. Add it to .env or environment variables.');
  }

  if (!isDiscordWebhookUrl(config.discordWebhookUrl)) {
    throw new Error('DISCORD_WEBHOOK_URL must be a Discord webhook URL starting with https://discord.com/api/webhooks/.');
  }

  return config.discordWebhookUrl;
}
