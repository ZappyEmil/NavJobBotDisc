export type FeedLocation = {
  country?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  county?: string | null;
  municipal?: string | null;
};

export type FeedOccupation = { level1: string; level2: string };

export type FeedCategory = {
  categoryType: string;
  code: string;
  name: string;
  description?: string | null;
  score: number;
};

export type FeedEmployer = {
  name: string;
  orgnr?: string | null;
  description?: string | null;
  homepage?: string | null;
};

export type FeedEntrySummary = {
  uuid: string;
  status: string;
  title: string;
  businessName: string;
  municipal: string;
  sistEndret: string;
};

export type FeedLine = {
  id: string;
  url: string;
  title: string;
  content_text: string;
  date_modified?: string | null;
  _feed_entry: FeedEntrySummary;
};

export type FeedPage = {
  version: string;
  title: string;
  home_page_url: string;
  feed_url: string;
  description: string;
  next_url?: string | null;
  id: string;
  next_id?: string | null;
  items: FeedLine[];
};

export type FeedAd = {
  uuid: string;
  published: string;
  expires: string;
  updated: string;
  workLocations: FeedLocation[];
  contactList: unknown[];
  title: string;
  description?: string | null;
  sourceurl?: string | null;
  source?: string | null;
  applicationUrl?: string | null;
  applicationDue?: string | null;
  occupationCategories: FeedOccupation[];
  categoryList: FeedCategory[];
  jobtitle?: string | null;
  link: string;
  employer: FeedEmployer;
  engagementtype?: string | null;
  extent?: string | null;
  starttime?: string | null;
  positioncount?: string | null;
  sector?: string | null;
};

export type FeedEntryContent = {
  uuid: string;
  sistEndret: string;
  status: string;
  ad_content: FeedAd | null;
};

export type StoredVacancy = {
  uuid: string;
  sistEndret: string;
  status: string;
  hidden: boolean;
  postedToDiscord: boolean;
  lastPostedSistEndret?: string | null;
  title: string;
  description?: string | null;
  published?: string | null;
  expires?: string | null;
  updated?: string | null;
  applicationDue?: string | null;
  applicationUrl?: string | null;
  sourceurl?: string | null;
  source?: string | null;
  link?: string | null;
  employer: FeedEmployer;
  workLocations: FeedLocation[];
  occupationCategories: FeedOccupation[];
  categoryList: FeedCategory[];
  jobtitle?: string | null;
  engagementtype?: string | null;
  extent?: string | null;
  starttime?: string | null;
  positioncount?: string | null;
  sector?: string | null;
};

export type JobCard = {
  uuid: string;
  title: string;
  employer: string;
  location: string;
  deadline: string;
  relevanceScore: number;
  matchedKeywords: string[];
  shortSummary: string;
  applyUrl?: string | null;
  sourceUrl?: string | null;
  updated: string;
};

export type FeedCacheEntry = { etag?: string; lastModified?: string };
export type FeedCache = Record<string, FeedCacheEntry>;
