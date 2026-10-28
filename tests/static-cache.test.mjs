import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Safari 网页应用恢复窗口会直接用磁盘里的旧首页；发布换了哈希后旧资源已不在，打开即黑屏。首页（含前端路由回落）必须 no-store。

test("首页与前端路由回落都是 no-store；带扩展名的构建文件不受影响", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "niuma-static-"));
  await mkdir(path.join(root, "dist/assets"), { recursive: true });
  await writeFile(path.join(root, "dist/index.html"), '<!doctype html><script type="module" src="/assets/index-abc.js"></script>');
  await writeFile(path.join(root, "dist/assets/index-abc.js"), "export {};");
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = spawn(process.execPath, [path.resolve("server/index.mjs")], {
    cwd: root,
    env: { ...process.env, PORT: String(port), WORKDESK_DATA_DIR: path.join(root, "data") },
    stdio: ["ignore", "pipe", "inherit"],
  });
  try {
    await new Promise((resolve, reject) => {
      server.stdout.on("data", (chunk) => String(chunk).includes(String(port)) && resolve());
      server.once("exit", (code) => reject(new Error(`服务提前退出：${code}`)));
    });
    const base = `http://127.0.0.1:${port}`;
    for (const url of ["/", "/marketing"]) {
      const res = await fetch(base + url);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-store", url);
    }
    const asset = await fetch(base + "/assets/index-abc.js");
    assert.equal(asset.status, 200);
    assert.notEqual(asset.headers.get("cache-control"), "no-store");
  } finally {
    server.kill();
    await rm(root, { recursive: true, force: true });
  }
});
