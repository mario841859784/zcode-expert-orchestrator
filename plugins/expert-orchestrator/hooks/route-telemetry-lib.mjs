// 路由遥测库（vendor 自 dsh-expert-orchestrator v2.14.2 lib/route-telemetry.js，单向移植）。
//
// 与上游的差异仅两处（其余逐字同源）：
// 1. env 开关名：DSH_EXPERT_ROUTE_TELEMETRY → ZCODE_EXPERT_ROUTE_TELEMETRY（编排面两族命名约定）；
// 2. 告警前缀：[dsh-expert-orchestrator] → [zcode-expert-orchestrator]。
//
// 定位与边界（沿上游如实声明）：
// - **只读埋点**：对任务板/事件流/总线零写入；唯一副作用=会话 cwd 下
//   `.expert-routing/samples.jsonl` 追加一行 JSON（与 .expert-bus/.expert-taskboards
//   同款 dotfile 约定）。**默认开启**，env ZCODE_EXPERT_ROUTE_TELEMETRY='0'/'' 显式关闭。
// - **隐私与规模**：样本只存规模与离散字段（专家名/模型/stopReason/字符数/估算值/时长），
//   不留任务书与回包正文；单文件 8MB 软顶——超顶跳过追加并 stderr 提醒一次（会话内
//   去重），不滚动不删除（archive/back up, never destroy 口径）。
// - **fail-open**：任何 I/O 异常 → 一次性 stderr 告警后本会话禁用（绝不阻塞派发）。
// - **估算≠计量**：estTokens 为字符启发式估算；usage 键恒 null（seam 未暴露真实
//   token），校准面 = 实测字符规模 × 估算系数的反推比（aggregate 的 tokPerChar）。
import { appendFileSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROUTING_DIR = '.expert-routing'
const SAMPLES_FILE = 'samples.jsonl'
const MAX_SAMPLE_BYTES = 8 * 1024 * 1024 // 单文件软顶（约 4 万样本行），超顶停写不删

/** 埋点开关：ZCODE_EXPERT_ROUTE_TELEMETRY 未设置=开（攒数据是切口目的）；'0'/''=关。
 *  非法值（任意其他）按开处理并 stderr 提醒一次（宁多记勿静默丢样本）。导出供自测。 */
export function telemetryEnabled(env = process.env, warn = (m) => console.warn(`[zcode-expert-orchestrator] ${m}`)) {
  const flag = env.ZCODE_EXPERT_ROUTE_TELEMETRY
  if (flag === undefined) return true
  const s = String(flag).trim()
  if (s === '') return false
  if (s === '0') return false
  if (s !== '1') warn(`ZCODE_EXPERT_ROUTE_TELEMETRY=${JSON.stringify(flag)} 非标准值（'1'/'0'/''）——按开启处理`)
  return true
}

/** 派发边界实测样本（纯函数，导出供自测）：字段全部离散/规模值，无正文。
 *  ok=false 时 answerChars=0（回包不可得）；usage 恒 null（seam 未暴露——
 *  字段先占位保证行形状稳定）。 */
export function buildSample({ ts = Date.now(), expert = '', model = '', pref = '', ok = false,
  stopReason = null, taskText = '', answerText = '', durationMs = null, estTokens = 0 } = {}) {
  return {
    v: 1,
    ts,
    expert: typeof expert === 'string' ? expert : '',
    model: typeof model === 'string' ? model : '',
    pref: typeof pref === 'string' ? pref : '',
    ok: ok === true,
    stopReason: typeof stopReason === 'string' ? stopReason : null,
    taskChars: [...String(taskText ?? '')].length,
    answerChars: [...String(answerText ?? '')].length,
    estTokens: Number.isFinite(estTokens) ? estTokens : 0,
    durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : null,
    usage: null,
  }
}

/** 样本落盘（cwd 下 .expert-routing/samples.jsonl 追加一行）。返回 {ok, reason?}；
 *  fail-open 语义：目录创建/追加任何异常 → ok:false，由调用方一次性告警。 */
export function appendSample(cwd, sample, { maxBytes = MAX_SAMPLE_BYTES } = {}) {
  try {
    const dir = join(cwd, ROUTING_DIR)
    const file = join(dir, SAMPLES_FILE)
    try {
      if (statSync(file).size >= maxBytes) return { ok: false, reason: 'cap' }
    } catch { /* 文件不存在=首行 */ }
    mkdirSync(dir, { recursive: true })
    appendFileSync(file, JSON.stringify(sample) + '\n', { encoding: 'utf-8' })
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error?.message ?? String(error) }
  }
}

/** 样本聚合（纯函数，导出供自测）：按专家/模型聚合实测面，并给出估算校准的反推比。
 *  tokPerChar = estTokens / (taskChars+answerChars)——字符启发式系数（CJK 0.75/other
 *  0.25）的实测反推锚点；真实 usage 接入后同槽位换实测 token。 */
export function aggregate(samples) {
  const rows = (Array.isArray(samples) ? samples : []).filter((s) => s && typeof s === 'object')
  const byKey = (keyFn) => {
    const map = new Map()
    for (const s of rows) {
      const k = keyFn(s) ?? ''
      if (!map.has(k)) map.set(k, { count: 0, ok: 0, fail: 0, estTokens: 0, taskChars: 0, answerChars: 0, durationMs: [], stopReasons: {} })
      const b = map.get(k)
      b.count++
      if (s.ok === true) b.ok++
      else b.fail++
      b.estTokens += Number.isFinite(s.estTokens) ? s.estTokens : 0
      b.taskChars += Number.isFinite(s.taskChars) ? s.taskChars : 0
      b.answerChars += Number.isFinite(s.answerChars) ? s.answerChars : 0
      if (Number.isFinite(s.durationMs) && s.durationMs >= 0) b.durationMs.push(s.durationMs)
      const sr = typeof s.stopReason === 'string' && s.stopReason ? s.stopReason : (s.ok === true ? 'completed' : 'unknown')
      b.stopReasons[sr] = (b.stopReasons[sr] ?? 0) + 1
    }
    return [...map.entries()].map(([key, b]) => {
      const chars = b.taskChars + b.answerChars
      const dur = b.durationMs.sort((a, z) => a - z)
      // 分位取上取整索引（ceil-1）：p50 偶数样本取下中位（[100,300]→100）、p95 取高位
      const pct = (p) => (dur.length ? dur[Math.max(0, Math.ceil(p * dur.length) - 1)] : null)
      return {
        key, count: b.count, ok: b.ok, fail: b.fail,
        okRate: b.count ? Math.round((b.ok / b.count) * 1000) / 1000 : 0,
        estTokens: b.estTokens,
        avgAnswerChars: b.count ? Math.round(b.answerChars / b.count) : 0,
        tokPerChar: chars ? Math.round((b.estTokens / chars) * 1000) / 1000 : 0,
        durationP50: pct(0.5), durationP95: pct(0.95),
        stopReasons: b.stopReasons,
      }
    }).sort((a, z) => z.count - a.count || String(a.key).localeCompare(String(z.key)))
  }
  return { samples: rows.length, byExpert: byKey((s) => s.expert), byModel: byKey((s) => s.model) }
}
