import { requireDiscordWebhook } from '../config.js';
import type { JobCard } from '../types/nav.js';

function embedColor(score: number): number {
  if (score >= 30) return 0x2ecc71;
  if (score >= 15) return 0xf39c12;
  return 0x95a5a6;
}

function field(name: string, value: string, inline = true) {
  return { name, value: value || 'Ikke oppgitt', inline };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWebhookPayload(payload: unknown, attempt = 1): Promise<void> {
  const webhookUrl = requireDiscordWebhook();
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.status === 429 && attempt <= 3) {
    const body = await response.json().catch(() => null) as { retry_after?: number } | null;
    const retryAfterSeconds = typeof body?.retry_after === 'number' ? body.retry_after : 1;
    const waitMs = Math.ceil(retryAfterSeconds * 1000) + 250;
    console.warn(`Discord rate limited. Waiting ${waitMs}ms before retry ${attempt}/3.`);
    await sleep(waitMs);
    return postWebhookPayload(payload, attempt + 1);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Discord webhook failed: ${response.status} ${response.statusText} ${body}`);
  }
}

export async function postJobToDiscord(job: JobCard): Promise<void> {
  const url = job.applyUrl || job.sourceUrl || undefined;

  const payload = {
    username: 'NavBotJobDisc',
    embeds: [
      {
        title: job.title,
        url,
        description: job.shortSummary,
        color: embedColor(job.relevanceScore),
        fields: [
          field('Employer', job.employer),
          field('Location', job.location),
          field('Deadline', job.deadline),
          field('Score', String(job.relevanceScore)),
          field('Matched keywords', job.matchedKeywords.join(', ') || 'Ingen', false),
          field('Apply URL', job.applyUrl || 'Ikke oppgitt', false),
          field('Source URL', job.sourceUrl || 'Ikke oppgitt', false),
        ],
        footer: { text: 'NAV Arbeidsplassen Feed' },
        timestamp: new Date(job.updated).toISOString(),
      },
    ],
  };

  await postWebhookPayload(payload);
}

export async function postJobsToDiscord(jobs: JobCard[]): Promise<number> {
  let posted = 0;
  for (const job of jobs) {
    await postJobToDiscord(job);
    posted += 1;
    await sleep(750);
  }
  return posted;
}
