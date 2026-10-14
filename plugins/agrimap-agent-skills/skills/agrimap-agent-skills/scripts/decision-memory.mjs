// Decision memory (ACG C7, spec §10): pull-only recall of team decisions,
// per-user signals, preference promotion and R1 calibration. Markdown decisions
// are the source of truth; the index, signals and preferences live under
// cache/ and runtime/ and are never committed.
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { identityKey, localAuditMetadata } from "./identity.mjs";

const toSlash = value => String(value || "").replaceAll("\\", "/");
const RECALL_MAX_CHARS = 2000;
const SUPPRESS_SCORE = 7;
export const MEMORY_DEFAULTS = Object.freeze({ promoteAfter: 2, window: 10, minSignals: 5, acceptHigh: 0.8, acceptLow: 0.5 });

// ------------------------------------------------------------ frontmatter

function stripComment(raw) {
  let quote = null;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (quote) { if (char === quote && raw[index - 1] !== "\\") quote = null; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "#" && (index === 0 || /\s/.test(raw[index - 1]))) return raw.slice(0, index).trim();
  }
  return raw.trim();
}

function scalar(value) {
  if (value === "null" || value === "~" || value === "") return value === "" ? "" : null;
  const quoted = value.match(/^(['"])(.*)\1$/);
  if (quoted) {
    if (quoted[1] === '"') { try { return JSON.parse(value); } catch { return quoted[2]; } }
    return quoted[2].replaceAll("''", "'");
  }
  return value;
}

export function parseFrontmatter(text) {
  const lines = String(text || "").split(/\r?\n/);
  const warnings = [];
  if (lines[0]?.trim() !== "---") return { data: {}, body: String(text || ""), warnings };
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return { data: {}, body: String(text || ""), warnings: [{ line: 1, reason: "unterminated frontmatter" }] };
  const data = {};
  for (let index = 1; index < end; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) { warnings.push({ line: index + 1, reason: "not key: value" }); continue; }
    const value = stripComment(match[2]);
    if (value.startsWith("[") && value.endsWith("]")) {
      data[match[1]] = value.slice(1, -1).split(",").map(item => scalar(item.trim())).filter(item => item !== "" && item !== null);
    } else data[match[1]] = scalar(value);
  }
  return { data, body: lines.slice(end + 1).join("\n"), warnings };
}

// ------------------------------------------------------------------ index

async function decisionFiles(dir) {
  const found = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".md")) found.push(full);
    }
  }
  await walk(dir);
  return found.sort();
}

function entryOf(state, file, text) {
  const { data, body } = parseFrontmatter(text);
  const heading = body.match(/^#\s*Decision:\s*(.+)$/m)?.[1]?.trim();
  const relative = toSlash(path.relative(state, file));
  return {
    id: path.basename(file, ".md"), file: relative, topic: data.topic || null, kind: data.kind || "convention",
    status: data.status || "approved", summary: String(data.summary || heading || "").slice(0, 140),
    scope_paths: Array.isArray(data.scope_paths) ? data.scope_paths : [], applies_when: data.applies_when || "",
    date: data.date || null, supersedes: data.supersedes ?? null, superseded_by: data.superseded_by ?? null,
    value: data.value ?? null, origin: data.origin || null,
  };
}

// Rebuilt when the file count or newest mtime of decisions/**/*.md changes.
export async function loadDecisionIndex(root) {
  const state = path.join(root, ".agrimap-agent");
  const files = await decisionFiles(path.join(state, "decisions"));
  let maxMtimeMs = 0;
  for (const info of await Promise.all(files.map(file => stat(file)))) maxMtimeMs = Math.max(maxMtimeMs, info.mtimeMs);
  const cacheFile = path.join(state, "cache", "decisions-index.json");
  const cached = JSON.parse(await readFile(cacheFile, "utf8").catch(() => "null"));
  if (cached && cached.fileCount === files.length && cached.maxMtimeMs === maxMtimeMs) return { ...cached, rebuilt: false };
  const entries = [];
  for (const file of files) entries.push(entryOf(state, file, await readFile(file, "utf8")));
  const index = { builtAt: new Date().toISOString(), fileCount: files.length, maxMtimeMs, entries };
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, `${JSON.stringify(index)}\n`, "utf8");
  return { ...index, rebuilt: true };
}

// ------------------------------------------------------------------ recall

export function globRegex(glob) {
  let source = "";
  const value = toSlash(glob);
  for (let index = 0; index < value.length; index += 1) {
    if (value.startsWith("**/", index)) { source += "(?:.*/)?"; index += 2; }
    else if (value.startsWith("**", index)) { source += ".*"; index += 1; }
    else if (value[index] === "*") source += "[^/]*";
    else if (value[index] === "?") source += "[^/]";
    else source += value[index].replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

export function scoreEntry(entry, { topic = null, paths = [], kind = null, now = Date.now() } = {}) {
  let score = 0;
  if (topic && entry.topic === topic) score += 5;
  else if (topic && entry.topic && entry.topic.split("/")[0] === topic.split("/")[0]) score += 2;
  if (paths.length && entry.scope_paths.some(glob => paths.some(item => globRegex(glob).test(toSlash(item))))) score += 3;
  if (kind && entry.kind === kind) score += 1;
  if (entry.date && now - Date.parse(`${entry.date}T00:00:00Z`) <= 90 * 86_400_000) score += 1;
  return score;
}

export function userKey() {
  const { machine, osUser } = localAuditMetadata();
  return identityKey(`${machine || "machine"}-${osUser || "user"}`) || "local";
}

const signalFile = (root, key) => path.join(root, ".agrimap-agent", "runtime", "signals", `${key}.jsonl`);
const preferenceFile = (root, key) => path.join(root, ".agrimap-agent", "runtime", "preferences", `${key}.json`);

export async function readSignals(root, key = userKey()) {
  const text = await readFile(signalFile(root, key), "utf8").catch(() => "");
  return text.split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
}

export async function recordSignal(root, signal, key = userKey()) {
  const file = signalFile(root, key);
  await mkdir(path.dirname(file), { recursive: true });
  const line = { ts: new Date().toISOString(), ...signal };
  await writeFile(file, `${JSON.stringify(line)}\n`, { encoding: "utf8", flag: "a" });
  return line;
}

export async function loadPreferences(root, key = userKey()) {
  const value = JSON.parse(await readFile(preferenceFile(root, key), "utf8").catch(() => "null")) || {};
  return { alwaysAsk: [], declinedPromotion: [], values: {}, ...value };
}

export async function savePreferences(root, patch, key = userKey()) {
  const current = await loadPreferences(root, key);
  const next = { ...current, ...patch };
  for (const field of ["alwaysAsk", "declinedPromotion"]) next[field] = [...new Set(next[field] || [])];
  const file = preferenceFile(root, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

// Same (topic, value) chosen `promoteAfter` times in a row, not declined.
export function promotable(signals, { promoteAfter = MEMORY_DEFAULTS.promoteAfter, declined = [], decided = [] } = {}) {
  const byTopic = new Map();
  for (const signal of signals) {
    if (!signal.topic || signal.chosenValue === undefined || signal.chosenValue === null || typeof signal.chosenValue === "object") continue;
    const current = byTopic.get(signal.topic);
    const value = String(signal.chosenValue);
    byTopic.set(signal.topic, current?.value === value ? { value, count: current.count + 1 } : { value, count: 1 });
  }
  return [...byTopic.entries()]
    .filter(([topic, item]) => item.count >= promoteAfter && !declined.includes(topic) && !decided.some(entry => entry.topic === topic && String(entry.value) === item.value))
    .map(([topic, item]) => ({ topic, value: item.value, count: item.count }));
}

// Per kind over the last `window` R1 signals.
export function calibration(signals, { window = MEMORY_DEFAULTS.window, minSignals = MEMORY_DEFAULTS.minSignals, acceptHigh = MEMORY_DEFAULTS.acceptHigh, acceptLow = MEMORY_DEFAULTS.acceptLow } = {}) {
  const result = {};
  const kinds = [...new Set(signals.filter(item => item.risk === "R1" && item.kind).map(item => item.kind))];
  for (const kind of kinds) {
    const recent = signals.filter(item => item.risk === "R1" && item.kind === kind && typeof item.recommendedChosen === "boolean").slice(-window);
    const n = recent.length;
    const acceptRate = n ? Number((recent.filter(item => item.recommendedChosen).length / n).toFixed(2)) : 0;
    const mode = n >= minSignals && acceptRate >= acceptHigh ? "decide-and-report" : n >= minSignals && acceptRate <= acceptLow ? "ask" : "default";
    result[kind] = { n, acceptRate, mode };
  }
  return result;
}

function fit(result) {
  let text = JSON.stringify(result);
  while (text.length > RECALL_MAX_CHARS && result.matches.some(item => item.summary.length > 40)) {
    for (const item of result.matches) item.summary = `${item.summary.slice(0, Math.max(40, item.summary.length - 40))}…`;
    text = JSON.stringify(result);
  }
  while (text.length > RECALL_MAX_CHARS && result.matches.length) { result.matches.pop(); result.truncated = true; text = JSON.stringify(result); }
  return result;
}

export async function recall({ root, topic = null, paths = [], kind = null, limit = 5, now = Date.now(), key = userKey(), learning = {} }) {
  const index = await loadDecisionIndex(root);
  const live = index.entries.filter(entry => entry.status === "approved");
  const pool = live.length ? live : index.entries.filter(entry => entry.status === "proposed");
  const matches = pool
    .map(entry => ({ entry, score: scoreEntry(entry, { topic, paths, kind, now }) }))
    .filter(item => item.score >= 3)
    .sort((a, b) => b.score - a.score || String(b.entry.date).localeCompare(String(a.entry.date)))
    .slice(0, Math.max(1, Number(limit) || 5))
    .map(({ entry, score }) => ({ id: entry.id, summary: entry.summary, topic: entry.topic, kind: entry.kind, date: entry.date, file: entry.file, score, ...(entry.value !== null ? { value: entry.value } : {}), ...(live.length ? {} : { proposed: true }) }));
  const signals = await readSignals(root, key);
  const preferences = await loadPreferences(root, key);
  return fit({
    ok: true, matches,
    promotable: promotable(signals, { promoteAfter: learning.promoteAfter, declined: preferences.declinedPromotion, decided: live }),
    calibration: calibration(signals),
  });
}

// ----------------------------------------------------------- card preflight

// DP2/DP4: before a card is stored, a matching approved precedent suppresses it.
// Owner decision 2026-10-14 (5.0.1, autonomy.md): the recommended option is taken
// without asking for R0/R1 at high or medium confidence and for a reversible R2,
// unless the requester keeps overriding this kind (calibration "ask") or always asks.
const AUTO_CONFIDENCE = new Set(["high", "medium"]);

function autonomyWeighted(card) {
  if (!AUTO_CONFIDENCE.has(card.confidence)) return false;
  return card.risk === "R0" || card.risk === "R1" || (card.risk === "R2" && card.reversible === true);
}

export async function preflightCard(root, card, { key = userKey(), now = Date.now() } = {}) {
  const found = await recall({ root, topic: card.topic, paths: card.paths || [], kind: card.kind, limit: 5, now, key });
  for (const match of found.matches) {
    if (match.score < SUPPRESS_SCORE || match.topic !== card.topic) continue;
    const option = card.options.find(item => item.value !== undefined && item.value !== null && typeof item.value !== "object" && String(item.value) === String(match.value ?? ""))
      || card.options.find(item => match.summary && match.summary.includes(item.label));
    if (option) return { suppressed: { precedent: match.id, file: match.file, option: { id: option.id, label: option.label, value: option.value ?? null }, score: match.score } };
  }
  const preferences = await loadPreferences(root, key);
  const mode = found.calibration[card.kind]?.mode || "default";
  const alwaysAsk = preferences.alwaysAsk.includes(card.kind);
  if (autonomyWeighted(card) && mode !== "ask" && !alwaysAsk) {
    const option = card.options.find(item => String(item.id) === String(card.recommended));
    const reason = mode === "decide-and-report"
      ? `calibration ${card.kind}: acceptRate ${found.calibration[card.kind].acceptRate} over ${found.calibration[card.kind].n}`
      : `autonomy ${card.risk} ${card.confidence}${card.risk === "R2" ? " reversible" : ""}`;
    return { autoDecided: { option: { id: option.id, label: option.label, value: option.value ?? null }, reason } };
  }
  return { calibrationMode: mode, alwaysAsk };
}

export function promotionCard({ topic, value, count, kind = "convention" }) {
  return {
    kind: "preference", topic: `memory/promotion/${topic}`, risk: "R1", confidence: "high",
    question: `ใช้ "${String(value).slice(0, 60)}" เป็นค่าเริ่มต้นของ ${topic} ไหม`,
    impact: `เลือกแบบนี้มาแล้ว ${count} ครั้ง`,
    checked: [`signals: ${topic} = ${value} × ${count}`],
    options: [
      { id: "1", label: "ใช้เป็นค่าของทีม", effect: "บันทึก decision และ commit ไปกับงาน", value: { promotion: topic, scope: "team", value: String(value), kind } },
      { id: "2", label: "ใช้เฉพาะฉัน", effect: "บันทึก preference บนเครื่องนี้", value: { promotion: topic, scope: "me", value: String(value), kind } },
      { id: "3", label: "ไม่ต้อง", effect: "ไม่ถามเรื่องนี้อีก", value: { promotion: topic, scope: "decline", value: String(value), kind } },
    ],
    recommended: "1", recommendedReason: "ทีมเลือกค่านี้ซ้ำแล้ว", blocking: false, default: "3", recordAs: "preference", paths: [], expiresHours: 72,
  };
}
