import type { JobCard, StoredVacancy } from '../types/nav.js';

const STRONG_KEYWORDS = [
  'politikk',
  'politisk',
  'politisk arbeid',
  'politisk sekretær',
  'politiske møter',
  'folkevalgte',
  'folkevalgte organ',
  'demokratiske prosesser',
  'sekretariat',
  'sekretariatsfunksjon',
  'saksbehandling',
  'saksbehandler',
  'internkontroll',
  'offentlig administrasjon',
  'fylkeskommune',
  'kommune',
  'storting',
  'stortinget',
  'departement',
  'departementet',
  'direktorat',
  'forvaltning',
  'offentlig sektor',
  'rådgiver',
  'seniorrådgiver',
  'konsulent',
  'analyse',
  'analytiker',
  'utredning',
  'digitalisering',
  'ki',
  'ai',
  'kunstig intelligens',
  'samfunn',
  'strategi',
  'policy',
];

const WEAK_KEYWORDS = ['kommunikasjon', 'administrative oppgaver', 'digitale verktøy'];
const ALL_KEYWORDS = [...STRONG_KEYWORDS, ...WEAK_KEYWORDS];

const EXCLUDED_TEXT_TERMS = [
  'sykepleier',
  'kreftsykepleier',
  'helsefagarbeider',
  'lege',
  'overlege',
  'psykolog',
  'vernepleier',
  'barnehage',
  'pedagogisk leder',
  'lærer',
  'renholder',
  'kokk',
  'servitør',
  'butikk',
  'sjåfør',
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
  if (days <= 1) return 3;
  if (days <= 3) return 2;
  if (days <= 7) return 1;
  return 0;
}

function hasExcludedOccupation(vacancy: StoredVacancy): boolean {
  const text = `${vacancy.title} ${vacancy.jobtitle ?? ''} ${collectCategoryText(vacancy)}`;
  return EXCLUDED_TEXT_TERMS.some((term) => includesKeyword(text, term));
}

export function scoreVacancy(vacancy: StoredVacancy): { score: number; matchedKeywords: string[] } {
  if (vacancy.hidden || isExpired(vacancy) || hasExcludedOccupation(vacancy)) {
    return { score: -1, matchedKeywords: [] };
  }

  let score = 0;
  const matched = new Set<string>();
  const strongMatches = new Set<string>();
  const title = vacancy.title;
  const jobtitle = vacancy.jobtitle ?? '';
  const employerSector = `${vacancy.employer?.name ?? ''} ${vacancy.sector ?? ''}`;
  const categories = collectCategoryText(vacancy);
  const description = vacancy.description ?? '';

  for (const keyword of ALL_KEYWORDS) {
    let didMatch = false;
    const isWeak = WEAK_KEYWORDS.includes(keyword);
    if (includesKeyword(title, keyword)) {
      score += isWeak ? 2 : 14;
      didMatch = true;
    }
    if (includesKeyword(jobtitle, keyword)) {
      score += isWeak ? 1 : 10;
      didMatch = true;
    }
    if (includesKeyword(employerSector, keyword)) {
      score += isWeak ? 1 : 8;
      didMatch = true;
    }
    if (includesKeyword(categories, keyword)) {
      score += isWeak ? 1 : 5;
      didMatch = true;
    }
    if (includesKeyword(description, keyword)) {
      score += isWeak ? 1 : 3;
      didMatch = true;
    }
    if (didMatch) {
      matched.add(keyword);
      if (!isWeak) strongMatches.add(keyword);
    }
  }

  if (strongMatches.size === 0) return { score: -1, matchedKeywords: [] };
  if (score < 18) return { score: -1, matchedKeywords: [] };

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

function isRelevantCard(card: JobCard | null, minScore: number): card is JobCard {
  return card !== null && card.relevanceScore >= minScore;
}

export function getRelevantJobCards(vacancies: StoredVacancy[], minScore: number): JobCard[] {
  return vacancies.map(toJobCard).filter((card) => isRelevantCard(card, minScore)).sort((a, b) => b.relevanceScore - a.relevanceScore);
}
