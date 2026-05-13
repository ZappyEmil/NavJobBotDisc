import { config } from '../config.js';
import { getFeedCacheEntry, setFeedCacheEntry } from '../storage/vacancyStore.js';
import type { FeedEntryContent, FeedPage } from '../types/nav.js';

type FetchJsonResult<T> =
  | { status: 200; data: T; etag?: string; lastModified?: string }
  | { status: 304; data: null }
  | { status: number; data: null };

type FetchOptions = {
  cacheKey?: string;
  useCache?: boolean;
  ifModifiedSince?: string;
  ifNoneMatch?: string;
};

function normalizeApiPath(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    const parsed = new URL(pathOrUrl);
    return `${parsed.pathname}${parsed.search}`;
  }
  return pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
}

async function fetchJson<T>(pathOrUrl: string, options: FetchOptions = {}): Promise<FetchJsonResult<T>> {
  const path = normalizeApiPath(pathOrUrl);
  const useCache = options.useCache ?? true;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${config.navFeedToken}`,
  };

  if (options.ifModifiedSince) headers['If-Modified-Since'] = options.ifModifiedSince;
  if (options.ifNoneMatch) headers['If-None-Match'] = options.ifNoneMatch;

  if (options.cacheKey && useCache) {
    const cache = await getFeedCacheEntry(options.cacheKey);
    if (cache?.etag && !headers['If-None-Match']) headers['If-None-Match'] = cache.etag;
    if (cache?.lastModified && !headers['If-Modified-Since']) headers['If-Modified-Since'] = cache.lastModified;
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

  if (options.cacheKey && useCache && (etag || lastModified)) {
    await setFeedCacheEntry(options.cacheKey, { etag, lastModified });
  }

  return { status: 200, data, etag, lastModified };
}

export async function fetchFirstFeedPage(options: { ifModifiedSince?: string } = {}): Promise<FetchJsonResult<FeedPage>> {
  return fetchJson<FeedPage>('/api/v1/feed', {
    useCache: false,
    ifModifiedSince: options.ifModifiedSince,
  });
}

export async function fetchNewestFeedPage(useCache = true): Promise<FetchJsonResult<FeedPage>> {
  return fetchJson<FeedPage>('/api/v1/feed?last=true', { cacheKey: 'feed:last', useCache });
}

export async function fetchFeedPage(feedPageId: string, useCache = true): Promise<FetchJsonResult<FeedPage>> {
  return fetchJson<FeedPage>(`/api/v1/feed/${encodeURIComponent(feedPageId)}`, { cacheKey: `feed:${feedPageId}`, useCache });
}

export async function fetchFeedPageByUrl(url: string, useCache = true): Promise<FetchJsonResult<FeedPage>> {
  const path = normalizeApiPath(url);
  return fetchJson<FeedPage>(path, { cacheKey: `feed-url:${path}`, useCache });
}

export async function fetchFeedEntry(entryId: string): Promise<FeedEntryContent | null> {
  const result = await fetchJson<FeedEntryContent>(`/api/v1/feedentry/${encodeURIComponent(entryId)}`, { useCache: false });
  if (result.status !== 200) return null;
  return result.data;
}

export async function fetchFeedEntryByUrl(url: string): Promise<FeedEntryContent | null> {
  const result = await fetchJson<FeedEntryContent>(url, { useCache: false });
  if (result.status !== 200) return null;
  return result.data;
}
