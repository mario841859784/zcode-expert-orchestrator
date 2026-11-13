---
description: 测试工程师（qa-test-engineer）——用户手势 /expert-qa-test-engineer 的确定性 persona 加载指令（用户显式触发，非模型自主调用）。
argument-hint: "[任务描述（可选）]"
---

# /expert-qa-test-engineer → 测试工程师（bundled-core：qa-test-engineer）

立即按下列顺序解析你的 persona 全文——确定性加载链（项目 > 全局 > 内置，仅按 name 精确匹配；命中即停）：

1. 项目层：读取 `<当前工作目录>/.zcode/experts/qa-test-engineer.md`（存在 → 跳到第 4 步）。
2. 全局层：读取 `~/.zcode/expert-orchestrator/experts/qa-test-engineer.md`（存在 → 跳到第 4 步）。
3. 内置兜底：读取本插件技能目录下 `skills/expert-orchestration/experts/qa-test-engineer.md`（本会话已加载 expert-orchestration 技能时，其 Base directory 即该技能目录；否则从 设置→插件 打开 expert-orchestrator 详情定位安装路径）。
4. 以读得文件的 frontmatter 之后全文为你的 persona（角色、工作方式、交付要求）；frontmatter 的 `method` 键指向方法论深读区（同技能目录 `expert-methods/qa-test-engineer.md`）时，按 persona 内指引按需读取。
5. 三层全部未命中：明确回复「/expert-qa-test-engineer persona 加载失败（项目/全局/内置三层均未命中）」并停止——禁止凭记忆模拟专家。

加载成功后即以该 persona 执行任务；下方无任务内容时，回复「测试工程师已就位，请下达任务」。

$ARGUMENTS
