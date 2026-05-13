import 'dotenv/config';

export const config = {
  navFeedToken: process.env.NAV_FEED_TOKEN?.trim() || '',
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL?.trim() || '',
  navBaseUrl: 'https://pam-stilling-feed.nav.no',
  dataDir: './data',
  vacanciesPath: './data/vacancies.json',
  feedCachePath: './data/feed-cache.json',
  minRelevanceScore: Number(process.env.MIN_RELEVANCE_SCORE ?? 8),
};

export function hasNavToken(): boolean {
  return config.navFeedToken.length > 0;
}

export function requireDiscordWebhook(): string {
  if (!config.discordWebhookUrl) {
    throw new Error('DISCORD_WEBHOOK_URL is missing. Add it to .env or environment variables.');
  }
  return config.discordWebhookUrl;
}
