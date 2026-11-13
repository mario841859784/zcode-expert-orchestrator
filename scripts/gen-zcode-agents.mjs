#!/usr/bin/env node
// gen-zcode-agents.mjs — 从插件内 canonical persona（experts/*.md）生成：
//   agents/<name>.md    ZCode 插件子代理（frontmatter tools 白名单 = 结构性递归防护）
//   commands/expert-<name>.md  /expert-<name> 用户手势命令（persona 三层加载链）
// 纪律沿上游 dsh-expert-orchestrator 的 gen-preset-declaration.mjs：
//   生成器确定性、personas 为唯一事实源、--check 幂等校验零漂移。
// 用法：node scripts/gen-zcode-agents.mjs [--check] [--plugin <插件根目录>]

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');
const pluginIdx = process.argv.indexOf('--plugin');
const PLUGIN_DIR = pluginIdx >= 0
  ? resolve(process.argv[pluginIdx + 1])
  : join(REPO_ROOT, 'plugins', 'expert-orchestrator');
const EXPERTS_DIR = join(PLUGIN_DIR, 'skills', 'expert-orchestration', 'experts');
const AGENTS_DIR = join(PLUGIN_DIR, 'agents');
const COMMANDS_DIR = join(PLUGIN_DIR, 'commands');

// 每专家派发面：tools 白名单（不含 Agent——子代理结构性无法再派发）。
// 写型执行/测试/分析/文档 → 全量；只读评审/审计/规划 → 无 Edit/Write（任务板与 bus 经 Bash 照常可用）。
const DISPATCH = {
  'backend-engineer': ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
  'code-reviewer': ['Read', 'Bash', 'Glob', 'Grep'],
  'data-analyst': ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
  'devops-engineer': ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
  'frontend-engineer': ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
  'generalist': ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
  'product-designer': ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
  'project-manager': ['Read', 'Bash', 'Glob', 'Grep'],
  'qa-test-engineer': ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
  'security-auditor': ['Read', 'Bash', 'Glob', 'Grep'],
  'tech-writer': ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
};

function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error('persona 缺少 frontmatter');
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { fm, body: m[2] };
}

function personaBody({ fm, body }) {
  const hasMethod = typeof fm.method === 'string' && fm.method.startsWith('expert-methods/');
  const cut = hasMethod ? body.indexOf('<!-- methods-cut -->') : -1;
  const slim = cut >= 0 ? body.slice(0, cut).trim() : body.trim();
  const tail = hasMethod
    ? `\n\n领域方法论全文位于任务书「领域方法论」字段给出的路径（编排者随任务书提供 <技能目录>/expert-methods/${fm.name}.md 绝对路径）；任务复杂或触及方法论清单场景时先 Read 再动手；任务书未附时向编排者索取后再动手。`
    : '';
  return slim + tail;
}

function agentFile(fm, body) {
  const desc = `${fm.title}（${fm.name}）——专家编排内置专家（bundled-core）。适用：${fm['适用任务'] ?? ''}。禁入：${fm['禁入任务'] ?? '无'}。由编排者经 Agent 工具派发（subagent_type: expert-orchestrator:${fm.name}）；persona 已随本系统提示注入。`;
  return `---\nname: ${fm.name}\ndescription: "${desc}"\ntools: [${DISPATCH[fm.name].join(', ')}]\n---\n\n${body}\n`;
}

function commandFile(fm) {
  return `---
description: ${fm.title}（${fm.name}）——用户手势 /expert-${fm.name} 的确定性 persona 加载指令（用户显式触发，非模型自主调用）。
argument-hint: "[任务描述（可选）]"
---

# /expert-${fm.name} → ${fm.title}（bundled-core：${fm.name}）

立即按下列顺序解析你的 persona 全文——确定性加载链（项目 > 全局 > 内置，仅按 name 精确匹配；命中即停）：

1. 项目层：读取 \`<当前工作目录>/.zcode/experts/${fm.name}.md\`（存在 → 跳到第 4 步）。
2. 全局层：读取 \`~/.zcode/expert-orchestrator/experts/${fm.name}.md\`（存在 → 跳到第 4 步）。
3. 内置兜底：读取本插件技能目录下 \`skills/expert-orchestration/experts/${fm.name}.md\`（本会话已加载 expert-orchestration 技能时，其 Base directory 即该技能目录；否则从 设置→插件 打开 expert-orchestrator 详情定位安装路径）。
4. 以读得文件的 frontmatter 之后全文为你的 persona（角色、工作方式、交付要求）；frontmatter 的 \`method\` 键指向方法论深读区（同技能目录 \`expert-methods/${fm.name}.md\`）时，按 persona 内指引按需读取。
5. 三层全部未命中：明确回复「/expert-${fm.name} persona 加载失败（项目/全局/内置三层均未命中）」并停止——禁止凭记忆模拟专家。

加载成功后即以该 persona 执行任务；下方无任务内容时，回复「${fm.title}已就位，请下达任务」。

$ARGUMENTS
`;
}

if (!existsSync(EXPERTS_DIR)) {
  console.error(`找不到 persona 目录：${EXPERTS_DIR}`);
  process.exit(2);
}
const names = readdirSync(EXPERTS_DIR).filter((f) => f.endsWith('.md')).sort();
const plan = [];
for (const file of names) {
  const parsed = parseFrontmatter(readFileSync(join(EXPERTS_DIR, file), 'utf8'));
  const name = parsed.fm.name || file.replace(/\.md$/, '');
  if (!DISPATCH[name]) {
    console.error(`persona ${name} 无派发面配置（scripts/gen-zcode-agents.mjs DISPATCH 表）——新增内置专家须同步更新该表`);
    process.exit(2);
  }
  plan.push({ name, agent: agentFile(parsed.fm, personaBody(parsed)), command: commandFile(parsed.fm) });
}

const writes = [];
for (const { name, agent, command } of plan) {
  writes.push([join(AGENTS_DIR, `${name}.md`), agent]);
  writes.push([join(COMMANDS_DIR, `expert-${name}.md`), command]);
}

let dirty = 0;
for (const [path, content] of writes) {
  const prev = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (prev === content) continue;
  dirty++;
  if (checkOnly) {
    console.error(`漂移：${path}`);
  } else {
    writeFileSync(path, content);
    console.log(`写入：${path}`);
  }
}
const total = writes.length;
if (checkOnly) {
  if (dirty) {
    console.error(`--check 失败：${dirty}/${total} 个生成物与 persona 不同步——重跑 node scripts/gen-zcode-agents.mjs 后再验证`);
    process.exit(1);
  }
  console.log(`--check 通过：${total} 个生成物（agents ${plan.length} + commands ${plan.length}）与 persona 零漂移`);
} else {
  console.log(`生成完成：agents ${plan.length} + commands ${plan.length}`);
}
