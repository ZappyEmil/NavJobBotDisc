import { requireDiscordWebhook } from '../config.js';
import type { JobCard } from '../types/nav.js';

const MAX_WEBHOOK_ATTEMPTS = 3;
const WEBHOOK_TIMEOUT_MS = 30_000;
const FIELD_NAME_LIMIT = 256;
const FIELD_VALUE_LIMIT = 1024;
const EMBED_DESCRIPTION_LIMIT = 4096;
const EMBED_TOTAL_LIMIT = 5600;
const MAX_FIELDS_PER_EMBED = 10;

function embedColor(score: number): number {
  if (score >= 30) return 0x2ecc71;
  if (score >= 15) return 0xf39c12;
  return 0x95a5a6;
}

function truncate(value: unknown, maxLength: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function field(name: string, value: string, inline = true) {
  return {
    name: truncate(name || 'Field', FIELD_NAME_LIMIT),
    value: truncate(value || 'Ikke oppgitt', FIELD_VALUE_LIMIT),
    inline,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function responseText(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  return body.length > 500 ? `${body.slice(0, 500)}...` : body;
}

function categoryForJob(job: JobCard): string {
  const terms = job.matchedKeywords.map((term) => term.toLowerCase());
  if (terms.some((term) => ['politikk', 'politisk', 'policy', 'storting'].includes(term))) return 'Politikk/policy';
  if (terms.some((term) => ['digitalisering', 'kunstig intelligens', 'algoritme', 'data governance'].includes(term))) return 'Digitalisering/AI';
  if (terms.some((term) => ['departement', 'direktorat', 'tilsyn', 'forvaltning', 'offentlig sektor'].includes(term))) return 'Offentlig forvaltning';
  if (terms.some((term) => ['analyse', 'utredning', 'analytiker', 'forsker'].includes(term))) return 'Analyse/utredning';
  return 'Relevant jobb';
}

function primaryLink(job: JobCard): string {
  return job.applyUrl || job.sourceUrl || '';
}

function linkLine(job: JobCard): string {
  const url = primaryLink(job);
  return url ? `[Åpne stilling](${url.replace(/\)/g, '%29')})` : 'Ingen lenke';
}

function jobFieldValue(job: JobCard): string {
  const matched = job.matchedKeywords.length > 0 ? job.matchedKeywords.slice(0, 8).join(', ') : 'Ingen';
  return [
    `Kilde: NAV Arbeidsplassen`,
    `Kategori: ${categoryForJob(job)}`,
    `Arbeidsgiver: ${job.employer}`,
    `Sted: ${job.location}`,
    `Frist: ${job.deadline}`,
    `Oppdatert: ${job.updated}`,
    `Match: ${matched}`,
    `Lenke: ${linkLine(job)}`,
    `Kort: ${truncate(job.shortSummary, 360)}`,
  ].join('\n');
}

function embedSize(embed: { title?: string; description?: string; fields?: Array<{ name: string; value: string }> }): number {
  const fieldSize = embed.fields?.reduce((total, item) => total + item.name.length + item.value.length, 0) ?? 0;
  return (embed.title?.length ?? 0) + (embed.description?.length ?? 0) + fieldSize;
}

function buildJobDigestEmbeds(jobs: JobCard[]): unknown[] {
  if (jobs.length === 0) {
    return [
      {
        title: 'NAV job alert',
        description: 'No new matching jobs found in this run.',
        color: 0x95a5a6,
        fields: [field('Source', 'NAV Arbeidsplassen'), field('Category', 'No new matches')],
        timestamp: new Date().toISOString(),
      },
    ];
  }

  const sorted = [...jobs].sort((a, b) => b.relevanceScore - a.relevanceScore);
  const embeds: Array<{ title: string; description: string; color: number; fields: Array<{ name: string; value: string; inline: boolean }>; footer: { text: string }; timestamp: string }> = [];

  for (const job of sorted) {
    const fieldForJob = field(`${job.title} — ${job.employer}`, jobFieldValue(job), false);
    let current = embeds[embeds.length - 1];

    if (!current || current.fields.length >= MAX_FIELDS_PER_EMBED || embedSize({ ...current, fields: [...current.fields, fieldForJob] }) > EMBED_TOTAL_LIMIT) {
      current = {
        title: `NAV job alerts — ${jobs.length} new match${jobs.length === 1 ? '' : 'es'}`,
        description: truncate('Relevant NAV Arbeidsplassen vacancies grouped into a compact digest to avoid channel spam.', EMBED_DESCRIPTION_LIMIT),
        color: embedColor(sorted[0]?.relevanceScore ?? 0),
        fields: [],
        footer: { text: 'NAV Arbeidsplassen Feed' },
        timestamp: new Date().toISOString(),
      };
      embeds.push(current);
    }

    current.fields.push(fieldForJob);
  }

  return embeds;
}

async function postWebhookPayload(payload: unknown, attempt = 1): Promise<void> {
  const webhookUrl = requireDiscordWebhook();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (attempt < MAX_WEBHOOK_ATTEMPTS) {
      const waitMs = attempt * 1000;
      console.warn(`Discord webhook request failed before a response. Retrying in ${waitMs}ms (${attempt + 1}/${MAX_WEBHOOK_ATTEMPTS}).`);
      await sleep(waitMs);
      return postWebhookPayload(payload, attempt + 1);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  console.log(`Discord webhook response: ${response.status} ${response.statusText}`);

  if (response.status === 429 && attempt < MAX_WEBHOOK_ATTEMPTS) {
    const body = (await response.json().catch(() => null)) as { retry_after?: number } | null;
    const retryAfterSeconds = typeof body?.retry_after === 'number' ? body.retry_after : 1;
    const waitMs = Math.ceil(retryAfterSeconds * 1000) + 250;
    console.warn(`Discord rate limited. Waiting ${waitMs}ms before retry ${attempt + 1}/${MAX_WEBHOOK_ATTEMPTS}.`);
    await sleep(waitMs);
    return postWebhookPayload(payload, attempt + 1);
  }

  if (response.status >= 500 && attempt < MAX_WEBHOOK_ATTEMPTS) {
    const waitMs = attempt * 1000;
    console.warn(`Discord webhook returned ${response.status}. Retrying in ${waitMs}ms (${attempt + 1}/${MAX_WEBHOOK_ATTEMPTS}).`);
    await sleep(waitMs);
    return postWebhookPayload(payload, attempt + 1);
  }

  if (!response.ok) {
    const body = await responseText(response);
    console.error(`Discord webhook failed: ${response.status} ${response.statusText} ${body}`.trim());
    throw new Error(`Discord webhook failed after ${attempt} attempt(s): ${response.status} ${response.statusText}`.trim());
  }
}

export async function postJobToDiscord(job: JobCard): Promise<void> {
  await postJobsToDiscord([job]);
}

export async function postJobsToDiscord(jobs: JobCard[]): Promise<number> {
  const embeds = buildJobDigestEmbeds(jobs);
  console.log(`Posting ${jobs.length} NAV job(s) to Discord in ${embeds.length} digest message(s).`);

  for (const embed of embeds) {
    await postWebhookPayload({
      username: 'NavBotJobDisc',
      embeds: [embed],
    });
    await sleep(750);
  }

  return jobs.length;
}
