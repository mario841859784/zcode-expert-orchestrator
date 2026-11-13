#!/usr/bin/env node
// PreToolUse 兜底执法：Agent 派发前解析任务书（prompt）携带的 origin-chain 标记，
// 链上出现重复 (专家名, cwd) 对即拒绝派发（A→B→A 环路）。协议主执法面在编排者
// （SKILL.md §3/§5），本 hook 是兜底——协议层是纪律，hook 层是执法。
//
// 语义（沿上游 dsh-expert-orchestrator origin-chain）：
// - 标记形如 `<!-- origin-chain: [{"n":"<专家名>","c":"<cwd>"},…] -->`，取**最后一个**
//   标记（任务书只应携带一行；异常多行时以末行为准）；
// - 深度由链长推导，不信任任何计数字段；
// - 开关：env ZCODE_EXPERT_ORIGIN_CHAIN='0'/'' 整体关闭（直接放行）；
// - fail-open：stdin 非 JSON、无标记、链解析失败、字段形状异常 → 一律放行
//   （兜底面绝不阻塞正常派发；只对确定性重复对 deny）。
//
// 输出契约：通过=exit 0 无输出；拒绝=stderr 报错（含完整链路）+ exit 2
// （ZCode PreToolUse 约定：exit 2 = deny）。
import { readFileSync } from 'node:fs';

const MARKER_RE = /<!--\s*origin-chain:\s*(\[[\s\S]*?\])\s*-->/g;

/** 从任务书文本提取最后一个 origin-chain 标记并解析链（导出供自测）。
 *  返回 { pairs: [{n, c}], chain: string } | null（无标记/不可解析 = null）。 */
export function parseChain(text) {
  if (typeof text !== 'string' || !text) return null;
  let m = null;
  MARKER_RE.lastIndex = 0;
  while (true) {
    const hit = MARKER_RE.exec(text);
    if (!hit) break;
    m = hit;
  }
  if (!m) return null;
  let arr;
  try {
    arr = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const pairs = [];
  for (const p of arr) {
    if (!p || typeof p !== 'object') return null;
    if (typeof p.n !== 'string' || typeof p.c !== 'string') return null;
    pairs.push({ n: p.n, c: p.c });
  }
  return { pairs, chain: m[0] };
}

/** 链上首个重复 (n, c) 对（导出供自测）；无重复返回 null。 */
export function findDuplicatePair(pairs) {
  const seen = new Set();
  for (const p of pairs) {
    const key = JSON.stringify([p.n, p.c]);
    if (seen.has(key)) return { n: p.n, c: p.c, key };
    seen.add(key);
  }
  return null;
}

function disabled(env = process.env) {
  const flag = env.ZCODE_EXPERT_ORIGIN_CHAIN;
  if (flag === undefined) return false;
  const s = String(flag).trim();
  return s === '' || s === '0';
}

async function main() {
  if (disabled()) process.exit(0);
  let raw = '';
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    process.exit(0); // 无 stdin：fail-open
  }
  let input = null;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0); // stdin 非 JSON：fail-open
  }
  // 防御性取 prompt：PreToolUse(Agent) 的任务书在 tool_input.prompt；
  // 形状不符一律 fail-open。
  const ti = input?.tool_input ?? input?.input ?? null;
  const prompt = ti && typeof ti === 'object' && typeof ti.prompt === 'string' ? ti.prompt : null;
  if (prompt == null) process.exit(0);
  const chain = parseChain(prompt);
  if (!chain) process.exit(0); // 顶层派发无标记属正常形态
  const dup = findDuplicatePair(chain.pairs);
  if (!dup) process.exit(0);
  console.error(`[zcode-expert-orchestrator] origin-chain 环路拒绝派发：链上出现重复对 (n=${JSON.stringify(dup.n)}, c=${JSON.stringify(dup.c)})。完整链路：${chain.chain}`);
  process.exit(2);
}

// 自测导入时不执行 main
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) await main();
