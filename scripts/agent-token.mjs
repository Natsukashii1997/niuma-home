// 智能体凭据管理（workdesk MCP）：签发 / 轮换、撤销、列出。数据目录取 WORKDESK_DATA_DIR，不带时是当前目录下的开发库 data/；操作正式数据要显式指定（docs/OPERATIONS.md「数据目录」）。
//   node scripts/agent-token.mjs issue <agent> <工具,工具> [--write-env <.env 路径>]
//   node scripts/agent-token.mjs revoke <agent>
//   node scripts/agent-token.mjs list
// 签发时给了 --write-env，凭据写进该文件的 WORKDESK_AGENT_TOKEN 一行（文件权限 600），屏幕上不显示；否则只打印一次。
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { openDb } from '../server/db.mjs';
import { AGENT_TOOLS } from '../server/agent-tools.mjs';
import { issueAgentToken, listAgents, revokeAgent } from '../server/agent-access.mjs';

const [command, agent, toolArg, ...rest] = process.argv.slice(2);
const fail = message => { console.error(message); process.exit(1); };
const db = openDb();

if (command === 'list') {
  for (const a of listAgents(db)) console.log(`${a.agent}\t${a.tools.join(',')}\t签发于 ${a.createdAt}`);
} else if (command === 'revoke' && agent) {
  console.log(revokeAgent(db, agent) ? `已撤销 ${agent}` : `没有 ${agent} 的凭据`);
} else if (command === 'issue' && /^[a-z][a-z0-9-]{1,31}$/.test(agent || '') && toolArg) {
  const tools = toolArg.split(',').map(t => t.trim()).filter(Boolean);
  const unknown = tools.filter(t => !AGENT_TOOLS[t]);
  if (unknown.length) fail(`没有这些工具：${unknown.join(', ')}；可选：${Object.keys(AGENT_TOOLS).join(', ')}`);
  const envIndex = rest.indexOf('--write-env');
  const envPath = envIndex >= 0 ? rest[envIndex + 1] : null;
  if (envIndex >= 0 && !envPath) fail('--write-env 后面要给 .env 文件路径');
  const token = issueAgentToken(db, agent, tools);
  if (envPath) {
    const lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split('\n').filter(l => !l.startsWith('WORKDESK_AGENT_TOKEN=')) : [];
    while (lines.length && lines.at(-1) === '') lines.pop();
    writeFileSync(envPath, `${[...lines, `WORKDESK_AGENT_TOKEN=${token}`].join('\n')}\n`, { mode: 0o600 });
    chmodSync(envPath, 0o600);
    console.log(`已签发 ${agent}（${tools.join(',')}），凭据已写入 ${envPath}`);
  } else {
    console.log(token);
  }
} else {
  fail('用法：issue <agent> <工具,工具> [--write-env <路径>] | revoke <agent> | list');
}
