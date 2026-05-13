import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.js';
import type { FeedCache, FeedCacheEntry, FeedEntryContent, StoredVacancy } from '../types/nav.js';

type VacancyDatabase = Record<string, StoredVacancy>;

async function ensureDataDir(): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function loadVacancies(): Promise<VacancyDatabase> {
  await ensureDataDir();
  return readJsonFile<VacancyDatabase>(config.vacanciesPath, {});
}

export async function saveVacancies(vacancies: VacancyDatabase): Promise<void> {
  await writeJsonFile(config.vacanciesPath, vacancies);
}

export async function loadFeedCache(): Promise<FeedCache> {
  await ensureDataDir();
  return readJsonFile<FeedCache>(config.feedCachePath, {});
}

export async function saveFeedCache(cache: FeedCache): Promise<void> {
  await writeJsonFile(config.feedCachePath, cache);
}

export async function getFeedCacheEntry(key: string): Promise<FeedCacheEntry | undefined> {
  const cache = await loadFeedCache();
  return cache[key];
}

export async function setFeedCacheEntry(key: string, entry: FeedCacheEntry): Promise<void> {
  const cache = await loadFeedCache();
  cache[key] = entry;
  await saveFeedCache(cache);
}

function isInactiveStatus(status: string): boolean {
  return ['inactive', 'stopped', 'deleted', 'removed', 'expired', 'closed'].includes(status.toLowerCase());
}

function toStoredVacancy(entry: FeedEntryContent, existing?: StoredVacancy): StoredVacancy | null {
  if (!entry.ad_content) return null;
  const ad = entry.ad_content;
  return {
    uuid: ad.uuid || entry.uuid,
    sistEndret: entry.sistEndret,
    status: entry.status,
    hidden: isInactiveStatus(entry.status),
    postedToDiscord: existing?.postedToDiscord ?? false,
    lastPostedSistEndret: existing?.lastPostedSistEndret ?? null,
    title: ad.title,
    description: ad.description ?? null,
    published: ad.published ?? null,
    expires: ad.expires ?? null,
    updated: ad.updated ?? entry.sistEndret,
    applicationDue: ad.applicationDue ?? null,
    applicationUrl: ad.applicationUrl ?? null,
    sourceurl: ad.sourceurl ?? null,
    source: ad.source ?? null,
    link: ad.link ?? null,
    employer: ad.employer,
    workLocations: ad.workLocations ?? [],
    occupationCategories: ad.occupationCategories ?? [],
    categoryList: ad.categoryList ?? [],
    jobtitle: ad.jobtitle ?? null,
    engagementtype: ad.engagementtype ?? null,
    extent: ad.extent ?? null,
    starttime: ad.starttime ?? null,
    positioncount: ad.positioncount ?? null,
    sector: ad.sector ?? null,
  };
}

export async function upsertVacancy(entry: FeedEntryContent): Promise<'inserted' | 'updated' | 'skipped' | 'hidden'> {
  const vacancies = await loadVacancies();
  const existing = vacancies[entry.uuid];

  if (!entry.ad_content || isInactiveStatus(entry.status)) {
    if (existing) {
      vacancies[entry.uuid] = { ...existing, status: entry.status, sistEndret: entry.sistEndret, hidden: true };
      await saveVacancies(vacancies);
      return 'hidden';
    }
    return 'skipped';
  }

  if (existing && new Date(existing.sistEndret).getTime() >= new Date(entry.sistEndret).getTime()) {
    return 'skipped';
  }

  const stored = toStoredVacancy(entry, existing);
  if (!stored) return 'skipped';
  vacancies[stored.uuid] = stored;
  await saveVacancies(vacancies);
  return existing ? 'updated' : 'inserted';
}

export async function markPosted(uuid: string, sistEndret: string): Promise<void> {
  const vacancies = await loadVacancies();
  const vacancy = vacancies[uuid];
  if (!vacancy) return;
  vacancies[uuid] = { ...vacancy, postedToDiscord: true, lastPostedSistEndret: sistEndret };
  await saveVacancies(vacancies);
}
