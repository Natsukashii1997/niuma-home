// Copy beside the pinned AIHOT package.json; never run the original API/worker main.
import Fastify from 'fastify';
import { sql, closeDb } from '@aihot/backend/db';
import { config } from '@aihot/backend/config';
import { loadHot } from '@aihot/backend/publication/stories';
import { registerV1, registerV1Fallbacks } from './apps/api/src/routes/v1.ts';

if (config.modelCallsEnabled || process.env.COLLECT_ENABLED !== 'false') throw new Error('trial flags must be off');
const app = Fastify({ logger: false });
app.addHook('onRequest', async (req, reply) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return reply.code(405).send({ error: 'read only trial' });
});
app.get('/health', async () => ({ ok: (await sql`SELECT 1 AS ok`)[0].ok === 1, mode: 'free-manual-trial' }));
app.get('/api/site/hot', async () => loadHot());
registerV1(app);
registerV1Fallbacks(app);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => { await app.close(); await closeDb(); process.exit(0); });
await app.listen({ host: '127.0.0.1', port: 5397 });
console.log('read-only AIHOT trial listening on 127.0.0.1:5397; no worker, schedules or models');
