import { randomUUID } from 'node:crypto';
import { assistantVersion, materialVersion, planVersion } from '../../server/legacy-writes.mjs';
import { getAssistant, getMaterial } from '../../server/db.mjs';

// Existing API tests represent a fresh user read before each operation. Dedicated
// legacy-write tests supply fixed headers to exercise stale and repeated requests.
export function legacyHeaders(db, method, url) {
  const pathname = new URL(url, 'http://localhost').pathname;
  const headers = { 'x-workdesk-request-id': randomUUID() };
  let m;
  if (method === 'PATCH' && (m = pathname.match(/^\/api\/assistants\/(\d+)$/))) headers['x-workdesk-base-version'] = assistantVersion(getAssistant(db, m[1]));
  if (['PATCH', 'POST', 'DELETE'].includes(method) && (m = pathname.match(/^\/api\/materials\/(\d+)/))) headers['x-workdesk-base-version'] = materialVersion(getMaterial(db, m[1]));
  if (method === 'PUT' && (m = pathname.match(/^\/api\/plans\/([^/]+)\/([^/]+)$/))) headers['x-workdesk-base-version'] = planVersion(db, m[1], decodeURIComponent(m[2]));
  return headers;
}
