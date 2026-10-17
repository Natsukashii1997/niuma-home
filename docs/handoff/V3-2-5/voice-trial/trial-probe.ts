// Public free RSS only; no persistence of bodies, paid collectors, jobs or model calls.
import { writeFile } from 'node:fs/promises';
import { fetchRss } from '@aihot/backend/sources/rss';
import { closeDb } from '@aihot/backend/db';
import { config } from '@aihot/backend/config';
const destination = process.argv[2];
if (!destination || config.modelCallsEnabled) throw new Error('safe trial configuration required');
const sources = {
  ukvi: { name: 'UKVI', type: 'policy-background', url: 'https://www.gov.uk/government/organisations/uk-visas-and-immigration.atom' },
  // Discovered from <link rel="alternate" type="application/rss+xml"> on the official category page.
  cc: { name: 'College Confidential international students', type: 'student-discussion-candidate', url: 'https://talk.collegeconfidential.com/c/international-students/55.rss' },
};
const source = sources[process.argv[3] || 'ukvi'];
if (!source) throw new Error('unreviewed source');
const url = source.url;
const result: Record<string, unknown> = { source: source.name, sourceType: source.type, url, checkedAt: new Date().toISOString(), officialFetcher: 'packages/backend/src/sources/rss.ts#fetchRss' };
try {
  const read = await fetchRss({ id: 'trial-free-read', name: source.name, kind: 'rss', config: { feedUrl: url }, tier: 'T1', participation_mode: 'isolated', first_party: false, interval_minutes: 1440, enabled: false, cursor: null, fail_count: 0 });
  const dates = read.candidates.filter(c => c.publishedAt).map(c => c.publishedAt!.getTime());
  Object.assign(result, { ok: true, candidates: read.candidates.length, dated: dates.length, authorsPresent: read.candidates.filter(c => c.author).length, distinctAuthorAccounts: new Set(read.candidates.filter(c => c.author).map(c => c.author)).size, within48Hours: dates.filter(t => t <= Date.now() && Date.now() - t <= 48 * 3600000).length, latestPublishedAt: dates.length ? new Date(Math.max(...dates)).toISOString() : null, notModified: read.notModified, responseUrl: read.validator.responseUrl });
} catch (error) {
  Object.assign(result, { ok: false, error: error instanceof Error ? error.message : String(error) });
}
await writeFile(destination, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
await closeDb();
// This one-shot probe owns its process and closes free HTTP pools at process exit.
process.exit(0);
