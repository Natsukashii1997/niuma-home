import { writeFile } from 'node:fs/promises';
import { sql, closeDb } from '@aihot/backend/db';
import { config } from '@aihot/backend/config';
if (config.modelCallsEnabled || process.env.COLLECT_ENABLED !== 'false') throw new Error('unsafe trial flags');
const [counts] = await sql`SELECT
 (SELECT count(*) FROM schema_migrations) AS migrations,
 (SELECT count(*) FROM sources) AS sources,
 (SELECT count(*) FROM sources WHERE enabled) AS enabled_sources,
 (SELECT count(*) FROM articles) AS articles,
 (SELECT count(*) FROM stories) AS stories,
 (SELECT count(*) FROM publications) AS publications,
 (SELECT count(*) FROM receipt_attempts) AS provider_attempts,
 (SELECT count(*) FROM receipts) AS provider_receipts,
 (SELECT count(*) FROM hot_rankings) AS hot_rankings,
 (SELECT count(*) FROM pg_namespace WHERE nspname = 'pgboss') AS pgboss_schemas`;
const result = { checkedAt: new Date().toISOString(), modelCallsEnabled: config.modelCallsEnabled, collectEnabled: process.env.COLLECT_ENABLED === 'true', counts };
await writeFile(process.argv[2], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
await closeDb();
