// T12 接线复测用的「合成 lark-cli」：注入到真实后端的 run 参数里，在进程内返回合成数据，不启动真实命令、不访问网络。
// 目标空间用默认 kb_collect_space 和默认规则目录 token（只是标识，回答全部是合成的）。来源场景按链接里的 token：
//   MktDoc001 唯一命中 · MultiDoc002 多命中 · NoHit003 无命中 · DupShort004 目标空间已有快捷方式 · InSpace005 原文就在目标空间
//   CloudFile006 云盘来源（131014）· NoPerm007 无权限 · Unknown008 创建后响应丢失（节点其实建好了）
import { COLLECT_RULES, COLLECT_SPACE } from "../../../../server/kb-collect-config.mjs";

const LIB = "7000000000000000999";
const node = (node_token, space_id, extra = {}) => ({ node_token, obj_token: `obj${node_token}`, obj_type: "docx", node_type: "origin", space_id, parent_node_token: "", title: node_token, has_child: false, ...extra });

export function createFakeLark() {
  const dirs = COLLECT_RULES.map((r) => node(r.nodeToken, COLLECT_SPACE, { title: r.title }));
  const byTitle = (t) => dirs.find((d) => d.title.includes(t)).node_token;
  const sources = [
    node("MktDoc001", LIB, { title: "双十一促销方案（合成）" }),
    node("nodeMulti002", LIB, { obj_token: "MultiDoc002", title: "AI 营销复盘（合成）" }),
    node("NoHit003", LIB, { title: "读书笔记：城市漫游（合成）" }),
    node("DupShort004", LIB, { title: "管培生第 3 周日志（合成）" }),
    node("nodeInSpace005", COLLECT_SPACE, { obj_token: "InSpace005", obj_type: "sheet", parent_node_token: byTitle("产品文档"), title: "产品需求总表（合成）" }),
    node("Unknown008", LIB, { title: "Agent 提示词笔记（合成）" }),
  ];
  const nodes = [...dirs, sources[4],
    node("synDupShortcut", COLLECT_SPACE, { node_type: "shortcut", obj_token: "objDupShort004", origin_node_token: "DupShort004", parent_node_token: byTitle("管培带教"), title: "管培生第 3 周日志（合成）" })];
  let created = 0;
  const ok = (data) => ({ stdout: JSON.stringify({ ok: true, identity: "user", data }) });
  const fail = (code, subtype) => { throw Object.assign(new Error("合成 CLI 错误"), { stderr: JSON.stringify({ error: { code, subtype } }) }); };
  const calls = [];

  async function run(command, args, options) {
    if (command !== "lark-cli" || args[0] !== "--profile" || args[1] !== "codex" || options?.shell !== false) throw new Error("合成 CLI：调用方式不对");
    calls.push(args.join(" "));
    const arg = (k) => args[args.indexOf(k) + 1];
    if (args.includes("whoami")) return { stdout: JSON.stringify({ profile: "codex", appId: "cli_aacf58ab61b85beb", identity: "user" }) };
    if (args.includes("+node-get")) {
      const id = arg("--node-token");
      if (id === "CloudFile006") fail(131014);
      if (id === "NoPerm007") fail(131006, "permission_denied");
      const n = [...nodes, ...sources].find((x) => x.node_token === id || x.obj_token === id);
      if (!n) fail(131005);
      return ok(n);
    }
    if (args.includes("spaces") && args.includes("get")) {
      const id = arg("--space-id");
      return ok({ space: id === LIB ? { space_id: id, name: "我的文档库", space_type: "my_library" } : { space_id: id, name: "常浩的知识库（合成）", space_type: "team" } });
    }
    if (args.includes("+node-list")) {
      const parent = args.includes("--parent-node-token") ? arg("--parent-node-token") : "";
      const list = nodes.filter((n) => n.space_id === arg("--space-id") && n.parent_node_token === parent).map((n) => ({ ...n, has_child: nodes.some((c) => c.parent_node_token === n.node_token) }));
      return ok({ nodes: list, has_more: false, page_token: "" });
    }
    if (args.includes("+node-create")) {
      const origin = [...sources].find((s) => s.node_token === arg("--origin-node-token"));
      const n = node(`synCreated${++created}`, arg("--space-id"), { node_type: "shortcut", obj_token: origin.obj_token, obj_type: origin.obj_type, origin_node_token: origin.node_token, parent_node_token: arg("--parent-node-token"), title: origin.title });
      nodes.push(n);
      if (origin.node_token === "Unknown008") throw new Error("合成：写成功但响应丢失");
      return ok({ resolved_space_id: arg("--space-id"), ...n });
    }
    throw new Error(`合成 CLI：未允许的调用 ${args.slice(2, 5).join(" ")}`);
  }
  return { run, calls, writes: () => calls.filter((c) => c.includes("+node-create")) };
}
