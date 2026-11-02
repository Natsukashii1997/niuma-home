// 智能体接入的凭据与调用记录（workdesk MCP，docs/API.md「智能体接入」）。
// 凭据只存 sha256；签发、轮换、撤销走 scripts/agent-token.mjs，页面不管这件事。
import { createHash, randomBytes } from 'node:crypto';

const sha256 = text => createHash('sha256').update(text).digest('hex');

// 签发或轮换：同一个 agent 再签发会作废旧凭据。返回明文凭据，只此一次。
export function issueAgentToken(db, agent, tools) {
  const token = `wdk_${randomBytes(32).toString('base64url')}`;
  db.prepare('INSERT INTO agent_access (agent,token_sha256,tools,created_at) VALUES (?,?,?,?) ON CONFLICT(agent) DO UPDATE SET token_sha256=excluded.token_sha256,tools=excluded.tools,created_at=excluded.created_at')
    .run(agent, sha256(token), JSON.stringify(tools), new Date().toISOString());
  return token;
}

export const revokeAgent = (db, agent) => db.prepare('DELETE FROM agent_access WHERE agent=?').run(agent).changes > 0;
export const listAgents = db => db.prepare('SELECT agent,tools,created_at FROM agent_access ORDER BY agent').all().map(r => ({ agent: r.agent, tools: JSON.parse(r.tools), createdAt: r.created_at }));

// 请求头 Authorization: Bearer <凭据> → { agent, tools }；没带或对不上返回 null。
export function authenticateAgent(db, req) {
  const m = /^Bearer (wdk_[A-Za-z0-9_-]{43})$/.exec(req.headers?.authorization || '');
  const row = m && db.prepare('SELECT agent,tools FROM agent_access WHERE token_sha256=?').get(sha256(m[1]));
  return row ? { agent: row.agent, tools: JSON.parse(row.tools) } : null;
}

export function recordAgentCall(db, { agent, tool, caller, status, error }) {
  db.prepare('INSERT INTO agent_calls (agent,tool,caller,status,error,at) VALUES (?,?,?,?,?,?)')
    .run(agent, tool, JSON.stringify(caller ?? {}), status, error ?? null, new Date().toISOString());
}
