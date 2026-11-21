// 全部接口的装配处：找某个接口，先在这里看它属于哪一组，再进对应的 routes/*.mjs。
// 每个路由组一行；几个组共用的服务（时间线、项目、带教、知识库、留学之声、首页待办）只在这里建一次。
// 没匹配上的请求由 http.mjs 的 unmatched 处理，不在这张表里。
import { routes as marketingRoutes } from './routes/marketing.mjs';
import { routes as assistantRoutes } from './routes/assistants.mjs';
import { routes as internalVoiceRoutes } from './routes/internal-voice.mjs';
import { workspaceRoutes } from './routes/workspace.mjs';
import { createUserServices, userRoutes } from './routes/user.mjs';
import { deliveryRoutes } from './routes/delivery.mjs';
import { projectRoutes } from './routes/projects.mjs';
import { mentorRoutes } from './routes/mentor.mjs';
import { kbRoutes } from './routes/kb.mjs';
import { agentRoutes } from './routes/agent.mjs';
import { routes as brandRoutes } from './routes/brand.mjs';
import { routes as campaignRoutes } from './routes/v3-marketing.mjs';
import { routes as selftalkRoutes } from './routes/selftalk.mjs';
import { routes as referenceRoutes } from './routes/references.mjs';
import { createProjectService } from './projects.mjs';
import { createMentorService } from './mentor.mjs';
import { createMentorPathService } from './mentor-path.mjs';
import { createKnowledgeTreeService } from './knowledge-tree.mjs';
import { createTodoReader } from './home-todo.mjs';
import { createVoiceReader } from './voice.mjs';
import { recordSource } from './source-status.mjs';

// 项目、带教、培养路径、知识库四个服务：页面路由、首页待办和智能体工具共用。
export function createProjectServices(db, options = {}) {
  return { projects: createProjectService(db, options.projects), mentor: createMentorService(db, options.mentor), mentorPath: createMentorPathService(db, options.mentorPath), kb: createKnowledgeTreeService(db, { staleWhileRevalidate: true, ...options.kb }) };
}

// 页面用的 /api/v3/* 接口，外加首页、日报周报、日历、设置的老接口（/api/reports、/api/calendar、/api/settings）。
// reportOptions、calendarOptions、options 只给测试替换外部读取用，正式运行都不传。
export function pageRoutes(db, reportOptions, calendarOptions, options = {}) {
  const voice = createVoiceReader(db, options.voice);
  const userServices = createUserServices(db, { ...options, timeline: { ...options.timeline, onSource: event => recordSource(db, 'timeline', event) } });
  const projectServices = createProjectServices(db, options);
  const todo = createTodoReader(db, { ...userServices, projects: projectServices.projects, ...options.todo });
  return [
    ...workspaceRoutes(db, reportOptions, calendarOptions, options, { voice, todo }), // 首页、日报周报、日历、设置、AI 接入、业务页、数据源状态
    ...userRoutes(userServices),                                 // 策略页：时间线、月度用户策略 v1 / v2、需求策略导出
    ...deliveryRoutes(db),                                       // 首页交付月四环节
    ...projectRoutes(projectServices),                           // 项目页
    ...mentorRoutes(projectServices),                            // 带教页
    ...kbRoutes(projectServices),                                // 飞书知识库页、Chrome 收藏插件
    ...agentRoutes(db, { ...projectServices, userStrategy: userServices.userStrategy, strategy: userServices.strategy }), // 外部 AI 经 workdesk MCP 进来（不是页面上的「Agent」页）
    ...brandRoutes(db, options.brand),                           // 品牌页
    ...campaignRoutes(db, options),                              // 营销页：价格档案、营销战役、设计 Brief
    ...selftalkRoutes(db, options.selftalk),                     // 自言自语
    ...referenceRoutes(db, options.refs),                        // 设计参考
  ];
}

// 服务入口用的完整路由表。
export function appRoutes(db) {
  return [
    ...marketingRoutes(db),      // 营销页老接口：促销表、方案原文、物料、NAS（/api/promos、/api/plans、/api/materials…）
    ...assistantRoutes(db),      // 页面上的「Agent」页：Codex 助手、ChatGPT 网页桥
    ...pageRoutes(db),
    ...internalVoiceRoutes(db),  // 内部原声（企微会话存档拉取）
  ];
}
