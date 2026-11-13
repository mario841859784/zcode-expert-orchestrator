# ZCode 移植 · M2 留痕（状态与防护）

- 日期：2026-11-14；承接 zcode-port-m1.md。

## Python 工具打包

- taskboard.py / bus.py / _ed25519.py 自上游 `skills/expert-orchestration/tools/` 字节级拷入（自测 V8 与上游检出逐字节 assert；上游不在位时跳过该项）。
- 未拷入：mcp_taskboard.py / a2a_taskboard.py（M3 导出面）、.npmignore、__pycache__。
- 工具面 env（`DSH_TASKBOARD_*` 与 taskboard 读的 `DSH_EXPERT_TOOL_BUDGET*`/`FAILLOOP*`/`ANTISTORM*`/`ATTEMPT_BIND_OWNER`/`PEER_OPEN_CAP`/`ESCALATION_LIMIT`）沿上游名不改——两族命名约定见 SKILL.md §9。

## Hooks（ZCode hooks.json 实证 schema：7 事件、matcher=工具名正则、process 类型 argv 最可移植、exit 2=PreToolUse deny、`${ZCODE_PLUGIN_ROOT}` 注入）

1. **PreToolUse（matcher Agent）** `hooks/origin-chain-guard.mjs`——派发前解析任务书末行 origin-chain 标记，重复 (n,c) 对 exit 2 deny（stderr 含完整链路）；`ZCODE_EXPERT_ORIGIN_CHAIN='0'/''` 关闭；fail-open：无 stdin/非 JSON/无标记/解析失败/形状异常一律放行。协议主执法面在编排者（SKILL.md §3/§5），hook 只做兜底。
2. **PostToolUse（matcher Agent）** `hooks/route-telemetry.mjs`——派发边界只读落盘 `.expert-routing/samples.jsonl`（vendor 自上游 lib/route-telemetry.js：仅 env 名改 `ZCODE_EXPERT_ROUTE_TELEMETRY`、告警前缀改名；样本形状 v1 稳定，usage 恒 null）。PostToolUse 缝拿不到 usage/stopReason/model/时长——相应字段照上游形状占位（如实边界）；ok=true（失败走 PostToolUseFailure，本 hook 不挂）。8MB 软顶、fail-open。
3. 聚合面：`scripts/routing-metrics.mjs`（上游同名脚本移植，import 改指 vendored 库）。

## expert-profiles（协议级）

- 全局 `~/.zcode/expert-orchestrator/expert-profiles.json` + 项目层 `<cwd>/.zcode/expert-profiles.json`；每次派发现场读，热改即生效。
- **生效面如实声明**：ZCode Agent 派发无 per-派发 model/tools 缝——`model`/`effort`/`mcp`/`skills` 为提示级（写进任务书）；`tools.allow/deny` 无运行时收窄缝（内置专家工具面收窄应改 agents frontmatter 并重跑 codegen）；无档案=零变化。

## 验证数据（M2 收口时点）

- `npm test`：**14/14 pass / 0 fail**（V1–V11：manifest、三面对齐、codegen 幂等、agents 白名单不含 Agent、SKILL 缝锚点、hooks 完整性、guard 纯函数+CLI 四态、遥测库+CLI 落盘/开关、Python 字节契约、市场条目一致、占位符全扫描、sync --check 补丁感知比对）。
- `node scripts/verify-zcode-sync.mjs`：V1–V8 全 ✓（含与上游 `/Users/mario/dsh-expert-orchestrator` Python 工具字节一致）。
- 上游仓库零触碰：`git -C /Users/mario/dsh-expert-orchestrator status --porcelain` = 0 项。
- hook 冒烟：guard 正常链 0 / 环路 2（完整链路报错）/ 开关 0；telemetry 落盘行形状与开关停写均实证。

## 已知边界（不包装）

- 遥测的 model/durationMs/stopReason 恒为占位值，直到 ZCode 暴露对应缝。
- origin-chain hook 只兜底 PreToolUse(Agent) 派发面；专家侧转派经 Bash 无法 hook，靠协议复制约定（上游同款边界：A2A/命令行不可执法面如实声明）。
- git commit-msg 门禁 hook（taskboard.py --install-hook）为用户显式安装项，与本插件 hooks 无耦合（沿上游降级语义）。
