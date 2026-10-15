# work-desk 协作约定（Codex / Claude 必读）

个人工作台，只有本人使用。需求以 [REQUIREMENTS.md](REQUIREMENTS.md) 为准，当前状态与唯一下一步见 [CURRENT.md](CURRENT.md)。所有面向用户的文字用简体中文。

## 分工

- **Claude**：结构与底层架构、视觉规范、派单、验收。只直接改小于约 30 行的精修。
- **Codex**：按派单（`docs/tasks/T*.md`）实现功能、补测试、回归、写交接。
- 流程：Claude 派单 → Codex 认领（在 CURRENT.md 标「进行中」）→ 实现 + 测试 + 截图 → 写交接 → Claude 验收（通过 / 返修清单）→ 用户最终验收。返修仍由 Codex 做。
- 一次只做一张派单；范围外的问题记进交接，不顺手修。

## 运行

```sh
npm install
npm run build && npm start      # http://127.0.0.1:5280
npm run dev                     # 开发页 http://127.0.0.1:5281，/api 转给 5280
npm test                        # 自动使用临时数据目录，不碰 data/
npm run import:feishu           # 一次性迁移旧飞书表（已执行过，可重复执行）
```

隔离数据：`WORKDESK_DATA_DIR=$(mktemp -d) PORT=5290 npm start`，再 `WORKDESK_API_PORT=5290 npm run dev`。默认数据目录 `data/` 是真实数据，测试不得写入。

## 结构（不要改动骨架）

```
server/
  index.mjs          HTTP 服务：静态文件 + /api 路由分发
  http.mjs           json / readJson / route / match / pending(task)
  db.mjs             全部表结构与查询；data/work-desk.db、data/images/
  routes/*.mjs       每个模块导出 routes(db) → route(...) 数组
src/
  App.jsx            左侧导航 + 模块登记（MODULES）
  router.js          #/ 路由：useRoute() / href()
  api.js             useApi(path, sample) / apiSend()
  constants.js       业务线、促销字段、月份工具
  samples.js         示例数据（接口 501 时显示）
  ui/components.jsx  公共组件
  ui/bitmap.jsx      位图风基础件：FlipNumber / DotMatrix / DitherBar / TypeText / StepProgress / PixelIcon / BitAvatar / dissolve
  assets/fonts/      Geist / Geist Mono / Geist Pixel（OFL）
  styles.css         设计变量 + 全部样式
  modules/<模块>/     各模块页面
docs/
  API.md             接口约定
  STYLE-GUIDE.md     视觉规范
  tasks/T*.md        派单
fixtures/            验收样例（飞书复制的方案原文）
```

## 规则

- **接口占位机制**：未实现的接口在路由里写 `pending("T0x")`，返回 501；前端 `useApi(path, sample)` 收到 501 时显示示例并标「示例 · T0x」。实现接口 = 把 `pending(...)` 换成真实处理函数，前端示例自动消失。实现后删掉 `samples.js` 里对应的示例。
- 未实现的按钮用 `<PendingButton task="T0x">`；实现时换成 `<Button>`。
- 接口路径与数据形状以 [docs/API.md](docs/API.md) 为准；需要改，先在交接里说明理由，由 Claude 更新文档。
- 表结构只在 `server/db.mjs` 的 SCHEMA 里改；已有列不改名、不删。
- 视觉以 [docs/STYLE-GUIDE.md](docs/STYLE-GUIDE.md)（v2 位图风）为准：新样式先用 `styles.css` 里的变量和已有类；图标只用 `PixelIcon`；动效只用 `src/ui/bitmap.jsx` 的按帧组件，不写 CSS transition。不引入 UI 框架、CSS-in-JS 或图标库。新增依赖须在交接里说明理由。
- 所有写入真实数据的操作必须「先预览、后确认」。
- 访问飞书一律用本机 `lark-cli`（`--as user`），不在代码里写 token。
- 只监听 127.0.0.1。

## 交接格式

完成一张派单后，在 CURRENT.md 的「交接记录」追加：

- 派单编号、完成日期
- 改了哪些文件（一句话说明各自做了什么）
- 测试：命令与结果（通过 / 失败数）
- 截图：放在 `docs/handoff/T0x/`，列出文件名
- 与派单不一致之处、遗留问题、范围外发现
