import { config, hasNavToken } from '../config.js';
import { postJobToDiscord } from '../discord/postJobs.js';
import { getRelevantJobCards } from '../scoring/relevanceScoring.js';
import { loadVacancies, markPosted, upsertVacancy } from '../storage/vacancyStore.js';
import { fetchFeedEntry, fetchNewestFeedPage } from './navFeedClient.js';

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

export async function syncJobVacancies(): Promise<SyncStats> {
  const stats = emptyStats();

  if (!hasNavToken()) {
    console.log('NAV_FEED_TOKEN missing. Running in mock/demo mode.');
    return stats;
  }

  const feedResult = await fetchNewestFeedPage();
  if (feedResult.status === 304) {
    stats.noChangeResponses += 1;
    logStats(stats);
    return stats;
  }

  if (feedResult.status !== 200 || !feedResult.data) {
    stats.errors += 1;
    logStats(stats);
    return stats;
  }

  stats.feedPagesFetched += 1;

  for (const item of feedResult.data.items) {
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

  const vacancies = Object.values(await loadVacancies());
  const relevant = getRelevantJobCards(vacancies, config.minRelevanceScore);

  for (const job of relevant) {
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
