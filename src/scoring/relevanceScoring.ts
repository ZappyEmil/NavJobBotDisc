import type { JobCard, StoredVacancy } from '../types/nav.js';

const ROLE_KEYWORDS = [
  'rådgiver',
  'seniorrådgiver',
  'analytiker',
  'konsulent',
  'prosjektleder',
  'utreder',
  'forsker',
  'kommunikasjonsrådgiver',
];

const DOMAIN_KEYWORDS = [
  'politikk',
  'politisk',
  'politisk arbeid',
  'folkevalgte',
  'demokratiske prosesser',
  'sekretariat',
  'saksbehandling',
  'offentlig administrasjon',
  'storting',
  'departement',
  'direktorat',
  'tilsyn',
  'forvaltning',
  'offentlig sektor',
  'analyse',
  'utredning',
  'digitalisering',
  'kunstig intelligens',
  'algoritme',
  'algoritmer',
  'data governance',
  'samfunnsvitenskap',
  'statsvitenskap',
  'strategi',
  'policy',
  'forskning',
  'beredskap',
  'klima',
  'energi',
  'kommunikasjon',
];

const EMPLOYER_BOOST_TERMS = [
  'departement',
  'direktorat',
  'tilsyn',
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

const LOW_SIGNAL_EMPLOYER_TERMS = ['kommune', 'fylkeskommune'];

const EXCLUDED_TEXT_TERMS = [
  'sykepleier',
  'kreftsykepleier',
  'helsefagarbeider',
  'lege',
  'overlege',
  'psykolog',
  'vernepleier',
  'tannlege',
  'bioingeniør',
  'helse',
  'omsorg',
  'pleie',
  'hjemmetjeneste',
  'hjemmehjelp',
  'helsehus',
  'barnevern',
  'barneveileder',
  'aktivitetsskole',
  'aks',
  'barnehage',
  'pedagogisk leder',
  'lærer',
  'miljøterapeut',
  'miljøarbeider',
  'assistent',
  'sommervikar',
  'ferievikar',
  'vikar',
  'helg',
  'tilrettelagte boliger',
  'renholder',
  'kokk',
  'servitør',
  'butikk',
  'lager',
  'logistikk',
  'truckfører',
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

function hasExcludedOccupation(vacancy: StoredVacancy): boolean {
  const text = fullSearchText(vacancy);
  return EXCLUDED_TEXT_TERMS.some((term) => includesKeyword(text, term));
}

function matchTerms(text: string, terms: string[]): string[] {
  return terms.filter((term) => includesKeyword(text, term));
}

export function scoreVacancy(vacancy: StoredVacancy): { score: number; matchedKeywords: string[]; reason?: string } {
  if (vacancy.hidden) return { score: -1, matchedKeywords: [], reason: 'hidden' };
  if (isExpired(vacancy)) return { score: -1, matchedKeywords: [], reason: 'expired' };
  if (hasExcludedOccupation(vacancy)) return { score: -1, matchedKeywords: [], reason: 'excluded occupation' };

  const titleText = `${vacancy.title} ${vacancy.jobtitle ?? ''}`;
  const employerText = `${vacancy.employer?.name ?? ''} ${vacancy.sector ?? ''}`;
  const categoryText = collectCategoryText(vacancy);
  const descriptionText = vacancy.description ?? '';
  const fullText = fullSearchText(vacancy);

  const roleMatches = matchTerms(fullText, ROLE_KEYWORDS);
  const domainMatches = matchTerms(fullText, DOMAIN_KEYWORDS);
  const employerMatches = matchTerms(employerText, EMPLOYER_BOOST_TERMS);
  const lowSignalEmployerMatches = matchTerms(employerText, LOW_SIGNAL_EMPLOYER_TERMS);

  if (roleMatches.length === 0 && domainMatches.length === 0 && employerMatches.length === 0) {
    return { score: -1, matchedKeywords: [], reason: 'no relevant role/domain/employer match' };
  }

  const onlyWeakMunicipalitySignal =
    roleMatches.length === 0 && domainMatches.length === 0 && employerMatches.length === 0 && lowSignalEmployerMatches.length > 0;
  if (onlyWeakMunicipalitySignal) return { score: -1, matchedKeywords: [], reason: 'only municipality signal' };

  let score = 0;
  const matched = new Set<string>();

  for (const term of roleMatches) {
    matched.add(term);
    if (includesKeyword(titleText, term)) score += 14;
    else if (includesKeyword(categoryText, term)) score += 8;
    else score += 4;
  }

  for (const term of domainMatches) {
    matched.add(term);
    if (includesKeyword(titleText, term)) score += 10;
    else if (includesKeyword(employerText, term)) score += 8;
    else if (includesKeyword(categoryText, term)) score += 5;
    else score += 2;
  }

  for (const term of employerMatches) {
    matched.add(term);
    score += 8;
  }

  for (const term of lowSignalEmployerMatches) {
    matched.add(term);
    score += 2;
  }

  if (roleMatches.length === 0 && domainMatches.length < 2 && employerMatches.length === 0) {
    return { score: -1, matchedKeywords: [...matched], reason: 'too weak signal' };
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
