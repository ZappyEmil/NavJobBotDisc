import cron from 'node-cron';
import { hasNavToken } from './config.js';
import { syncJobVacancies } from './nav/syncJobVacancies.js';

console.log('NavJobBotDisc starting...');

if (!hasNavToken()) {
  console.log('NAV_FEED_TOKEN missing. Running in mock/demo mode.');
  console.log('Use npm run mock to test Discord webhook output.');
}

cron.schedule(
  '0 8 * * *',
  async () => {
    console.log('Running scheduled NAV vacancy sync...');
    await syncJobVacancies();
  },
  { timezone: 'Europe/Oslo' }
);

console.log('Scheduler active: every day at 08:00 Europe/Oslo');

if (process.argv.includes('--sync-now')) {
  await syncJobVacancies();
}
