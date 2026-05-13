import { config, hasNavToken } from '../config.js';
import { postJobToDiscord } from '../discord/postJobs.js';
import { getRelevantJobCards } from '../scoring/relevanceScoring.js';
import { loadVacancies, markPosted, upsertVacancy } from '../storage/vacancyStore.js';
import { fetchFeedEntry, fetchFeedPage, fetchNewestFeedPage } from './navFeedClient.js';
import type { FeedLine, FeedPage } from '../types/nav.js';

export type SyncStats = {
  feedPagesFetched: number;
  feedEntriesFetched: number;
  vacanciesInserted: number;
  vacanciesUpdated: number;
  vacanciesSkipped: number;
  vacanciesHidden: number;
  vacanciesPosted: number;
  noChangeResponses: number;
  errors: number;
};

function emptyStats(): SyncStats {
  return {
    feedPagesFetched: 0,
    feedEntriesFetched: 0,
    vacanciesInserted: 0,
    vacanciesUpdated: 0,
    vacanciesSkipped: 0,
    vacanciesHidden: 0,
    vacanciesPosted: 0,
    noChangeResponses: 0,
    errors: 0,
  };
}

function logStats(stats: SyncStats): void {
  console.log('Sync complete:', JSON.stringify(stats, null, 2));
}

function isBackfillRun(): boolean {
  return process.argv.includes('--backfill') || process.env.BACKFILL === 'true';
}

function extractPageIdFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/api\/v1\/feed\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getNextPageId(page: FeedPage): string | null {
  return page.next_id ?? extractPageIdFromUrl(page.next_url) ?? null;
}

function cutoffDateForBackfill(): Date {
  const days = Number(process.env.BACKFILL_DAYS ?? 180);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function fetchFeedPages(stats: SyncStats): Promise<FeedPage[]> {
  const backfill = isBackfillRun();
  const maxPages = backfill ? config.initialBackfillPages : config.maxFeedPages;
  const useCache = !backfill;
  const pages: FeedPage[] = [];

  // NAV docs: /api/v1/feed returns the first page. /api/v1/feed?last=true returns the newest/end page.
  // Backfill must start from the first page and follow next_url/next_id forward until cutoff/page limit.
  const firstResult = backfill ? await fetchFeedPage('', false) : await fetchNewestFeedPage(useCache);
  if (firstResult.status === 304) {
    stats.noChangeResponses += 1;
    return pages;
  }
  if (firstResult.status !== 200 || !firstResult.data) {
    stats.errors += 1;
    return pages;
  }

  pages.push(firstResult.data);
  stats.feedPagesFetched += 1;

  let nextId = getNextPageId(firstResult.data);
  console.log(`First feed page id=${firstResult.data.id}, items=${firstResult.data.items.length}, next_id=${firstResult.data.next_id ?? 'null'}, next_url=${firstResult.data.next_url ?? 'null'}`);

  while (nextId && pages.length < maxPages) {
    console.log(`Fetching next feed page: ${nextId}`);
    const result = await fetchFeedPage(nextId, useCache);
    if (result.status === 304) {
      stats.noChangeResponses += 1;
      break;
    }
    if (result.status !== 200 || !result.data) {
      stats.errors += 1;
      break;
    }
    pages.push(result.data);
    stats.feedPagesFetched += 1;
    nextId = getNextPageId(result.data);
  }

  console.log(`Fetched ${pages.length} feed page(s). Backfill=${backfill}. Max pages=${maxPages}.`);
  return pages;
}

function shouldFetchEntry(item: FeedLine, backfill: boolean, cutoff: Date): boolean {
  if (item._feed_entry.status !== 'ACTIVE') return false;
  if (!backfill) return true;
  const changedAt = Date.parse(item.date_modified ?? item._feed_entry.sistEndret);
  if (Number.isNaN(changedAt)) return true;
  return changedAt >= cutoff.getTime();
}

export async function syncJobVacancies(): Promise<SyncStats> {
  const stats = emptyStats();

  if (!hasNavToken()) {
    console.log('NAV_FEED_TOKEN missing. Running in mock/demo mode.');
    return stats;
  }

  const backfill = isBackfillRun();
  const cutoff = cutoffDateForBackfill();
  if (backfill) console.log(`Backfill cutoff: ${cutoff.toISOString()}`);

  const pages = await fetchFeedPages(stats);
  if (pages.length === 0) {
    logStats(stats);
    return stats;
  }

  const seenEntryIds = new Set<string>();
  for (const page of pages) {
    for (const item of page.items) {
      if (seenEntryIds.has(item.id)) continue;
      seenEntryIds.add(item.id);
      if (!shouldFetchEntry(item, backfill, cutoff)) {
        stats.vacanciesSkipped += 1;
        continue;
      }
      try {
        const entry = await fetchFeedEntry(item.id);
        if (!entry) {
          stats.vacanciesSkipped += 1;
          continue;
        }
        stats.feedEntriesFetched += 1;
        const result = await upsertVacancy(entry);
        if (result === 'inserted') stats.vacanciesInserted += 1;
        if (result === 'updated') stats.vacanciesUpdated += 1;
        if (result === 'skipped') stats.vacanciesSkipped += 1;
        if (result === 'hidden') stats.vacanciesHidden += 1;
      } catch (error) {
        stats.errors += 1;
        console.error('Failed to process feed item:', item.id, error);
      }
    }
  }

  const vacancies = Object.values(await loadVacancies());
  const relevant = getRelevantJobCards(vacancies, config.minRelevanceScore);
  console.log(`Relevant job cards after filtering: ${relevant.length}`);

  for (const job of relevant) {
    if (stats.vacanciesPosted >= config.maxPostsPerRun) {
      console.log(`Post limit reached for this run: ${config.maxPostsPerRun}`);
      break;
    }

    const vacancy = vacancies.find((v) => v.uuid === job.uuid);
    if (!vacancy) continue;
    if (vacancy.postedToDiscord && vacancy.lastPostedSistEndret === vacancy.sistEndret) continue;

    try {
      await postJobToDiscord(job);
      await markPosted(job.uuid, vacancy.sistEndret);
      stats.vacanciesPosted += 1;
    } catch (error) {
      stats.errors += 1;
      console.error('Failed to post vacancy to Discord:', job.uuid, error);
    }
  }

  logStats(stats);
  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncJobVacancies().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
