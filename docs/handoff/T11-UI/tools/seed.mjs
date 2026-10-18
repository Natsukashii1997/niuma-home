const B = "http://127.0.0.1:5293";
const call = async (m, p, body) => { const r = await fetch(B + p, { method: m, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${JSON.stringify(d)}`); return d; };
const ok = (pv) => ({ previewId: pv.previewId, confirm: true });
console.log("projects", (await call("GET", "/api/v3/projects")).map((p) => p.name));
for (const [name, basedOn] of [["本地 · 十一月院校复盘", "remote-a"], ["本地 · 轮岗试点", "remote-b"]]) {
  const pv = await call("POST", "/api/v3/local-projects/preview", { name, basedOn }); await call("POST", "/api/v3/local-projects/confirm", ok(pv));
}
for (const [name, start, end, review] of [["九月开学季", "2026-09-01", "2026-09-30", "转化达标，物料晚了两天。"], ["国庆冲刺", "2026-10-01", "2026-10-08", ""]]) {
  const c = await call("POST", "/api/v3/campaigns/current/preview", { name, start, end, desc: "合成战役" }); await call("PATCH", "/api/v3/campaigns/current", ok(c));
  if (review) { const r = await call("POST", "/api/v3/campaigns/current/preview", { review }); await call("PATCH", "/api/v3/campaigns/current", ok(r)); }
  const a = await call("POST", "/api/v3/campaigns/current/archive-preview"); await call("POST", "/api/v3/campaigns/current/archive", ok(a));
}
console.log("local", (await call("GET", "/api/v3/local-projects")).items.map((p) => p.name));
console.log("history", (await call("GET", "/api/v3/campaigns/history")).items.map((c) => c.name));
