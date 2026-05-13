import type { JobCard, StoredVacancy } from '../types/nav.js';

const KEYWORDS = [
  'politikk',
  'politisk',
  'rådgiver',
  'seniorrådgiver',
  'analyse',
  'analytiker',
  'departement',
  'direktorat',
  'digitalisering',
  'ki',
  'ai',
  'kunstig intelligens',
  'offentlig sektor',
  'forvaltning',
  'utredning',
  'kommunikasjon',
  'samfunn',
  'strategi',
  'policy',
];

function norm(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

function includesKeyword(text: string, keyword: string): boolean {
  const normalized = norm(text);
  const k = norm(keyword);
  if (k.length <= 2) return new RegExp(`(^|[^a-zæøå])${k}([^a-zæøå]|$)`, 'i').test(normalized);
  return normalized.includes(k);
}

function collectCategoryText(vacancy: StoredVacancy): string {
  return [
    ...vacancy.occupationCategories.flatMap((c) => [c.level1, c.level2]),
    ...vacancy.categoryList.flatMap((c) => [c.name, c.description, c.categoryType]),
  ].join(' ');
}

function locationText(vacancy: StoredVacancy): string {
  return vacancy.workLocations
    .map((l) => [l.city, l.municipal, l.county].filter(Boolean).join(', '))
    .filter(Boolean)
    .join(' / ');
}

function isExpired(vacancy: StoredVacancy): boolean {
  const now = Date.now();
  const expires = vacancy.expires ? new Date(vacancy.expires).getTime() : Number.NaN;
  if (!Number.isNaN(expires) && expires < now) return true;

  const due = vacancy.applicationDue ? Date.parse(vacancy.applicationDue) : Number.NaN;
  return !Number.isNaN(due) && due < now;
}

function newerAdBonus(vacancy: StoredVacancy): number {
  const updated = Date.parse(vacancy.updated ?? vacancy.sistEndret);
  if (Number.isNaN(updated)) return 0;
  const days = (Date.now() - updated) / (1000 * 60 * 60 * 24);
  if (days <= 1) return 5;
  if (days <= 3) return 4;
  if (days <= 7) return 3;
  if (days <= 14) return 2;
  if (days <= 30) return 1;
  return 0;
}

export function scoreVacancy(vacancy: StoredVacancy): { score: number; matchedKeywords: string[] } {
  if (vacancy.hidden || isExpired(vacancy)) return { score: -1, matchedKeywords: [] };

  let score = 0;
  const matched = new Set<string>();
  const title = vacancy.title;
  const jobtitle = vacancy.jobtitle ?? '';
  const employerSector = `${vacancy.employer?.name ?? ''} ${vacancy.sector ?? ''}`;
  const categories = collectCategoryText(vacancy);
  const description = vacancy.description ?? '';

  for (const keyword of KEYWORDS) {
    let didMatch = false;
    if (includesKeyword(title, keyword)) {
      score += 10;
      didMatch = true;
    }
    if (includesKeyword(jobtitle, keyword)) {
      score += 8;
      didMatch = true;
    }
    if (includesKeyword(employerSector, keyword)) {
      score += 6;
      didMatch = true;
    }
    if (includesKeyword(categories, keyword)) {
      score += 4;
      didMatch = true;
    }
    if (includesKeyword(description, keyword)) {
      score += 3;
      didMatch = true;
    }
    if (didMatch) matched.add(keyword);
  }

  score += newerAdBonus(vacancy);
  return { score, matchedKeywords: [...matched] };
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function summary(vacancy: StoredVacancy): string {
  const raw = stripHtml(vacancy.description ?? '');
  if (!raw) return 'Ingen kort beskrivelse tilgjengelig.';
  return raw.length > 260 ? `${raw.slice(0, 257)}...` : raw;
}

export function toJobCard(vacancy: StoredVacancy): JobCard | null {
  const scored = scoreVacancy(vacancy);
  if (scored.score < 0) return null;

  return {
    uuid: vacancy.uuid,
    title: vacancy.title,
    employer: vacancy.employer?.name ?? 'Ukjent arbeidsgiver',
    location: locationText(vacancy) || 'Ukjent sted',
    deadline: vacancy.applicationDue ?? vacancy.expires ?? 'Ikke oppgitt',
    relevanceScore: scored.score,
    matchedKeywords: scored.matchedKeywords,
    shortSummary: summary(vacancy),
    applyUrl: vacancy.applicationUrl ?? null,
    sourceUrl: vacancy.sourceurl ?? vacancy.link ?? null,
    updated: vacancy.updated ?? vacancy.sistEndret,
  };
}

export function getRelevantJobCards(vacancies: StoredVacancy[], minScore: number): JobCard[] {
  return vacancies
    .map(toJobCard)
    .filter((card): card is JobCard => Boolean(card) && card.relevanceScore >= minScore)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}
