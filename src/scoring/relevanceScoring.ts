import type { JobCard, StoredVacancy } from '../types/nav.js';

const STRONG_KEYWORDS = [
  'politikk',
  'politisk',
  'politisk arbeid',
  'folkevalgte',
  'demokratiske prosesser',
  'sekretariat',
  'saksbehandling',
  'saksbehandler',
  'offentlig administrasjon',
  'fylkeskommune',
  'kommune',
  'storting',
  'stortinget',
  'departement',
  'departementet',
  'direktorat',
  'tilsyn',
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
  'algoritme',
  'algoritmer',
  'data governance',
  'samfunnsvitenskap',
  'statsvitenskap',
  'strategi',
  'policy',
  'forskning',
  'universitet',
  'beredskap',
  'klima',
  'energi',
];

const WEAK_KEYWORDS = ['kommunikasjon', 'administrasjon', 'administrative oppgaver', 'digitale verktøy', 'prosjektleder'];
const ALL_KEYWORDS = [...STRONG_KEYWORDS, ...WEAK_KEYWORDS];

const EMPLOYER_BOOST_TERMS = [
  'departement',
  'direktorat',
  'tilsyn',
  'kommune',
  'fylkeskommune',
  'universitet',
  'nav',
  'ssb',
  'digdir',
  'dfø',
  'datatilsynet',
  'medietilsynet',
  'miljødirektoratet',
  'nve',
  'udi',
];

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
  'mekaniker',
  'elektriker',
  'tømrer',
  'frisør',
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
  if (days <= 7) return 2;
  if (days <= 30) return 1;
  return 0;
}

function hasExcludedOccupation(vacancy: StoredVacancy): boolean {
  const text = `${vacancy.title} ${vacancy.jobtitle ?? ''} ${collectCategoryText(vacancy)}`;
  return EXCLUDED_TEXT_TERMS.some((term) => includesKeyword(text, term));
}

function fullSearchText(vacancy: StoredVacancy): string {
  return [
    vacancy.title,
    vacancy.jobtitle,
    vacancy.employer?.name,
    vacancy.sector,
    collectCategoryText(vacancy),
    vacancy.description,
  ].join(' ');
}

export function scoreVacancy(vacancy: StoredVacancy): { score: number; matchedKeywords: string[]; reason?: string } {
  if (vacancy.hidden) return { score: -1, matchedKeywords: [], reason: 'hidden' };
  if (isExpired(vacancy)) return { score: -1, matchedKeywords: [], reason: 'expired' };
  if (hasExcludedOccupation(vacancy)) return { score: -1, matchedKeywords: [], reason: 'excluded occupation' };

  let score = 0;
  const matched = new Set<string>();
  const strongMatches = new Set<string>();
  const title = vacancy.title;
  const jobtitle = vacancy.jobtitle ?? '';
  const employerSector = `${vacancy.employer?.name ?? ''} ${vacancy.sector ?? ''}`;
  const categories = collectCategoryText(vacancy);
  const description = vacancy.description ?? '';
  const fullText = fullSearchText(vacancy);

  for (const keyword of ALL_KEYWORDS) {
    let didMatch = false;
    const isWeak = WEAK_KEYWORDS.includes(keyword);
    if (includesKeyword(title, keyword)) {
      score += isWeak ? 2 : 10;
      didMatch = true;
    }
    if (includesKeyword(jobtitle, keyword)) {
      score += isWeak ? 1 : 8;
      didMatch = true;
    }
    if (includesKeyword(employerSector, keyword)) {
      score += isWeak ? 1 : 7;
      didMatch = true;
    }
    if (includesKeyword(categories, keyword)) {
      score += isWeak ? 1 : 4;
      didMatch = true;
    }
    if (includesKeyword(description, keyword)) {
      score += isWeak ? 1 : 2;
      didMatch = true;
    }
    if (didMatch) {
      matched.add(keyword);
      if (!isWeak) strongMatches.add(keyword);
    }
  }

  for (const term of EMPLOYER_BOOST_TERMS) {
    if (includesKeyword(employerSector, term)) {
      score += 6;
      matched.add(term);
      strongMatches.add(term);
    }
  }

  if (includesKeyword(fullText, 'rådgiver') || includesKeyword(fullText, 'seniorrådgiver')) score += 6;
  if (includesKeyword(fullText, 'analyse') || includesKeyword(fullText, 'utredning')) score += 4;
  if (includesKeyword(fullText, 'digitalisering') || includesKeyword(fullText, 'kunstig intelligens')) score += 4;

  if (strongMatches.size === 0) return { score: -1, matchedKeywords: [], reason: 'no strong keyword match' };

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
  const scored = vacancies.map((vacancy) => ({ vacancy, result: scoreVacancy(vacancy), card: toJobCard(vacancy) }));
  const debug = scored
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, 10)
    .map(({ vacancy, result }) => ({
      title: vacancy.title,
      employer: vacancy.employer?.name ?? 'Ukjent',
      score: result.score,
      reason: result.reason ?? 'ok',
      matched: result.matchedKeywords.slice(0, 8),
    }));
  console.log('Top vacancy scoring debug:', JSON.stringify(debug, null, 2));

  return scored
    .map((item) => item.card)
    .filter((card) => isRelevantCard(card, minScore))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}
