# zcode-expert-orchestrator · 专家编排模式（Expert Orchestrator）

**多智能体编排 · PM 先行规划 · 专家委派 · 依赖 DAG 任务板 · 分级交付门禁 · 经验池沉淀**

一个 ZCode 原生插件：安装后，ZCode 获得一套「专家编排」工作方式——编排者自身不实现改动，而是对每条请求分诊，由项目经理专家先行规划，再把实施委派给最合适的领域专家，并以独立评审做交付门禁。本插件自 [dsh-expert-orchestrator](https://github.com/mario841859784/dsh-expert-orchestrator)（DeepSeek Harness 宿主，v2.14.2）移植，协议、专家库、任务板与消息总线与上游同源。

## 工作方式

- **每轮分诊**：大型任务（跨 ≥2 领域 / ≥3 产出物 / 目标模糊）先召 PM 规划——草案落板、批准后才派工；小型实施直接委派 1 名执行专家；只读操作编排者亲自完成。
- **委派而非动手**：实施一律派给 `expert-orchestrator:<slug>` 子代理（ZCode Agent 工具），编排者只做分诊、选人、门禁与整合。
- **任务板 + 消息总线**：两个零依赖 Python 工具（`taskboard.py` 依赖 DAG 事件溯源任务板、`bus.py` 信箱消息总线）落盘在项目工作区，跨会话以任务板为准。
- **分级交付门禁**：独立评审 ≠ 实施者，≤2 轮返工后上升 PM 检查点；小型实施免独立评审。
- **经验池**：按专家沉淀教训（`.expert-lessons/`），派发时自动注入（≤2000 字符）。
- **递归防护双层**：内置专家 agents 的 `tools` 白名单天然不含 Agent 工具（子代理无法再派发）；任务书末行 origin-chain 标记拒绝 A→B→A 环路，PreToolUse hook 兜底执法。

## 内置专家（11 位，bundled-core）

后端工程师 · 前端工程师 · 代码评审 · 测试工程师 · 安全审计 · 数据分析师 · 运维工程师 · 产品设计 · 项目经理 · 技术写作 · 通用执行（兜底）。明细见 [插件内 EXPERTS.md](plugins/expert-orchestrator/skills/expert-orchestration/EXPERTS.md)。

自定义与项目层专家（`<cwd>/.zcode/experts/*.md`、`~/.zcode/expert-orchestrator/experts/*.md`）通过 general-purpose + persona 注入通道委派，与内置专家同一套协议。

## 安装（本地测试市场）

1. 在 ZCode 中打开 **插件市场 → 添加 → 添加插件市场**，粘贴本仓库的 `plugins/` 目录（内含 `marketplace.json`）。
2. 在 **个人 → 〈市场名〉** 找到「专家编排模式 / Expert Orchestrator」，点击 **安装**。
3. 新建任务，在 composer 中选用该插件的 `expert-orchestration` 技能，发送实施类请求即可触发编排。

## 目录结构

```
plugins/
  marketplace.json                     # 本地测试市场清单
  expert-orchestrator/                 # 插件源码（目录名 = manifest name）
    .zcode-plugin/plugin.json
    agents/<slug>.md ×11               # codegen 产物（gen-zcode-agents.mjs）
    commands/expert-<slug>.md ×11      # /expert- 手势命令
    skills/expert-orchestration/       # 编排协议 + 专家库 + Python 工具
    hooks/                             # origin-chain 兜底 + 路由遥测
scripts/
  gen-zcode-agents.mjs                 # 从 experts/*.md 生成 agents 与 commands
  verify-zcode-sync.mjs                # 结构/同步校验
  sync-from-dsh.mjs                    # 显式拉取上游 dsh-expert-orchestrator 的 persona 更新
test/                                  # node:test 自测
docs/internal/                         # 改造留痕
```

## 与上游（DSH 宿主版）的边界

- **同源**：11 位 persona、routing.md、roster-aliases.json、lessons.md、taskboard.py/bus.py/_ed25519.py（字节级一致，含 `DSH_TASKBOARD_*` 环境变量名）。
- **换缝**：cordis 声明 → ZCode manifest；`summon_*` 工具 → Agent 工具派发；toolFilter deny → agents `tools` 白名单；`~/.dsh` → `~/.zcode/expert-orchestrator/`；编排层开关 `DSH_EXPERT_*` → `ZCODE_EXPERT_*`。
- **不做**（M3 及以后另立排期）：外部专家源打包、MCP/A2A 导出注册、成本/预算/振荡等高级模块缝合、auto-claim/idle-reclaim、Web 设置面板。

## License

MIT（见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)）。
