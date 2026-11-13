#!/usr/bin/env node
// PostToolUse 埋点：Agent 派发边界只读落盘路由样本（.expert-routing/samples.jsonl）。
// 汇总面见仓库 scripts/routing-metrics.mjs。库=hooks/route-telemetry-lib.mjs
// （vendor 自上游 lib/route-telemetry.js，env 名改 ZCODE_EXPERT_ROUTE_TELEMETRY）。
//
// 如实边界：PostToolUse 缝拿不到宿主 usage/stopReason/model/时长——相应字段照上游
// 形状占位（usage:null、stopReason:null、model:''、durationMs:null），样本形状稳定；
// ok=true（PostToolUse 仅在工具成功完成后触发；失败走 PostToolUseFailure，本 hook 不挂）。
// 开关与 fail-open：env ZCODE_EXPERT_ROUTE_TELEMETRY='0'/'' 关闭；任何异常 exit 0 静默。
import { readFileSync } from 'node:fs';
import { buildSample, appendSample, telemetryEnabled } from './route-telemetry-lib.mjs';

async function main() {
  if (!telemetryEnabled()) process.exit(0);
  let raw = '';
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    process.exit(0);
  }
  let input = null;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const ti = input?.tool_input ?? input?.input ?? null;
  if (!ti || typeof ti !== 'object') process.exit(0);
  // 专家名：subagent_type 带插件命名空间（expert-orchestrator:<slug>）时剥前缀；
  // general-purpose fallback 派发原样记录（host 语义：编排者经通用通道派文件层专家）。
  let expert = typeof ti.subagent_type === 'string' ? ti.subagent_type : '';
  const PREFIX = 'expert-orchestrator:';
  if (expert.startsWith(PREFIX)) expert = expert.slice(PREFIX.length);
  const taskText = typeof ti.prompt === 'string' ? ti.prompt : '';
  // 回包：防御性取 tool_response（string 或 {output…}）；取不到=0 字。
  const tr = input?.tool_response ?? input?.toolResponse ?? null;
  let answerText = '';
  if (typeof tr === 'string') answerText = tr;
  else if (tr && typeof tr === 'object' && typeof tr.output === 'string') answerText = tr.output;
  // estTokens：与上游 cost.js 同款字符启发式（CJK 0.75/other 0.25）。
  const estTokens = Math.round([...taskText].length * 0.75 + [...answerText].length * 0.25);
  const sample = buildSample({ expert, ok: true, taskText, answerText, estTokens });
  const cwd = process.env.ZCODE_PROJECT_DIR || process.cwd();
  const r = appendSample(cwd, sample);
  if (!r.ok) console.error(`[zcode-expert-orchestrator] 路由遥测落盘失败（不阻塞）：${r.reason}`);
  process.exit(0);
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) await main();
