# Changelog

## [0.1.0] — 2026-11-14

首个 ZCode 原生版本，自 [dsh-expert-orchestrator](https://github.com/mario841859784/dsh-expert-orchestrator) v2.14.2 移植（M1+M2 范围）。

### M1 — 最小可用编排

- ZCode 插件 manifest（`.zcode-plugin/plugin.json`）：skills + agents + commands 三组件。
- 协议 SKILL.md 移植：分诊三级、五锚自检、PM 三段式规划（草案→批准→spawn）、执行编排、分级交付门禁、经验池沉淀；召唤缝改写为 ZCode Agent 工具派发（`expert-orchestrator:<slug>` 子代理）。
- 11 位内置专家 codegen 为插件 agents（frontmatter `tools` 白名单=结构性递归防护）；自定义/项目层专家走 general-purpose + persona 注入 fallback 通道。
- `/expert-<slug>` 手势命令 ×11（persona 三层加载链：项目 `.zcode/experts/` → 全局 `~/.zcode/expert-orchestrator/experts/` → 插件内置）。
- origin-chain 链路溯源（协议层）：任务书末行标记，重复 (专家, cwd) 对拒绝。

### M2 — 状态与防护

- 零依赖 Python 工具打包（字节级与上游一致）：taskboard.py（依赖 DAG 任务板）、bus.py（消息总线）、_ed25519.py（Ed25519 签名）。
- PreToolUse hook：Agent 派发前 origin-chain 兜底执法（`ZCODE_EXPERT_ORIGIN_CHAIN='0'` 关闭）。
- PostToolUse hook：路由遥测落盘 `.expert-routing/samples.jsonl`（`ZCODE_EXPERT_ROUTE_TELEMETRY='0'` 关闭）。
- expert-profiles 协议级支持（全局 `~/.zcode/expert-orchestrator/` + 项目层 `<cwd>/.zcode/`）。
- 同步校验与跨仓拉取脚本（verify-zcode-sync.mjs / sync-from-dsh.mjs）。

### 明确不做（M3 及以后另立排期）

外部专家源打包、MCP/A2A 导出注册、成本/预算/振荡等高级模块缝合、auto-claim/idle-reclaim、Web 设置面板。
