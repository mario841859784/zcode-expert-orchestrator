// zcode-port.selftest.mjs — 移植结构与防护面自测（node:test，零依赖）。
// 覆盖：manifest/生成物对齐、origin-chain guard 纯函数与 CLI、遥测库开关与聚合、
// hooks.json 引用完整性、SKILL.md 缝锚点、Python 工具字节契约（上游检出在位时）。
// 本测试只读仓库文件（V7b 的遥测落盘写到 mkdtemp 临时目录），不触碰运行态数据
// （.expert-*）与 git 状态；临时目录一律经 fs.realpathSync 归一（macOS TMPDIR symlink 坑）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const PLUGIN = join(REPO, 'plugins', 'expert-orchestrator');
const SKILL = join(PLUGIN, 'skills', 'expert-orchestration');
const DSH_REPO = process.env.DSH_REPO ?? resolve(REPO, '..', 'dsh-expert-orchestrator');

test('V1 manifest：JSON 合法、name==目录名、版本 0.1.0、四组件声明', () => {
  const m = JSON.parse(readFileSync(join(PLUGIN, '.zcode-plugin', 'plugin.json'), 'utf8'));
  assert.equal(m.name, 'expert-orchestrator');
  assert.equal(m.version, '0.1.0');
  for (const k of ['skills', 'agents', 'commands', 'hooks']) assert.equal(typeof m[k], 'string', `${k} 应声明`);
  assert.ok(realpathSync(PLUGIN).endsWith('plugins/expert-orchestrator'));
});

test('V2/V3 三面对齐：persona ↔ agents ↔ commands 一一对应', () => {
  const personas = readdirSync(join(SKILL, 'experts')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort();
  const agents = readdirSync(join(PLUGIN, 'agents')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort();
  const commands = readdirSync(join(PLUGIN, 'commands'))
    .filter((f) => /^expert-.+\.md$/.test(f))
    .map((f) => f.replace(/^expert-/, '').replace(/\.md$/, ''))
    .sort();
  assert.equal(personas.length, 11);
  assert.deepEqual(agents, personas);
  assert.deepEqual(commands, personas);
});

test('V3b 生成物零漂移：gen --check 幂等退出 0', () => {
  execFileSync(process.execPath, [join(REPO, 'scripts', 'gen-zcode-agents.mjs'), '--check'], { cwd: REPO, stdio: 'pipe' });
});

test('V3c agents frontmatter：tools 白名单不含 Agent；只读评审类无写工具', () => {
  for (const f of readdirSync(join(PLUGIN, 'agents'))) {
    const text = readFileSync(join(PLUGIN, 'agents', f), 'utf8');
    const m = /^tools: \[(.*)\]$/m.exec(text);
    assert.ok(m, `${f} 缺 tools 行`);
    const tools = m[1].split(',').map((s) => s.trim());
    assert.ok(!tools.includes('Agent'), `${f} 白名单不得含 Agent（结构性递归防护）`);
    if (['code-reviewer.md', 'security-auditor.md', 'project-manager.md'].includes(f)) {
      assert.ok(!tools.includes('Edit') && !tools.includes('Write'), `${f} 只读评审/规划类不得含写工具`);
    } else {
      assert.ok(tools.includes('Read') && tools.includes('Bash'), `${f} 至少需要 Read+Bash（任务板/总线经 Bash）`);
    }
  }
});

test('V4 SKILL.md：ZCode 缝锚点在、宿主缝残留词禁现', () => {
  const text = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  for (const anchor of ['ZCode 移植版', 'Agent 工具', '.zcode/experts', '~/.zcode/expert-orchestrator', 'origin-chain', 'expert-orchestrator:<slug>']) {
    assert.ok(text.includes(anchor), `缺锚点：${anchor}`);
  }
  for (const banned of ['summon_expert', 'startActivation', 'expert-sources/merged/roster.json', 'dsh-agency-agents', '~/.dsh/experts', '~/.dsh/expert-profiles', '.agent-presets', '部署副本']) {
    assert.ok(!text.includes(banned), `宿主缝残留词：${banned}`);
  }
});

test('V5 hooks.json：事件/类型/脚本引用完整', () => {
  const hj = JSON.parse(readFileSync(join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'));
  assert.ok(Array.isArray(hj.hooks.PreToolUse) && hj.hooks.PreToolUse.length);
  assert.ok(Array.isArray(hj.hooks.PostToolUse) && hj.hooks.PostToolUse.length);
  for (const ev of ['PreToolUse', 'PostToolUse']) {
    for (const entry of hj.hooks[ev]) {
      for (const h of entry.hooks) {
        assert.equal(h.type, 'process');
        const script = h.args.find((a) => a.includes('hooks/'));
        assert.ok(script.includes('${ZCODE_PLUGIN_ROOT}'), 'hook 脚本路径须用 ${ZCODE_PLUGIN_ROOT}');
        assert.ok(existsSync(join(PLUGIN, script.replace(/\$\{[^}]+\}/g, ''))), `hook 脚本在位：${script}`);
      }
    }
  }
});

test('V6a origin-chain guard：链解析与重复对判定', async () => {
  const { parseChain, findDuplicatePair } = await import(join(PLUGIN, 'hooks', 'origin-chain-guard.mjs'));
  assert.equal(parseChain('无标记任务书'), null);
  const chain = parseChain('正文 <!-- origin-chain: [{"n":"后端工程师","c":"/w"},{"n":"代码审查专家","c":"/w"}] -->');
  assert.equal(chain.pairs.length, 2);
  assert.equal(findDuplicatePair(chain.pairs), null);
  const loop = parseChain('<!-- origin-chain: [{"n":"A","c":"/w"},{"n":"B","c":"/w"},{"n":"A","c":"/w"}] -->');
  assert.equal(findDuplicatePair(loop.pairs).n, 'A');
  assert.equal(parseChain('<!-- origin-chain: not-json -->'), null);
  // 多标记取最后一个
  const multi = parseChain('<!-- origin-chain: [{"n":"A","c":"/w"}] --> 中段 <!-- origin-chain: [{"n":"B","c":"/w"}] -->');
  assert.equal(multi.pairs.length, 1);
  assert.equal(multi.pairs[0].n, 'B');
});

test('V6b origin-chain guard CLI：正常链 exit 0、环路 exit 2、开关关闭 exit 0', () => {
  const guard = join(PLUGIN, 'hooks', 'origin-chain-guard.mjs');
  const run = (stdin, env = {}) => {
    try {
      execFileSync(process.execPath, [guard], { input: stdin, env: { ...process.env, ...env }, stdio: 'pipe' });
      return 0;
    } catch (e) {
      return e.status;
    }
  };
  const okChain = JSON.stringify({ tool_input: { prompt: '正文 <!-- origin-chain: [{"n":"A","c":"/w"},{"n":"B","c":"/w"}] -->' } });
  const loopChain = JSON.stringify({ tool_input: { prompt: '正文 <!-- origin-chain: [{"n":"A","c":"/w"},{"n":"A","c":"/w"}] -->' } });
  assert.equal(run(JSON.stringify({ tool_input: { prompt: '无标记' } })), 0);
  assert.equal(run(okChain), 0);
  assert.equal(run(loopChain), 2);
  assert.equal(run(loopChain, { ZCODE_EXPERT_ORIGIN_CHAIN: '0' }), 0);
  assert.equal(run(loopChain, { ZCODE_EXPERT_ORIGIN_CHAIN: '' }), 0);
});

test('V7 遥测库：开关语义、样本形状、聚合反推比', async () => {
  const lib = await import(join(PLUGIN, 'hooks', 'route-telemetry-lib.mjs'));
  assert.equal(lib.telemetryEnabled({}), true);
  assert.equal(lib.telemetryEnabled({ ZCODE_EXPERT_ROUTE_TELEMETRY: '0' }), false);
  assert.equal(lib.telemetryEnabled({ ZCODE_EXPERT_ROUTE_TELEMETRY: '' }), false);
  assert.equal(lib.telemetryEnabled({ ZCODE_EXPERT_ROUTE_TELEMETRY: '1' }), true);
  const s = lib.buildSample({ expert: 'backend-engineer', ok: true, taskText: 'abcde', answerText: 'abcdef' });
  assert.equal(s.v, 1);
  assert.equal(s.taskChars, 5);
  assert.equal(s.answerChars, 6);
  assert.equal(s.usage, null);
  // estTokens 由调用方按启发式算（hook 内 CJK 0.75/other 0.25）；聚合 tokPerChar = est/(task+answer)
  const agg = lib.aggregate([{ ...s, estTokens: 5 }, { ...s, estTokens: 7 }]);
  assert.equal(agg.samples, 2);
  assert.equal(agg.byExpert[0].count, 2);
  // 两样本合计：estTokens=12，taskChars=10+answerChars=12=22 → tokPerChar=12/22
  assert.equal(agg.byExpert[0].tokPerChar, Math.round((12 / 22) * 1000) / 1000);
});

test('V7b 遥测 hook CLI：落盘到 ZCODE_PROJECT_DIR、开关生效', () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'zcode-expert-telemetry-')));
  const hook = join(PLUGIN, 'hooks', 'route-telemetry.mjs');
  const stdin = JSON.stringify({ tool_input: { subagent_type: 'expert-orchestrator:backend-engineer', prompt: '任务' }, tool_response: '回包' });
  execFileSync(process.execPath, [hook], { input: stdin, env: { ...process.env, ZCODE_PROJECT_DIR: tmp }, stdio: 'pipe' });
  const file = join(tmp, '.expert-routing', 'samples.jsonl');
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.equal(row.expert, 'backend-engineer');
  assert.equal(row.ok, true);
  execFileSync(process.execPath, [hook], {
    input: stdin,
    env: { ...process.env, ZCODE_PROJECT_DIR: tmp, ZCODE_EXPERT_ROUTE_TELEMETRY: '0' },
    stdio: 'pipe',
  });
  assert.equal(readFileSync(file, 'utf8').trim().split('\n').length, 1, '开关关闭后不得追加');
});

test('V8 Python 工具：在位且（上游检出在位时）与上游字节一致', () => {
  for (const f of ['taskboard.py', 'bus.py', '_ed25519.py']) {
    const p = join(SKILL, 'tools', f);
    assert.ok(existsSync(p) && statSync(p).size > 0, `缺文件或空文件：tools/${f}`);
  }
  if (!existsSync(DSH_REPO)) return; // 上游不在位则跳过字节核对（异地检出）
  const dshTools = join(DSH_REPO, 'skills', 'expert-orchestration', 'tools');
  for (const f of ['taskboard.py', 'bus.py', '_ed25519.py']) {
    const a = readFileSync(join(SKILL, 'tools', f));
    const b = readFileSync(join(dshTools, f));
    assert.ok(a.equals(b), `tools/${f} 与上游不一致（字节级契约）`);
  }
});

test('V9 市场清单：条目 name/version 与 manifest 一致', () => {
  const mp = JSON.parse(readFileSync(join(REPO, 'plugins', 'marketplace.json'), 'utf8'));
  const m = JSON.parse(readFileSync(join(PLUGIN, '.zcode-plugin', 'plugin.json'), 'utf8'));
  const entry = mp.plugins.find((p) => p.name === m.name);
  assert.ok(entry, '缺市场条目');
  assert.equal(entry.version, m.version);
  assert.equal(entry.source, './expert-orchestrator');
});

test('V10 校验器占位符规则：全树无裸词 TODO/FIXME 等', () => {
  const PLACEHOLDER = /\bTODO\b|\bFIXME\b|<your[-_ ][^>]+>|YOUR_API_KEY/u;
  const hits = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.git') continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(json|md|mjs|js|txt|yaml|yml)$/u.test(e) && PLACEHOLDER.test(readFileSync(p, 'utf8'))) hits.push(p);
    }
  };
  walk(PLUGIN);
  assert.deepEqual(hits, []);
});

test('V11 sync-from-dsh --check：与上游一致（上游检出在位时）', () => {
  if (!existsSync(DSH_REPO)) return;
  const out = execFileSync(process.execPath, [join(REPO, 'scripts', 'sync-from-dsh.mjs'), '--check'], { cwd: REPO, encoding: 'utf8' });
  assert.ok(out.includes('内容不同 0'), `同步预检有漂移：\n${out}`);
});
