// Decision Cards (ACG C2): one structured requester question, validated and
// rendered by script, stored as the session's lastCard so a short reply can
// answer it. With decision memory (P3) a card is first checked against
// precedents and calibration; recordAs applies the answer once.
import { readdir } from "node:fs/promises";
import path from "node:path";
import { readJsonFile, readSessionState, updateSessionState, writeJsonFile, writeSessionPointer, safeSession } from "./session-state.mjs";
import { initPolicy, loadPolicy, profilePolicy, setPolicyValue } from "./workflow-policy.mjs";
import { applyProjectPatch, initProject, loadProject, projectDefaults, setProjectValue, verifySpecPath } from "./project-profile.mjs";
import { setLocalPath } from "./local-memory.mjs";
import { bangkokParts, writeDecision } from "./decision-records.mjs";
import { preflightCard, recordSignal, savePreferences, loadPreferences } from "./decision-memory.mjs";

export const CARD_KINDS = Object.freeze(["workflow", "scope", "contract", "root", "integration", "convention", "preference", "project"]);
const RISKS = new Set(["R0", "R1", "R2", "R3"]);
const CONFIDENCE = { high: "สูง", medium: "กลาง", low: "ต่ำ" };

function pathExists(object, dotted) {
  return String(dotted).split(".").reduce((value, part) => (value && typeof value === "object" && part in value ? value[part] : undefined), object) !== undefined;
}

export function validateCard(card) {
  const details = [];
  const add = (field, reason) => details.push({ field, reason });
  if (!card || typeof card !== "object") return { ok: false, code: "CARD_INVALID", details: [{ field: "card", reason: "must be an object" }] };
  if (!CARD_KINDS.includes(card.kind)) add("kind", `must be one of ${CARD_KINDS.join("|")}`);
  if (!RISKS.has(card.risk)) add("risk", "must be R0|R1|R2|R3");
  if (!CONFIDENCE[card.confidence]) add("confidence", "must be high|medium|low");
  if (!String(card.topic || "").trim()) add("topic", "required");
  const question = String(card.question || "").trim();
  if (!question || question.length > 160) add("question", "required, at most 160 characters");
  if (!String(card.impact || "").trim()) add("impact", "state why the decision matters");
  if (!Array.isArray(card.checked) || !card.checked.some(item => String(item).trim())) add("checked", "list what was investigated before asking");
  const options = Array.isArray(card.options) ? card.options : [];
  if (options.length < 2 || options.length > 4) add("options", "2-4 options are required");
  const ids = options.map(option => String(option?.id ?? ""));
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) add("options.id", "ids must be present and unique");
  for (const option of options) {
    const label = String(option?.label || "").trim();
    if (!label || label.length > 60) add(`options.${option?.id}.label`, "required, at most 60 characters");
    if (!String(option?.effect || "").trim()) add(`options.${option?.id}.effect`, "every option needs its effect");
  }
  const effects = options.map(option => String(option?.effect || "").trim().toLowerCase());
  if (new Set(effects).size !== effects.length) add("options.effect", "options must have different effects");
  if (!ids.includes(String(card.recommended ?? ""))) add("recommended", "must be one of the option ids");
  if (!String(card.recommendedReason || "").trim()) add("recommendedReason", "give the reason for the recommendation");
  if (card.risk === "R3" && (card.blocking !== true || (card.default !== null && card.default !== undefined))) add("blocking", "R3 cards must block and have no default");
  if (card.reversible !== undefined && typeof card.reversible !== "boolean") add("reversible", "must be true or false");
  if (card.reversible === true && card.risk === "R3") add("reversible", "R3 is never reversible");
  if (card.blocking === false && !ids.includes(String(card.default ?? ""))) add("default", "a non-blocking card needs a default option");
  const recordAs = String(card.recordAs || "none");
  if (/^policy:/.test(recordAs)) {
    const key = recordAs.slice(7);
    if (key !== "init" && !pathExists(profilePolicy("gitflow"), key)) add("recordAs", `policy path ${key} is not in the workflow schema`);
  } else if (/^project:/.test(recordAs)) {
    const key = recordAs.slice(8);
    if (!pathExists(projectDefaults("code-first"), key)) add("recordAs", `project path ${key} is not in the project schema`);
  } else if (/^local:spec:/.test(recordAs)) {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(recordAs.slice(11))) add("recordAs", "local:spec:<id> needs a valid source id");
  } else if (!["none", "decision", "preference"].includes(recordAs)) add("recordAs", "must be none|decision|preference|policy:<path>|project:<path>|local:spec:<id>");
  const hours = card.expiresHours ?? 24;
  if (!(Number(hours) > 0 && Number(hours) <= 168)) add("expiresHours", "must be between 1 and 168");
  return details.length ? { ok: false, code: "CARD_INVALID", details } : { ok: true };
}

// The recommendation is always rendered and stored as option 1.
export function normalizeOptions(card) {
  const recommended = card.options.find(option => String(option.id) === String(card.recommended));
  const ordered = [recommended, ...card.options.filter(option => option !== recommended)];
  return ordered.map((option, index) => ({ ...option, id: String(index + 1), originalId: String(option.id) }));
}

export function renderCard(card) {
  const options = card.options[0]?.originalId ? card.options : normalizeOptions(card);
  const defaultOption = options.find(option => option.originalId === (card.default === null || card.default === undefined ? null : String(card.default)));
  const lines = [
    `**ต้องตัดสินใจ: ${card.question}** — ${card.impact}`,
    `ตรวจแล้ว: ${card.checked.join("; ")}`,
    ...options.map((option, index) => `${option.id}. ${option.label}${index === 0 ? " (แนะนำ)" : ""} — ${option.effect}`),
    `ความมั่นใจ: ${CONFIDENCE[card.confidence]} เพราะ ${card.recommendedReason} · ${card.blocking === false && defaultOption ? `ถ้าไม่ตอบจะใช้ข้อ ${defaultOption.id}` : "รอคำตอบก่อนทำส่วนนี้"}`,
    "ตอบเป็นเลข หรือพิมพ์คำตอบอื่นได้",
  ];
  return {
    markdown: lines.join("\n"),
    options: options.map((option, index) => ({ id: option.id, label: index === 0 ? `${option.label} (แนะนำ)` : option.label, description: option.effect })),
  };
}

export async function storeCard(state, session, card, { executionId = null, now = Date.now(), memory = false } = {}) {
  const validation = validateCard(card);
  if (!validation.ok) return { ok: false, ...validation };
  const id = safeSession(session);
  if (!id) return { ok: false, code: "SESSION_REQUIRED", message: "--session is required to store a card." };
  let calibrationMode = null;
  if (memory) {
    const preflight = await preflightCard(path.dirname(state), card, { now });
    if (preflight.suppressed) {
      const current = (await readSessionState(state, id)).questionsAvoided || [];
      await updateSessionState(state, id, { questionsAvoided: [...current, { executionId, topic: card.topic, precedent: preflight.suppressed.precedent, at: new Date(now).toISOString() }] });
      return { ok: true, suppressed: preflight.suppressed, render: null };
    }
    if (preflight.autoDecided) return { ok: true, autoDecided: preflight.autoDecided, render: null };
    calibrationMode = preflight.calibrationMode;
  }
  const options = normalizeOptions(card);
  const prefix = `${safeSession(executionId) || id.slice(0, 8)}-${card.kind}-`;
  const existing = (await readdir(path.join(state, "runtime", "cards")).catch(() => [])).filter(name => name.startsWith(prefix)).length;
  const cardId = `${prefix}${existing + 1}`;
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + Number(card.expiresHours ?? 24) * 3_600_000).toISOString();
  const stored = { ...card, options, recommended: "1", recommendedOriginal: String(card.recommended), cardId, session: id, executionId, createdAt, expiresAt, status: "open", memory };
  await writeJsonFile(path.join(state, "runtime", "cards", `${cardId}.json`), stored);
  const lastCard = {
    cardId, kind: card.kind, topic: card.topic, risk: card.risk,
    options: options.map(({ id: optionId, label, value }) => ({ id: optionId, label, value: typeof value === "object" ? null : value ?? null })),
    recommended: "1", recordAs: card.recordAs || "none", createdAt, expiresAt,
  };
  await updateSessionState(state, id, { lastCard });
  await writeSessionPointer(id, [path.dirname(state)]);
  return { ok: true, cardId, render: renderCard(stored), lastCard, ...(calibrationMode ? { calibrationMode } : {}) };
}

export async function loadLastCard(state, session, { now = Date.now() } = {}) {
  const lastCard = (await readSessionState(state, session)).lastCard;
  return lastCard && Date.parse(lastCard.expiresAt) > now ? lastCard : null;
}

async function applyRecordAs(root, card, option, freeText, { requestedBy, now }) {
  const recordAs = String(card.recordAs || "none");
  const value = option ? option.value : freeText;
  if (recordAs === "preference" && value && typeof value === "object" && value.promotion) return applyPromotion(root, value, card, { requestedBy, now });
  if (recordAs === "none" || recordAs === "preference") return { applied: recordAs, written: [] };
  if (recordAs === "decision") {
    const decisionRef = await writeDecision(root, {
      slug: String(card.topic).replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "").slice(0, 40) || "decision",
      topic: card.topic, kind: ["workflow", "contract", "convention", "preference"].includes(card.kind) ? card.kind : "convention",
      title: card.question, summary: `${card.question}: ${option ? option.label : freeText}`, requestedBy, origin: "card", cardId: card.cardId, now,
      problem: `${card.impact}\n\nChecked: ${card.checked.join("; ")}`,
      options: card.options.map(item => `${item.id}. ${item.label} — ${item.effect}`).join("\n"),
      decision: option ? `${option.label} — ${option.effect}` : freeText, value: option?.value, scopePaths: card.paths || [],
    });
    return { applied: "decision", written: [`.agrimap-agent/${decisionRef}`] };
  }
  if (!option && !recordAs.startsWith("local:spec:")) {
    return { applied: "none", written: [], needsAgent: true, message: "Free-text answers are applied by the agent with an explicit policy/project set, then shown once." };
  }
  if (recordAs === "policy:init") {
    const result = await initPolicy(root, value?.profile || "custom", value, requestedBy, { now, cardId: card.cardId });
    return result.ok ? { applied: recordAs, written: result.written } : { error: result };
  }
  if (recordAs.startsWith("policy:")) {
    const current = await loadPolicy(root);
    if (!current.exists) return { error: { ok: false, code: "POLICY_REQUIRED", next: { action: "run", command: "policy infer" } } };
    const result = await setPolicyValue(root, recordAs.slice(7), value, requestedBy, { now, cardId: card.cardId, confirm: true });
    return result.ok ? { applied: recordAs, written: result.written } : { error: result };
  }
  if (recordAs.startsWith("project:")) {
    const key = recordAs.slice(8);
    const current = await loadProject(root);
    const patch = value && typeof value === "object" && !Array.isArray(value) && (key === "specs.sync" || key === "developmentMode") ? value : null;
    const result = patch
      ? await applyProjectPatch(root, patch, requestedBy, { now, cardId: card.cardId })
      : !current.exists && key === "developmentMode"
        ? await initProject(root, value, {}, requestedBy, { now, cardId: card.cardId })
        : await setProjectValue(root, key, value, requestedBy, { now, cardId: card.cardId, confirm: true });
    return result.ok ? { applied: recordAs, written: result.written } : { error: result };
  }
  const id = recordAs.slice(11);
  const target = option ? option.value : freeText;
  const check = await verifySpecPath(root, id, target);
  if (!check.ok) return { error: check };
  const result = await setLocalPath(root, { kind: "spec", id, path: target, version: check.version, date: bangkokParts(now).date });
  return { applied: recordAs, written: result.written ? [result.path] : [] };
}

export async function recordChoice(state, { session, cardId, choice, note = null, requestedBy = null, now = Date.now() }) {
  const file = path.join(state, "runtime", "cards", `${safeSession(cardId)}.json`);
  const card = await readJsonFile(file);
  if (!card) return { ok: false, code: "CARD_NOT_FOUND", message: `No stored card ${cardId}.` };
  if (card.status === "closed") return { ok: true, cardId, alreadyRecorded: true, choice: card.closed };
  if (!(Date.parse(card.expiresAt) > now)) return { ok: false, code: "CARD_EXPIRED", message: "Create a new card; the stored one expired." };
  const raw = String(choice ?? "").trim();
  const freeText = raw.startsWith("free:") ? raw.slice(5).trim() : null;
  const option = freeText === null ? card.options.find(item => item.id === raw) : null;
  if (!option && !freeText) return { ok: false, code: "CARD_CHOICE_INVALID", message: `--choice must be one of ${card.options.map(item => item.id).join("|")} or free:<text>.` };
  const root = path.dirname(state);
  const effect = await applyRecordAs(root, card, option, freeText, { requestedBy, now: new Date(now) });
  if (effect.error) return { ...effect.error, ok: false, cardId };
  const closed = { choice: option ? option.id : `free:${freeText}`, label: option?.label || freeText, recommendedChosen: option?.id === "1", note, requestedBy, at: new Date(now).toISOString() };
  await writeJsonFile(file, { ...card, status: "closed", closed });
  if (card.memory) await recordSignal(root, { cardId: card.cardId, kind: card.kind, topic: card.topic, risk: card.risk, confidence: card.confidence, recommended: "1", chosen: closed.choice, chosenValue: option && typeof option.value !== "object" ? option.value ?? null : null, recommendedChosen: closed.recommendedChosen, source: "card" });
  const sessionState = await readSessionState(state, session || card.session);
  if (sessionState.lastCard?.cardId === card.cardId) await updateSessionState(state, session || card.session, { lastCard: undefined });
  return {
    ok: true, cardId, choice: closed.choice, label: closed.label, value: option ? option.value ?? null : freeText,
    recommendedChosen: closed.recommendedChosen, applied: effect.applied, written: effect.written,
    ...(effect.needsAgent ? { needsAgent: true, message: effect.message } : {}),
    log: { kind: card.kind, topic: card.topic, risk: card.risk, executionId: card.executionId },
  };
}


// Promotion card answers: team → decision with the value; me → local
// preference; decline → never offered again for that topic.
async function applyPromotion(root, value, card, { requestedBy, now }) {
  const prefs = await loadPreferences(root);
  if (value.scope === "decline") { await savePreferences(root, { declinedPromotion: [...prefs.declinedPromotion, value.promotion] }); return { applied: "preference", written: [] }; }
  if (value.scope === "me") { await savePreferences(root, { values: { ...prefs.values, [value.promotion]: value.value } }); return { applied: "preference", written: [] }; }
  const ref = await writeDecision(root, {
    slug: String(value.promotion).replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "").slice(0, 40) || "promoted",
    topic: value.promotion, kind: value.kind || "convention", title: `Default for ${value.promotion}`, summary: `${value.promotion} = ${value.value}`,
    requestedBy, origin: "promoted", cardId: card.cardId, now, value: value.value,
    problem: card.impact, options: card.options.map(item => `${item.id}. ${item.label} — ${item.effect}`).join("\n"), decision: `Use ${value.value} for ${value.promotion}.`,
  });
  return { applied: "decision", written: [`.agrimap-agent/${ref}`] };
}
