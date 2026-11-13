# ZCode 移植 · M1 留痕（最小可用编排）

- 日期：2026-11-14；源版本：dsh-expert-orchestrator v2.14.2；目标：expert-orchestrator v0.1.0（ZCode 原生插件，本仓库）。

## 移植决策（缝映射）

| DSH 面 | ZCode 面 | 落点 |
|---|---|---|
| cordis.patch.yml / dsh.plugin.json / preset 注入 | `.zcode-plugin/plugin.json`（skills+agents+commands+hooks 四组件） | manifest |
| `summon_expert` / `summon_experts` 工具 | Agent 工具派发 `subagent_type: expert-orchestrator:<slug>`；批量=同消息多调用（≤8、部分成功） | SKILL.md §3 |
| `list_experts` 工具 | 协议化：列 `experts/` 读 frontmatter + roster-aliases.json 惯用名 | SKILL.md §3/§6 |
| toolFilter deny 六项（lib 面） | agents `tools` 白名单（结构性不含 Agent）+协议禁止再派发 | codegen DISPATCH 表 |
| origin-chain 标记（lib 自动追加/解析） | 编排者协议执行（追加/延伸/重复对拒绝）+ PreToolUse hook 兜底 deny | SKILL.md §3/§5 + hooks/ |
| expert persona 注入（sanitizePersona） | 分层专家=瘦 persona+method 指针（codegen 静态）；非分层=全文；fallback=general-purpose+persona 注入 | codegen |
| /expert- 手势（宿主 pre-step 注入） | `commands/expert-<slug>.md` ×11（用户显式触发） | codegen |
| `~/.dsh` 部署根/文件层 | `~/.zcode/expert-orchestrator/`（全局）+ `<cwd>/.zcode/experts/`（项目） | SKILL.md §6 |
| `DSH_EXPERT_*` lib 面开关 | `ZCODE_EXPERT_*`（两族命名：taskboard.py 面沿上游名） | SKILL.md §9 速查 |

## 断然不移植（如实记录）

- Web 设置面板（lib/client.js / remote.js / host-settings.js）——ZCode 无对应缝，永久不做。
- lib 侧工具级执法缝：auto-claim 派发入口、idle-edge 续领、cwd-lock、断点续跑（continuation）——无宿主缝即不假实现（上游 direction2 纪律）；协议纪律文本保留、责任归编排者，env 缝在开关速查标注「不适用」。
- 外部专家源（source-registry 62 源）、MCP/A2A 导出、成本/振荡/fail-loop 的 lib 消费面——M3。

## 导入集与分叉点

- 逐字导入：experts/*.md ×11、routing.md、roster-aliases.json、lessons.md、EXPERTS.md、expert-methods/*.md、tools/{taskboard.py,bus.py,_ed25519.py}（字节级，V8 自测锚定）。
- SKILL.md：317 行上游底版 + 约 45 处缝手术（§3 召唤/递归防护、§3.1 单态化、§6 路径链与档案生效面、§7 PM 面收拢 bundled、§9 env 两族与 M3 注记）；PM 名收拢为 bundled `project-manager`（上游「高级项目经理/项目推进专员」为 agency 花名册名）。
- 本地补丁 L1：expert-methods/tech-writer.md 裸词「TODO」触发 ZCode 校验器占位符误报，改词「『计划中/待实现』」（sync-from-dsh 补丁表重放）。

## 生成纪律

`scripts/gen-zcode-agents.mjs`：persona 为唯一事实源，确定性生成 agents ×11（frontmatter tools 白名单：写型全量、code-reviewer/security-auditor/project-manager 无写工具、全员无 Agent 工具）与 commands ×11；`--check` 幂等校验。persona 变更后必须重跑生成并经市场刷新更新插件（SKILL.md §6 明示）。

## 验证数据（M1 收口时点）

- `npm test`：14/14 pass / 0 fail（test/zcode-port.selftest.mjs）。
- `node scripts/gen-zcode-agents.mjs --check`：22 个生成物零漂移。
- 校验器占位符全扫描：0 命中；upsert-dev-marketplace.mjs 通过（marketplaceId dev-zcode-expert-orchestrator-89943207）。
