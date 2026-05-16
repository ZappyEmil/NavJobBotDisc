import { config, hasNavToken } from '../config.js';
import { postJobsToDiscord } from '../discord/postJobs.js';
import { getRelevantJobCards } from '../scoring/relevanceScoring.js';
import { loadVacancies, markPosted, upsertVacancy } from '../storage/vacancyStore.js';
import {
  fetchFeedEntryByUrl,
  fetchFeedPageByUrl,
  fetchFirstFeedPage,
  fetchNewestFeedPage,
} from './navFeedClient.js';
import type { FeedLine, FeedPage, JobCard, StoredVacancy } from '../types/nav.js';

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

function cutoffDateForBackfill(): Date {
  const days = Number(process.env.BACKFILL_DAYS ?? 60);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function itemLooksRelevant(item: FeedLine): boolean {
  const text = `${item.title} ${item.content_text} ${item._feed_entry.title} ${item._feed_entry.businessName} ${item._feed_entry.municipal}`.toLowerCase();

  const excluded = [
    'sykepleier',
    'helsefagarbeider',
    'lege',
    'tannlege',
    'bioingeniør',
    'barnehage',
    'barnevern',
    'hjemmehjelp',
    'helsehus',
    'sommervikar',
    'ferievikar',
    'lager',
    'logistikk',
    'truckfører',
  ];
  if (excluded.some((term) => text.includes(term))) return false;

  const highValueTerms = [
    'rådgiver',
    'seniorrådgiver',
    'departement',
    'forsvarsdepartementet',
    'utenriksdepartementet',
    'justis- og beredskapsdepartementet',
    'klima- og miljødepartementet',
    'finansdepartementet',
    'kommunal- og distriktsdepartementet',
    'digitaliserings- og forvaltningsdepartementet',
    'direktorat',
    'tilsyn',
    'statsforvalteren',
    'statistisk sentralbyrå',
    'ssb',
    'digdir',
    'dfø',
    'datatilsynet',
    'medietilsynet',
    'forsvarspolitikk',
    'sikkerhetspolitikk',
    'beredskap',
    'politikk',
    'politisk',
    'policy',
    'forvaltning',
    'offentlig administrasjon',
    'storting',
    'regjering',
    'utredning',
    'analyse',
    'analytiker',
    'digitalisering',
    'kunstig intelligens',
    'samfunnsvitenskap',
    'statsvitenskap',
    'strategi',
    'kommunikasjon',
  ];

  return highValueTerms.some((term) => text.includes(term));
}

async function fetchFeedPages(stats: SyncStats): Promise<FeedPage[]> {
  const backfill = isBackfillRun();
  const maxPages = backfill ? config.initialBackfillPages : config.maxFeedPages;
  const useCache = !backfill;
  const pages: FeedPage[] = [];
  const cutoff = cutoffDateForBackfill();

  const firstResult = backfill
    ? await fetchFirstFeedPage({ ifModifiedSince: cutoff.toUTCString() })
    : await fetchNewestFeedPage(useCache);

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

  let nextUrl = firstResult.data.next_url ?? null;
  console.log(
    `First feed page id=${firstResult.data.id}, items=${firstResult.data.items.length}, next_id=${firstResult.data.next_id ?? 'null'}, next_url=${nextUrl ?? 'null'}`
  );

  while (nextUrl && pages.length < maxPages) {
    console.log(`Fetching next feed page: ${nextUrl}`);
    const result = await fetchFeedPageByUrl(nextUrl, useCache);
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
    nextUrl = result.data.next_url ?? null;
  }

  console.log(`Fetched ${pages.length} feed page(s). Backfill=${backfill}. Max pages=${maxPages}.`);
  return pages;
}

function shouldFetchEntry(item: FeedLine, backfill: boolean, cutoff: Date): boolean {
  if (item._feed_entry.status !== 'ACTIVE') return false;
  if (!itemLooksRelevant(item)) return false;
  if (!backfill) return true;
  const changedAt = Date.parse(item.date_modified ?? item._feed_entry.sistEndret);
  if (Number.isNaN(changedAt)) return true;
  return changedAt >= cutoff.getTime();
}

function vacancyForJob(vacancies: StoredVacancy[], job: JobCard): StoredVacancy | undefined {
  return vacancies.find((vacancy) => vacancy.uuid === job.uuid);
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
        const entry = await fetchFeedEntryByUrl(item.url);
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
  const jobsToPost = relevant
    .filter((job) => {
      const vacancy = vacancyForJob(vacancies, job);
      return vacancy && !(vacancy.postedToDiscord && vacancy.lastPostedSistEndret === vacancy.sistEndret);
    })
    .slice(0, config.maxPostsPerRun);

  console.log(`Relevant job cards after filtering: ${relevant.length}. New or changed jobs to post: ${jobsToPost.length}.`);
  if (relevant.length > jobsToPost.length && jobsToPost.length >= config.maxPostsPerRun) {
    console.log(`Post limit reached for this run: ${config.maxPostsPerRun}`);
  }

  if (jobsToPost.length === 0) {
    console.log('No new matching NAV jobs to post to Discord.');
    logStats(stats);
    return stats;
  }

  try {
    const posted = await postJobsToDiscord(jobsToPost);
    for (const job of jobsToPost) {
      const vacancy = vacancyForJob(vacancies, job);
      if (!vacancy) continue;
      await markPosted(job.uuid, vacancy.sistEndret);
    }
    stats.vacanciesPosted += posted;
  } catch (error) {
    stats.errors += 1;
    console.error('Failed to post NAV job digest to Discord:', error);
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
