import { json, readJson, route } from '../http.mjs';
import { AGENT_TOOLS } from '../agent-tools.mjs';
import { authenticateAgent, recordAgentCall } from '../agent-access.mjs';

// 智能体接入（workdesk MCP 走这里，docs/API.md「智能体接入」）：凭据认 agent，按 agent 的工具清单授权，
// 每次调用连同提问人（caller，由 agent 一侧可信地填入）记进 agent_calls。没有提问人的调用一律拒绝。
const unauthorized = res => json(res, 401, { error: '智能体凭据缺失或无效', code: 'AGENT_UNAUTHORIZED' });
const validCaller = c => c && typeof c === 'object' && !Array.isArray(c) && typeof c.userId === 'string' && c.userId.trim() !== '';

export function agentRoutes(db, services) {
  return [
    route('GET', '/api/v3/agent/tools', (req, res) => {
      const agent = authenticateAgent(db, req);
      if (!agent) return unauthorized(res);
      json(res, 200, { agent: agent.agent, tools: agent.tools.filter(name => AGENT_TOOLS[name]).map(name => ({ name, description: AGENT_TOOLS[name].description, inputSchema: AGENT_TOOLS[name].inputSchema })) });
    }),
    route('POST', '/api/v3/agent/tools/:tool', async (req, res, { params: { tool } }) => {
      const agent = authenticateAgent(db, req);
      if (!agent) { req.resume(); return unauthorized(res); }
      let body;
      try { body = await readJson(req); } catch { body = null; }
      const caller = body?.caller;
      const reply = (status, payload) => {
        recordAgentCall(db, { agent: agent.agent, tool, caller, status, error: payload.error });
        json(res, status, payload);
      };
      if (!body || typeof body !== 'object') return reply(400, { error: '请求内容不是有效 JSON', code: 'BAD_REQUEST' });
      if (!AGENT_TOOLS[tool]) return reply(404, { error: `没有这个工具：${tool}`, code: 'TOOL_UNKNOWN' });
      if (!agent.tools.includes(tool)) return reply(403, { error: `${agent.agent} 没有 ${tool} 的权限`, code: 'TOOL_FORBIDDEN' });
      if (!validCaller(caller)) return reply(400, { error: '缺少提问人身份（caller.userId），不处理', code: 'CALLER_REQUIRED' });
      try { reply(200, { result: await AGENT_TOOLS[tool].run(body.arguments ?? {}, services) }); }
      catch (error) {
        if (!error.status) console.error(error);
        reply(error.status || 500, { error: error.status ? error.message : '读取失败，详情见服务日志', code: error.code || 'TOOL_FAILED' });
      }
    }),
  ];
}
