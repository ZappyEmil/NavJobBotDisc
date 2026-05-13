import { config } from '../config.js';
import { getFeedCacheEntry, setFeedCacheEntry } from '../storage/vacancyStore.js';
import type { FeedEntryContent, FeedPage } from '../types/nav.js';

type FetchJsonResult<T> =
  | { status: 200; data: T; etag?: string; lastModified?: string }
  | { status: 304; data: null }
  | { status: number; data: null };

async function fetchJson<T>(path: string, cacheKey?: string, useCache = true): Promise<FetchJsonResult<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${config.navFeedToken}`,
  };

  if (cacheKey && useCache) {
    const cache = await getFeedCacheEntry(cacheKey);
    if (cache?.etag) headers['If-None-Match'] = cache.etag;
    if (cache?.lastModified) headers['If-Modified-Since'] = cache.lastModified;
  }

  const response = await fetch(`${config.navBaseUrl}${path}`, { headers });

  if (response.status === 304) return { status: 304, data: null };
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`NAV API error ${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
    return { status: response.status, data: null };
  }

  const data = (await response.json()) as T;
  const etag = response.headers.get('etag') ?? undefined;
  const lastModified = response.headers.get('last-modified') ?? undefined;

  if (cacheKey && useCache && (etag || lastModified)) {
    await setFeedCacheEntry(cacheKey, { etag, lastModified });
  }

  return { status: 200, data, etag, lastModified };
}

export async function fetchNewestFeedPage(useCache = true): Promise<FetchJsonResult<FeedPage>> {
  return fetchJson<FeedPage>('/api/v1/feed?last=true', 'feed:last', useCache);
}

export async function fetchFeedPage(feedPageId: string, useCache = true): Promise<FetchJsonResult<FeedPage>> {
  return fetchJson<FeedPage>(`/api/v1/feed/${encodeURIComponent(feedPageId)}`, `feed:${feedPageId}`, useCache);
}

export async function fetchFeedEntry(entryId: string): Promise<FeedEntryContent | null> {
  const result = await fetchJson<FeedEntryContent>(`/api/v1/feedentry/${encodeURIComponent(entryId)}`, undefined, false);
  if (result.status !== 200) return null;
  return result.data;
}
