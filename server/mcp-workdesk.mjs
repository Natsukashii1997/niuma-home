#!/usr/bin/env node
// workdesk MCP（stdio，一行一条 JSON-RPC）：给 Hermes 等智能体用的牛马之家接口，docs/API.md「智能体接入」。
// 本进程只做协议转换：工具清单、授权和调用记录都在牛马之家服务端（/api/v3/agent/*）。
// 环境变量：WORKDESK_AGENT_TOKEN（必填，scripts/agent-token.mjs 签发）、WORKDESK_URL（默认 http://127.0.0.1:5280）。
// 提问人：agent 一侧在调用参数里放 _caller（Hermes 由插件按飞书发送人填入，覆盖模型自己写的），这里取出单独上送。
import { createInterface } from 'node:readline';

const base = (process.env.WORKDESK_URL || 'http://127.0.0.1:5280').replace(/\/$/, '');
const token = process.env.WORKDESK_AGENT_TOKEN || '';
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

async function api(method, path, body) {
  const res = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, ...(body && { 'content-type': 'application/json' }) }, ...(body && { body: JSON.stringify(body) }) });
  const data = await res.json().catch(() => ({ error: `牛马之家返回了非 JSON 内容（HTTP ${res.status}）` }));
  return { ok: res.ok, status: res.status, data };
}

const handlers = {
  initialize: ({ protocolVersion } = {}) => ({ protocolVersion: VERSIONS.includes(protocolVersion) ? protocolVersion : VERSIONS[0], capabilities: { tools: {} }, serverInfo: { name: 'workdesk', version: '1.0.0' } }),
  ping: () => ({}),
  async 'tools/list'() {
    const { ok, data } = await api('GET', '/api/v3/agent/tools');
    if (!ok) throw Object.assign(new Error(data.error || '读取工具清单失败'), { code: -32000 });
    return { tools: data.tools };
  },
  async 'tools/call'({ name, arguments: args = {} } = {}) {
    const { _caller, ...rest } = args && typeof args === 'object' ? args : {};
    const { ok, status, data } = await api('POST', `/api/v3/agent/tools/${encodeURIComponent(name)}`, { arguments: rest, caller: _caller });
    return ok ? { content: [{ type: 'text', text: JSON.stringify(data.result) }] }
      : { content: [{ type: 'text', text: `牛马之家拒绝或读取失败（HTTP ${status}）：${data.error}` }], isError: true };
  },
};

const send = message => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

createInterface({ input: process.stdin }).on('line', async line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: 'Parse error' } }); }
  if (msg.id === undefined) return; // 通知（notifications/initialized 等）不回
  const handler = handlers[msg.method];
  if (!handler) return send({ id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
  try { send({ id: msg.id, result: await handler(msg.params) }); }
  catch (error) { send({ id: msg.id, error: { code: error.code || -32603, message: error.message } }); }
});
