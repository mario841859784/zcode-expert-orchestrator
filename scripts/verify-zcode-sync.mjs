#!/usr/bin/env node
// verify-zcode-sync.mjs — 结构与同步校验（对应上游 verify-gesture-declaration.mjs 的角色）：
//   V1 manifest：JSON 合法、name==目录名、必填字段、声明资源存在且不出插件根
//   V2 生成物零漂移：agents/commands 与 persona 经 gen-zcode-agents.mjs --check 幂等
//   V3 agents↔commands 对齐：11↔11、名称一一对应
//   V4 SKILL.md 缝锚点：ZCode 缝锚点在、宿主缝残留词禁现
//   V5 hooks：hooks.json 合法、引用脚本存在、只用 ${ZCODE_PLUGIN_ROOT} 不猜安装路径
//   V6 Python 工具在位（可选 --dsh-repo 时核对与上游字节一致）
//   V7 市场清单：marketplace.json 的 name/version 与 manifest 一致
// 校验器占位符规则（\bTODO\b 等）同 helper：全扫描树不得命中（上游合法行文已本地改词，
// 见 scripts/sync-from-dsh.mjs 补丁表）。
// 用法：node scripts/verify-zcode-sync.mjs [--dsh-repo <上游检出>]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const PLUGIN = join(REPO_ROOT, 'plugins', 'expert-orchestrator');
const SKILL = join(PLUGIN, 'skills', 'expert-orchestration');
const errors = [];
const notes = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => { errors.push(msg); console.log(`  ✗ ${msg}`); };

const dshIdx = process.argv.indexOf('--dsh-repo');
const DSH = dshIdx >= 0 ? resolve(process.argv[dshIdx + 1]) : resolve(REPO_ROOT, '..', 'dsh-expert-orchestrator');

const PLACEHOLDER = /\bTODO\b|\bFIXME\b|<your[-_ ][^>]+>|YOUR_API_KEY/u;

console.log('V1 manifest');
let manifest = null;
try {
  manifest = JSON.parse(readFileSync(join(PLUGIN, '.zcode-plugin', 'plugin.json'), 'utf8'));
  if (manifest.name !== 'expert-orchestrator') fail(`manifest.name=${manifest.name} ≠ 目录名 expert-orchestrator`);
  else ok('name == 目录名');
  for (const k of ['version', 'description', 'license']) {
    if (typeof manifest[k] !== 'string' || !manifest[k]) fail(`manifest.${k} 缺失`);
  }
  if (!errors.length) ok('必填字段齐备');
  for (const field of ['skills', 'agents', 'commands', 'hooks']) {
    const v = manifest[field];
    if (typeof v !== 'string' || !v) { fail(`manifest.${field} 未声明`); continue; }
    const cand = resolve(PLUGIN, v);
    if (!cand.startsWith(PLUGIN + '/') || !existsSync(cand)) { fail(`manifest.${field} 资源不存在或越界：${v}`); continue; }
    ok(`${field} → ${v}（存在且在插件根内）`);
  }
} catch (e) {
  fail(`manifest 解析失败：${e.message}`);
}

console.log('V2 生成物零漂移');
try {
  execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', 'gen-zcode-agents.mjs'), '--check'], { stdio: 'pipe' });
  ok('gen-zcode-agents --check 通过（agents+commands 与 persona 零漂移）');
} catch (e) {
  fail(`codegen 幂等校验失败：${String(e.stderr || e.message)}`);
}

console.log('V3 agents↔commands 对齐');
{
  const personaNames = readdirSync(join(SKILL, 'experts')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort();
  const agentNames = readdirSync(join(PLUGIN, 'agents')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort();
  const cmdNames = readdirSync(join(PLUGIN, 'commands')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '').replace(/^expert-/, '')).sort();
  const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (eq(personaNames, agentNames) && eq(personaNames, cmdNames)) ok(`persona/agents/commands 三面一一对应（${personaNames.length} 位）`);
  else fail(`三面不对齐：persona=${personaNames} agents=${agentNames} commands=${cmdNames}`);
}

console.log('V4 SKILL.md 缝锚点');
{
  const text = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  for (const anchor of ['ZCode 移植版', 'Agent 工具', '.zcode/experts', '~/.zcode/expert-orchestrator', 'origin-chain', 'expert-orchestrator:<slug>']) {
    if (!text.includes(anchor)) fail(`缺锚点：${anchor}`);
  }
  for (const banned of ['summon_expert', 'startActivation', 'expert-sources/merged/roster.json', 'dsh-agency-agents', '~/.dsh/experts', '~/.dsh/expert-profiles', '.agent-presets', '部署副本']) {
    if (text.includes(banned)) fail(`宿主缝残留词：${banned}`);
  }
  if (!errors.filter((e) => e.startsWith('缺锚点') || e.startsWith('宿主缝残留词')).length) ok('ZCode 缝锚点齐备、宿主缝零残留');
}

console.log('V5 hooks');
{
  const hooksPath = join(PLUGIN, 'hooks', 'hooks.json');
  try {
    const hj = JSON.parse(readFileSync(hooksPath, 'utf8'));
    const events = hj.hooks ?? {};
    for (const ev of ['PreToolUse', 'PostToolUse']) {
      const arr = events[ev];
      if (!Array.isArray(arr) || !arr.length) { fail(`hooks.${ev} 缺失`); continue; }
      for (const entry of arr) {
        for (const h of entry.hooks ?? []) {
          if (h.type !== 'process') fail(`${ev} hook type=${h.type}（应为 process，最可移植）`);
          const script = (h.args ?? []).find((a) => a.includes('hooks/'));
          if (!script) { fail(`${ev} hook 未引用脚本`); continue; }
          if (!script.includes('${ZCODE_PLUGIN_ROOT}')) fail(`${script} 未用 \${ZCODE_PLUGIN_ROOT}（不得猜安装缓存路径）`);
          const cand = resolve(PLUGIN, script.replace(/\$\{[^}]+\}/g, '').replace(/^\/+/, ''));
          if (!existsSync(cand)) fail(`hook 脚本不存在：${script}`);
        }
      }
      if (!errors.some((e) => e.includes(ev))) ok(`${ev} → process hook、脚本在位、\${ZCODE_PLUGIN_ROOT} 引用`);
    }
  } catch (e) {
    fail(`hooks.json 解析失败：${e.message}`);
  }
}

console.log('V6 Python 工具');
{
  for (const f of ['taskboard.py', 'bus.py', '_ed25519.py']) {
    const p = join(SKILL, 'tools', f);
    try {
      if (statSync(p).size <= 0) fail(`空文件：tools/${f}`);
    } catch { fail(`缺文件：tools/${f}`); }
  }
  if (!errors.length || !errors.some((e) => e.includes('tools/'))) ok('taskboard.py / bus.py / _ed25519.py 在位');
  if (existsSync(DSH)) {
    let byteDiff = 0;
    for (const f of ['taskboard.py', 'bus.py', '_ed25519.py']) {
      const a = readFileSync(join(SKILL, 'tools', f));
      const b = readFileSync(join(DSH, 'skills', 'expert-orchestration', 'tools', f));
      if (!a.equals(b)) { byteDiff++; fail(`与上游不一致（字节级契约）：tools/${f}`); }
    }
    if (!byteDiff) ok(`与上游 ${DSH} 字节一致`);
  } else {
    notes.push(`上游检出不在 ${DSH}——跳过 Python 工具字节级核对`);
  }
}

console.log('V7 市场清单');
{
  const mpPath = join(REPO_ROOT, 'plugins', 'marketplace.json');
  try {
    const mp = JSON.parse(readFileSync(mpPath, 'utf8'));
    const entry = (mp.plugins ?? []).find((p) => p.name === 'expert-orchestrator');
    if (!entry) fail('marketplace.json 缺 expert-orchestrator 条目');
    else if (entry.version !== manifest?.version) fail(`市场条目 version=${entry.version} ≠ manifest ${manifest?.version}`);
    else ok(`市场 ${mp.name}：条目 version=${entry.version} 与 manifest 一致`);
  } catch (e) {
    fail(`marketplace.json 解析失败：${e.message}`);
  }
}

console.log('V8 校验器占位符规则全扫描');
{
  const hits = [];
  const walk = (dir, base) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const p = join(dir, entry);
      const rel = join(base, entry);
      if (statSync(p).isDirectory()) walk(p, rel);
      else if (/\.(json|md|mjs|cjs|js|ts|txt|yaml|yml|toml)$/u.test(entry)) {
        if (PLACEHOLDER.test(readFileSync(p, 'utf8'))) hits.push(rel);
      }
    }
  };
  walk(PLUGIN, 'plugins/expert-orchestrator');
  if (hits.length) fail(`占位符模式命中：${hits.join(', ')}`);
  else ok('skills/agents/commands/hooks 全树无 TODO/FIXME/<your…>/YOUR_API_KEY');
}

console.log('');
if (errors.length) {
  console.error(`校验失败：${errors.length} 项`);
  process.exit(1);
}
for (const n of notes) console.log(`  （注）${n}`);
console.log('校验通过：结构与同步全部一致。');
