import { postJobToDiscord } from '../discord/postJobs.js';
import { toJobCard } from '../scoring/relevanceScoring.js';
import type { StoredVacancy } from '../types/nav.js';

const mockVacancy: StoredVacancy = {
  uuid: 'mock-nav-job-001',
  sistEndret: new Date().toISOString(),
  status: 'ACTIVE',
  hidden: false,
  postedToDiscord: false,
  lastPostedSistEndret: null,
  title: 'Rådgiver innen digitalisering, KI og offentlig forvaltning',
  description:
    'Vi søker en analytisk rådgiver som vil jobbe med digitalisering, kunstig intelligens, utredning og politikkutvikling i offentlig sektor.',
  published: new Date().toISOString(),
  expires: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  updated: new Date().toISOString(),
  applicationDue: 'Snarest',
  applicationUrl: 'https://arbeidsplassen.nav.no/stillinger/mock',
  sourceurl: 'https://arbeidsplassen.nav.no/',
  source: 'MOCK',
  link: 'https://arbeidsplassen.nav.no/stillinger/mock',
  employer: { name: 'Digitaliserings- og forvaltningsdepartementet', orgnr: '000000000' },
  workLocations: [{ city: 'Oslo', municipal: 'Oslo', county: 'Oslo' }],
  occupationCategories: [{ level1: 'Kontor og administrasjon', level2: 'Rådgiver' }],
  categoryList: [{ categoryType: 'STYRK08', code: '2422', name: 'Rådgivere innen politikk og administrasjon', score: 1 }],
  jobtitle: 'Rådgiver',
  engagementtype: 'Fast',
  extent: 'Heltid',
  starttime: 'Etter avtale',
  positioncount: '1',
  sector: 'Offentlig',
};

export async function runMock(): Promise<void> {
  const card = toJobCard(mockVacancy);
  if (!card) throw new Error('Mock vacancy did not produce a job card.');
  await postJobToDiscord(card);
  console.log('Posted mock job to Discord webhook.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMock().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
