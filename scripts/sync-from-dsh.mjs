#!/usr/bin/env node
// sync-from-dsh.mjs — 显式跨仓拉取：从上游 dsh-expert-orchestrator 检出同步可移植资产。
//
// 同步集（单向，ZCode 仓库为 canonical 之后的演进点）：
//   experts/*.md、routing.md、roster-aliases.json、lessons.md、expert-methods/*.md、
//   tools/{taskboard.py,bus.py,_ed25519.py}（字节级）。
// 不同步（已分叉或属 M3）：
//   SKILL.md（本仓已按 ZCode 缝改写）、source-registry.json 与 mcp/a2a 工具（M3）、
//   tools/.npmignore、tools/__pycache__。
//
// 本地补丁（同步后重放，防 ZCode 校验器误报；补丁锚点缺失即失败上报）：
//   L1: expert-methods/tech-writer.md —— 上游行文「把 TODO/计划中当已支持写进文档」含
//       裸词 TODO，ZCode 插件校验器的占位符规则（\bTODO\b）会误报 Unresolved placeholder；
//       本仓改词为「『计划中/待实现』」。语义不变，属校验器适配非内容改写。
//
// 用法：node scripts/sync-from-dsh.mjs [--dsh-repo <上游检出>] [--check]
// --check 只报告差异不落盘。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const PLUGIN = join(REPO_ROOT, 'plugins', 'expert-orchestrator');
const SKILL = join(PLUGIN, 'skills', 'expert-orchestration');
const checkOnly = process.argv.includes('--check');
const dshIdx = process.argv.indexOf('--dsh-repo');
const DSH = dshIdx >= 0
  ? resolve(process.argv[dshIdx + 1])
  : resolve(REPO_ROOT, '..', 'dsh-expert-orchestrator');

if (!existsSync(DSH)) {
  console.error(`上游检出不存在：${DSH}（用 --dsh-repo 指定 dsh-expert-orchestrator 检出路径）`);
  process.exit(2);
}
const dshSkill = join(DSH, 'skills', 'expert-orchestration');
if (!existsSync(dshSkill)) {
  console.error(`上游技能目录不存在：${dshSkill}`);
  process.exit(2);
}

const COPIES = [];
for (const f of readdirSync(join(dshSkill, 'experts')).filter((f) => f.endsWith('.md')).sort()) {
  COPIES.push([join(dshSkill, 'experts', f), join(SKILL, 'experts', f)]);
}
for (const f of ['routing.md', 'roster-aliases.json', 'lessons.md']) {
  COPIES.push([join(dshSkill, f), join(SKILL, f)]);
}
for (const f of readdirSync(join(DSH, 'expert-methods')).filter((f) => f.endsWith('.md')).sort()) {
  COPIES.push([join(DSH, 'expert-methods', f), join(SKILL, 'expert-methods', f)]);
}
for (const f of ['taskboard.py', 'bus.py', '_ed25519.py']) {
  COPIES.push([join(dshSkill, 'tools', f), join(SKILL, 'tools', f)]);
}

// 本地补丁表（同步后重放）。锚点唯一命中，缺失即失败（上游行文变更须人工复核补丁）。
const PATCHES = [
  {
    id: 'L1-tech-writer-todo-word',
    file: join(SKILL, 'expert-methods', 'tech-writer.md'),
    from: '把 TODO/计划中当已支持写进文档。',
    to: '把『计划中/待实现』条目当已支持写进文档。',
  },
];

let changed = 0, identical = 0, patched = 0;
const patchByDst = new Map(PATCHES.map((p) => [p.file, p]));
for (const [src, dst] of COPIES) {
  if (!existsSync(src)) {
    console.error(`上游源缺失：${src}`);
    process.exit(2);
  }
  let a = readFileSync(src, 'utf8');
  // 补丁感知比对：带本地补丁的文件以「上游内容+补丁」为期望值——本地改词不算漂移；
  // 上游锚点消失说明行文已变更，须人工复核补丁表。
  const p = patchByDst.get(dst);
  if (p) {
    if (a.includes(p.from)) a = a.split(p.from).join(p.to);
    else if (!a.includes(p.to)) {
      console.error(`本地补丁 ${p.id} 锚点在上游已不存在（上游行文变更，人工复核 scripts/sync-from-dsh.mjs 补丁表）`);
      process.exit(1);
    }
  }
  const b = existsSync(dst) ? readFileSync(dst, 'utf8') : null;
  if (a === b) { identical++; continue; }
  changed++;
  if (!checkOnly) writeFileSync(dst, a);
}
if (!checkOnly) {
  for (const p of PATCHES) {
    let text = readFileSync(p.file, 'utf8');
    const n = text.split(p.from).length - 1;
    if (n !== 1) {
      console.error(`本地补丁 ${p.id} 锚点命中 ${n} 次（期望 1）——上游行文已变更，人工复核后更新 scripts/sync-from-dsh.mjs 补丁表`);
      process.exit(1);
    }
    if (text.includes(p.to)) { /* 已打过，幂等 */ continue; }
    writeFileSync(p.file, text.replace(p.from, p.to));
    patched++;
  }
}

const mode = checkOnly ? '预检' : '同步';
console.log(`${mode}完成：上游 ${DSH}`);
console.log(`  拷贝集 ${COPIES.length} 项：内容不同 ${changed}${checkOnly ? '（--check 未落盘）' : '（已写入）'}、已一致 ${identical}、本地补丁重放 ${patched}`);
console.log('  不同步：SKILL.md（本仓已分叉）、source-registry.json 与 mcp/a2a 工具（M3）、tools/.npmignore、__pycache__');
if (checkOnly && changed) process.exit(1);
