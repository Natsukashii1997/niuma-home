// T12 收藏接口的「合同替身」（只用于隔离验收界面和扩展，不是后端实现）：按 docs/API.md「知识库 · 快捷收藏（T12）」返回合成数据，
// 不调用 lark-cli、不访问任何外部地址。用链接里的文档 token 决定场景：
//   MktDoc001 唯一命中 · MultiDoc002 多命中取第一个 · NoHit003 无命中走兜底 · DupShort004 已有快捷方式 · InSpace005 原文就在空间里
//   CloudFile006 云盘来源（422）· NoPerm007 读不到（404）· Unknown008 结果不明（502，核对后为已建好）· Mismatch010 返回成功但本地记录不一致
// 也提供扩展配对码（来源校验）和设置键 kb_collect_rules（真实后端交付前设置接口还不认识这个键）。
import { randomBytes, randomUUID } from "node:crypto";
import { json, readJson, route } from "../../../../server/http.mjs";

const SPACE = "常浩的知识库（合成）";
const DEFAULT_RULES = [
  ["syn-mkt", "📢 营销策划", ["促销", "营销", "活动", "方案", "brief", "海报", "物料", "价格", "战役"]],
  ["syn-mentor", "👔 管培带教", ["管培", "带教", "轮岗", "成长", "日志"]],
  ["syn-timeline", "📅 用户时间线", ["时间线", "申请季", "截止", "用户旅程"]],
  ["syn-strategy", "🧭 策略思考", ["策略", "复盘", "分析", "规划", "思考"]],
  ["syn-product", "📦 产品文档", ["产品", "需求", "PRD", "功能", "版本"]],
  ["syn-ai", "🧪 AI实验室", ["AI", "模型", "Agent", "Claude", "Codex", "提示词"]],
  ["syn-misc", "🗃️ 杂项其他", []],
].map(([nodeToken, title, keywords]) => ({ nodeToken, title, keywords }));
const DOCS = {
  MktDoc001: { title: "双十一促销方案（合成）", objType: "docx", location: "我的文档库", parent: "" },
  MultiDoc002: { title: "AI 营销复盘（合成）", objType: "docx", location: "我的文档库", parent: "" },
  NoHit003: { title: "读书笔记：城市漫游（合成）", objType: "docx", location: "我的文档库", parent: "" },
  DupShort004: { title: "管培生第 3 周日志（合成）", objType: "docx", location: "我的文档库", parent: "", dup: { kind: "shortcut", parentTitle: "👔 管培带教" } },
  InSpace005: { title: "产品需求总表（合成）", objType: "sheet", location: SPACE, parent: "📦 产品文档", dup: { kind: "inSpace", parentTitle: "📦 产品文档" } },
  Unknown008: { title: "Agent 提示词笔记（合成）", objType: "docx", location: "我的文档库", parent: "" },
  Mismatch010: { title: "海报物料清单（合成）", objType: "docx", location: "我的文档库", parent: "" },
};
const err = (res, status, code, error, extra = {}) => json(res, status, { error, code, ...extra });

export function collectMock({ realSettings }) {
  let savedRules; // 未保存时用默认规则
  const rules = () => (savedRules ? JSON.parse(savedRules) : DEFAULT_RULES);
  const byRequest = new Map(), ops = new Map(), recent = [];
  let pairing = { code: randomBytes(32).toString("hex"), createdAt: new Date().toISOString() };
  const pairingPreviews = new Set();
  let seq = 0;
  const shortcutUrl = (id) => `https://synthetic.feishu.cn/wiki/SynShortcut${id}`;

  // 来源校验：扩展来源必须带对配对码；其他外来 Origin 一律拒绝；同源或无 Origin 照常。
  function guard(req, res, { allowExtension }) {
    const origin = req.headers.origin;
    if (!origin || origin === `http://${req.headers.host}`) return true;
    if (origin.startsWith("chrome-extension://") && allowExtension && req.headers["x-niuma-collect-code"] === pairing.code) return true;
    err(res, 403, "COLLECT_PAIRING_REQUIRED", origin.startsWith("chrome-extension://") && allowExtension ? "配对码不对，请到牛马之家「设置 → 扩展配对码」复制" : "不接受这个来源的请求");
    return false;
  }

  function classify(doc, target) {
    const text = `${doc.title} ${doc.parent}`.toLowerCase();
    const matched = rules().map((r) => ({ ...r, keywords: r.keywords.filter((k) => text.includes(k.toLowerCase())) })).filter((r) => r.keywords.length);
    if (target) return { parent: rules().find((r) => r.nodeToken === target), matched, reason: "chosen" };
    if (matched.length) return { parent: matched[0], matched, reason: matched.length === 1 ? "matched" : "first" };
    return { parent: rules().find((r) => !r.keywords.length), matched, reason: "fallback" };
  }

  async function collect(req, res) {
    if (!guard(req, res, { allowExtension: true })) return;
    const { url, requestId, targetNodeToken } = await readJson(req);
    if (byRequest.has(requestId)) { const [status, body] = byRequest.get(requestId); return json(res, status, body); }
    const done = (status, body) => { if (requestId) byRequest.set(requestId, [status, body]); json(res, status, body); };
    let u; try { u = new URL(url); } catch { return err(res, 400, "COLLECT_URL_INVALID", "不是飞书文档链接"); }
    const m = u.pathname.match(/^\/(wiki|docx|sheets|base|slides|mindnotes|file)\/([A-Za-z0-9]+)/);
    if (u.protocol !== "https:" || u.port || u.username || !/\.(feishu\.cn|larksuite\.com)$/.test(u.hostname) || !m) return err(res, 400, "COLLECT_URL_INVALID", "不是飞书文档链接");
    if (!/^[0-9a-f-]{36}$/.test(requestId || "")) return err(res, 400, "COLLECT_URL_INVALID", "缺少 requestId");
    const token = m[2];
    if (token === "CloudFile006") return done(422, { code: "COLLECT_SOURCE_UNSUPPORTED", error: "这篇在云盘里，暂不支持收藏快捷方式" });
    const doc = DOCS[token];
    if (!doc) return done(404, { code: "COLLECT_SOURCE_UNREADABLE", error: "读不到这篇文档：可能没有权限或已删除" });
    if (targetNodeToken && !rules().some((r) => r.nodeToken === targetNodeToken)) return done(400, { code: "COLLECT_TARGET_INVALID", error: "所选目录不在规则表里" });
    const open = [...ops.values()].find((o) => o.token === token && o.status === "unknown");
    if (open) return done(409, { code: "COLLECT_PENDING", error: "这篇上次收藏结果不明，先核对", receipt: { operationId: open.operationId, status: "unknown" } });
    const at = new Date().toISOString(), operationId = `col-${++seq}`;
    const base = { operationId, title: doc.title, objType: doc.objType, location: doc.location, at };
    const prior = [...ops.values()].find((o) => o.token === token && o.status === "ok");
    if (doc.dup || prior) {
      const parentTitle = doc.dup?.parentTitle || prior.parentTitle, link = prior?.url || shortcutUrl(`Dup${token}`);
      recent.unshift({ operationId, title: doc.title, parentTitle, url: link, status: "duplicate", at });
      return done(200, { ...base, status: "duplicate", duplicateKind: doc.dup?.kind || "shortcut", parentNodeToken: "syn-dup", parentTitle, url: link, reason: "matched", matched: [] });
    }
    const { parent, matched, reason } = classify(doc, targetNodeToken);
    const op = { operationId, token, title: doc.title, parentTitle: parent.title, nodeToken: `SynShortcut${seq}`, url: shortcutUrl(seq), at, status: "ok" };
    if (token === "Unknown008") {
      ops.set(operationId, { ...op, status: "unknown", url: undefined });
      recent.unshift(ops.get(operationId));
      return done(502, { code: "COLLECT_RESULT_UNKNOWN", error: "已提交创建，但回读超时，结果不明", receipt: { operationId, status: "unknown" } });
    }
    ops.set(operationId, op);
    recent.unshift(token === "Mismatch010" ? { ...op, parentTitle: "🗃️ 杂项其他" } : op);
    done(200, { ...base, status: "created", parentNodeToken: parent.nodeToken, parentTitle: parent.title, url: op.url, reason, matched });
  }

  // 结果不明后的只读核对：合成场景里「其实已经建好了」。
  function reconcile(req, res, { params }) {
    const op = ops.get(params.id);
    if (!op) return err(res, 404, "KB_OPERATION_NOT_FOUND", "没有这条操作记录");
    if (op.status === "unknown") { op.status = "ok"; op.url = shortcutUrl(`Fixed${params.id}`); }
    const i = recent.findIndex((x) => x.operationId === params.id);
    if (i >= 0) recent[i] = op;
    json(res, 200, { operationId: params.id, state: "verified", completed: [op.nodeToken], remaining: [] });
  }

  // 设置：GET /api/v3/settings 走真实处理，再补上 kb_collect_rules；预览/保存只处理这个键。
  const settingPreviews = new Map();
  async function settingsGet(req, res, ctx) {
    const body = await realSettings(req, ctx);
    body.values = { ...body.values, kb_collect_rules: savedRules ?? JSON.stringify(DEFAULT_RULES) };
    if (savedRules !== undefined) body.saved = { ...body.saved, kb_collect_rules: savedRules };
    json(res, 200, body);
  }
  async function rulesPreview(req, res) {
    const { value } = await readJson(req);
    let arr; try { arr = JSON.parse(value); } catch { return err(res, 400, "SETTING_INVALID", "收藏规则必须是 JSON 数组"); }
    const known = new Set(DEFAULT_RULES.map((r) => r.nodeToken));
    if (!Array.isArray(arr) || arr.some((r) => !known.has(r.nodeToken))) return err(res, 400, "SETTING_INVALID", "目录必须是目标空间里真实存在的节点");
    const norm = JSON.stringify(arr.map((r) => ({ nodeToken: r.nodeToken, title: r.title, keywords: [...new Set(r.keywords.map((k) => k.trim()).filter(Boolean))] })));
    const pv = { previewId: `set-${++seq}`, key: "kb_collect_rules", before: savedRules ?? null, value: norm, expiresAt: new Date(Date.now() + 600000).toISOString() };
    settingPreviews.set(pv.previewId, pv);
    json(res, 200, pv);
  }
  async function rulesPut(req, res) {
    const { previewId, confirm: yes } = await readJson(req);
    const pv = settingPreviews.get(previewId);
    if (!yes || !pv) return err(res, 409, "SETTING_PREVIEW_STALE", "预览已失效");
    settingPreviews.delete(previewId);
    savedRules = pv.value;
    json(res, 200, { ok: true, key: "kb_collect_rules", value: savedRules });
  }

  return [
    route("POST", "/api/v3/kb/collect", collect),
    route("GET", "/api/v3/kb/collect/recent", (req, res) => json(res, 200, { items: recent.slice(0, 50).map(({ operationId, title, parentTitle, url, status, at }) => ({ operationId, title, parentTitle, url, status, at })) })),
    route("GET", "/api/v3/kb/collect/pairing", (req, res) => guard(req, res, { allowExtension: false }) && json(res, 200, pairing)),
    route("POST", "/api/v3/kb/collect/pairing/preview", (req, res) => { if (!guard(req, res, { allowExtension: false })) return; const previewId = randomUUID(); pairingPreviews.add(previewId); json(res, 200, { previewId, expiresAt: new Date(Date.now() + 600000).toISOString() }); }),
    route("POST", "/api/v3/kb/collect/pairing/rotate", async (req, res) => {
      if (!guard(req, res, { allowExtension: false })) return;
      const { previewId, confirm: yes } = await readJson(req);
      if (!yes || !pairingPreviews.delete(previewId)) return err(res, 409, "PAIRING_PREVIEW_STALE", "预览已失效");
      pairing = { code: randomBytes(32).toString("hex"), createdAt: new Date().toISOString() };
      json(res, 200, pairing);
    }),
    route("POST", "/api/v3/kb/operations/:id/reconcile", reconcile),
    route("GET", "/api/v3/settings", settingsGet),
    route("POST", "/api/settings/kb_collect_rules/preview", rulesPreview),
    route("PUT", "/api/settings/kb_collect_rules", rulesPut),
  ];
}
