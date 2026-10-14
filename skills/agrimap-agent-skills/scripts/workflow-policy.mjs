// Team workflow policy (ACG C3): .agrimap-agent/policy/workflow.json.
// Validation is pure; inference is read-only; init/set are the only writers.
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { writeRecord as writeFile } from "./sensitive-recording.mjs";
import { defaultRun } from "./run-command.mjs";
import { bangkokParts, upsertProjectFact, writeDecision } from "./decision-records.mjs";

export const POLICY_PATH = ".agrimap-agent/policy/workflow.json";
// Owner decision 2026-10-14 (5.0.1): work branches are feature/<slug> or hotfix/<slug>
// only. Other kinds of change keep their commit type but branch as feature/.
export const WORK_TYPES = Object.freeze(["feature", "hotfix"]);
export const WORK_TYPE_ALIASES = Object.freeze({ feat: "feature", fix: "feature", bugfix: "feature", refactor: "feature", docs: "feature", chore: "feature", ci: "feature" });
export const BRANCH_PREFIXES = Object.freeze(WORK_TYPES.map(type => `${type}/`));

export function branchTypeOf(type) {
  const value = String(type || "").trim().toLowerCase();
  return WORK_TYPES.includes(value) ? value : WORK_TYPE_ALIASES[value] || null;
}

// A policy written before 5.0.1 may still list fix/refactor/docs/chore work types.
// They are dropped on load (not on disk) and reported, and the two allowed types
// always use their own prefix.
export function normalizeWorkTypes(policy) {
  const branching = policy?.branching;
  const types = branching?.workTypes;
  if (!types || typeof types !== "object") return [];
  const retired = Object.keys(types).filter(type => !WORK_TYPES.includes(type));
  for (const type of retired) delete types[type];
  for (const type of WORK_TYPES) if (types[type]) types[type].prefix = `${type}/`;
  if (!types.feature && branching.integrationBranch) {
    types.feature = { prefix: "feature/", base: branching.integrationBranch, target: branching.integrationBranch, backMerge: [] };
  }
  return retired;
}
export const DEFAULT_PROTECTED = Object.freeze(["main", "master", "develop", "jenkins", "jenkins-release"]);
const ENUMS = Object.freeze({
  status: ["draft", "confirmed"],
  profile: ["agrimap-jenkins", "gitflow", "trunk", "custom"],
  "branching.hostWorktreeBranch": ["push-as-team-name", "rename", "keep"],
  "delivery.commitConvention": ["agrimap", "conventional"],
  "delivery.changelog.mode": ["required-if-exists", "required", "none"],
  "integration.method": ["pull-request", "local-merge"],
  "integration.forge": ["auto", "github", "gitlab", "none"],
  "integration.mergeStrategy": ["merge-commit", "squash", "ff-only"],
  "integration.afterDelivery": ["offer", "open-pr", "none"],
  "integration.deleteBranchAfterMerge": ["ask", "always", "never"],
});
const KNOWN_KEYS = new Set(["schemaVersion", "status", "profile", "confirmedBy", "confirmedAt", "decisionRef", "branching", "delivery", "integration", "autonomy", "learning"]);

const clone = value => JSON.parse(JSON.stringify(value));

function workTypes(base, target = base, overrides = {}) {
  return Object.fromEntries(WORK_TYPES.map(type => [type, { prefix: `${type}/`, base, target, backMerge: [], ...(overrides[type] || {}) }]));
}

function profileDefaults(profile, { trunkBranch = "main" } = {}) {
  const integrationBranch = profile === "trunk" ? trunkBranch : "develop";
  const shapes = {
    "agrimap-jenkins": { stableBranch: null, protected: ["develop", "jenkins", "jenkins-release", "main", "master"], workTypes: workTypes("develop") },
    gitflow: { stableBranch: "main", protected: ["develop", "main", "master", "release/*"], workTypes: workTypes("develop", "develop", { hotfix: { base: "main", target: "main", backMerge: ["develop"] } }) },
    trunk: { stableBranch: trunkBranch, protected: ["main", "master"], workTypes: workTypes(trunkBranch) },
  };
  const shape = shapes[profile] || shapes.gitflow;
  return {
    schemaVersion: 1,
    status: "draft",
    profile: shapes[profile] ? profile : "custom",
    confirmedBy: null,
    confirmedAt: null,
    decisionRef: null,
    branching: {
      integrationBranch,
      stableBranch: shape.stableBranch,
      protected: shape.protected,
      workTypes: shape.workTypes,
      slug: { maxLength: 40, ticketPattern: null },
      hostBranchPatterns: ["^claude/", "^codex/", "^cursor/", "^gemini/", "^antigravity/", "^worktree-"],
      hostWorktreeBranch: "push-as-team-name",
      reuseMatchingWorkBranch: true,
    },
    delivery: {
      commitOnComplete: true,
      pushOnComplete: true,
      commitConvention: "agrimap",
      commitLanguage: "th",
      includeAuditArtifacts: true,
      changelog: { path: "changelog.md", mode: "required-if-exists" },
      trailers: ["AGM-Execution"],
    },
    integration: { method: "local-merge", forge: "auto", mergeStrategy: "merge-commit", afterDelivery: "offer", deleteBranchAfterMerge: "ask", verifyBeforeMerge: true },
    autonomy: { maxQuestionsPerRound: 3, reviewAtEnd: true, calibration: true },
    learning: { promoteAfter: 2 },
  };
}

export const PROFILES = Object.freeze({
  "agrimap-jenkins": profileDefaults("agrimap-jenkins"),
  gitflow: profileDefaults("gitflow"),
  trunk: profileDefaults("trunk"),
});

export function profilePolicy(profile, options) {
  return profileDefaults(profile, options);
}

function getPath(object, key) {
  return String(key).split(".").reduce((value, part) => (value && typeof value === "object" ? value[part] : undefined), object);
}

// Mirrors `git check-ref-format --branch` for the characters policy values use.
export function validBranchName(name) {
  const value = String(name ?? "");
  return Boolean(value) && !value.startsWith("-") && !value.startsWith("/") && !value.endsWith("/")
    && !value.endsWith(".") && !value.endsWith(".lock") && !value.includes("..") && !value.includes("@{")
    && !value.includes("//") && value !== "@" && !/[\s~^:?*[\\\x00-\x1f\x7f]/.test(value)
    && !value.split("/").some(part => part.startsWith("."));
}

export function isProtected(policy, branch) {
  const list = policy?.branching?.protected || DEFAULT_PROTECTED;
  return list.some(item => item.endsWith("/*") ? String(branch).startsWith(item.slice(0, -1)) : item === branch);
}

export function workTypeOf(policy, branch) {
  for (const [type, value] of Object.entries(policy?.branching?.workTypes || {})) {
    if (value?.prefix && String(branch).startsWith(value.prefix)) return type;
  }
  return null;
}

export function validatePolicy(policy) {
  const details = [];
  const warnings = [];
  const add = (code, field, message) => details.push({ code, field, message });
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return { ok: false, details: [{ code: "POLICY_INVALID", field: "", message: "policy must be a JSON object" }], warnings };
  if (policy.schemaVersion !== 1) add("POLICY_INVALID", "schemaVersion", "schemaVersion must be 1");
  const branching = policy.branching || {};
  const types = branching.workTypes || {};
  if (!Object.keys(types).length) add("POLICY_INVALID", "branching.workTypes", "at least one work type is required");
  const prefixes = new Set();
  for (const [type, value] of Object.entries(types)) {
    const prefix = value?.prefix;
    if (!/^[a-z][a-z0-9-]*\/$/.test(String(prefix || ""))) add("POLICY_INVALID", `branching.workTypes.${type}.prefix`, "prefix must match ^[a-z][a-z0-9-]*/$");
    else if (prefixes.has(prefix)) add("POLICY_INVALID", `branching.workTypes.${type}.prefix`, "prefixes must be unique");
    else if (!WORK_TYPES.includes(type) || prefix !== `${type}/`) add("POLICY_INVALID", `branching.workTypes.${type}`, "work branches are feature/<slug> or hotfix/<slug> only (owner decision 2026-10-14)");
    prefixes.add(prefix);
    for (const field of ["base", "target"]) if (!validBranchName(value?.[field])) add("POLICY_INVALID", `branching.workTypes.${type}.${field}`, "must be a valid branch name");
    if (!Array.isArray(value?.backMerge) || value.backMerge.some(item => !validBranchName(item))) add("POLICY_INVALID", `branching.workTypes.${type}.backMerge`, "must be a list of valid branch names");
    if (policy.profile === "agrimap-jenkins" && (value?.base !== branching.integrationBranch || value?.target !== branching.integrationBranch)) {
      add(type === "hotfix" ? "POLICY_HOTFIX_BASE_BREAKS_FF_PROMOTION" : "POLICY_BASE_BREAKS_FF_PROMOTION", `branching.workTypes.${type}`,
        `agrimap-jenkins promotes develop -> jenkins -> jenkins-release with --ff-only; ${type} must branch from and return to ${branching.integrationBranch}`);
    }
  }
  if (!validBranchName(branching.integrationBranch)) add("POLICY_INVALID", "branching.integrationBranch", "must be a valid branch name");
  if (branching.stableBranch !== null && branching.stableBranch !== undefined && !validBranchName(branching.stableBranch)) add("POLICY_INVALID", "branching.stableBranch", "must be a branch name or null");
  if (!Array.isArray(branching.protected) || !branching.protected.includes(branching.integrationBranch)) add("POLICY_INVALID", "branching.protected", "must include integrationBranch");
  else if (branching.protected.some(item => item.includes("*") && !/^[^*]+\/\*$/.test(item))) add("POLICY_INVALID", "branching.protected", "only a trailing /* glob is supported");
  if (policy.delivery?.commitOnComplete === false && policy.delivery?.pushOnComplete !== false) add("POLICY_INVALID", "delivery.pushOnComplete", "must be false when commitOnComplete is false");
  if (policy.status === "confirmed" && (!policy.confirmedBy || !policy.confirmedAt)) add("POLICY_INVALID", "confirmedBy", "confirmed policy requires confirmedBy and confirmedAt");
  for (const [field, allowed] of Object.entries(ENUMS)) {
    const value = getPath(policy, field);
    if (!allowed.includes(value)) add("POLICY_INVALID", field, `must be one of ${allowed.join("|")}`);
  }
  for (const key of Object.keys(policy)) if (!KNOWN_KEYS.has(key)) warnings.push(`POLICY_UNKNOWN_KEY:${key}`);
  return { ok: details.length === 0, details, warnings };
}

export async function loadPolicy(root) {
  const file = path.join(root, POLICY_PATH);
  let text;
  try { text = await readFile(file, "utf8"); } catch { return { exists: false, status: null, policy: null, validation: null }; }
  let policy;
  try { policy = JSON.parse(text); } catch { return { exists: true, status: null, policy: null, validation: { ok: false, details: [{ code: "POLICY_INVALID", field: "", message: "not valid JSON" }], warnings: [] } }; }
  const retired = normalizeWorkTypes(policy);
  const validation = validatePolicy(policy);
  if (retired.length) validation.warnings.push(`WORK_TYPE_RETIRED:${retired.join(",")} (branches are feature/ or hotfix/ only)`);
  return { exists: true, status: policy?.status || null, policy, validation };
}

const lines = value => String(value || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);

export async function inferPolicy(root, { run = defaultRun } = {}) {
  const git = args => run("git", args, { cwd: root });
  const present = name => stat(path.join(root, name)).then(() => true, () => false);
  const evidence = [];
  const score = { "agrimap-jenkins": 0, gitflow: 0, trunk: 0 };
  const remotes = lines(git(["branch", "-r", "--format=%(refname:short)"]).stdout);
  const has = name => remotes.includes(`origin/${name}`);
  const remoteUrl = git(["remote", "get-url", "origin"]);
  if (await present("Jenkinsfile") && await present("Jenkinsfile_Production")) { score["agrimap-jenkins"] += 3; evidence.push("Jenkinsfile + Jenkinsfile_Production"); }
  if (has("jenkins") || has("jenkins-release")) { score["agrimap-jenkins"] += 2; evidence.push(["jenkins", "jenkins-release"].filter(has).map(name => `origin/${name}`).join(", ")); }
  const mainName = has("main") ? "main" : has("master") ? "master" : null;
  if (has("develop") && mainName) { score.gitflow += 2; evidence.push(`origin/develop + origin/${mainName}`); }
  else if (mainName && !has("develop")) { score.trunk += 2; evidence.push(`origin/${mainName} without develop`); }
  for (const doc of ["DEVELOPMENT.md", "CONTRIBUTING.md"]) {
    const text = await readFile(path.join(root, doc), "utf8").catch(() => "");
    if (text.includes("feature/") && text.includes("develop")) { score.gitflow += 1; evidence.push(`${doc} mentions feature/ and develop`); break; }
  }
  const counts = {};
  for (const name of lines(git(["branch", "-a", "--format=%(refname:short)"]).stdout)) {
    const prefix = name.replace(/^origin\//, "").match(/^([a-z][a-z0-9-]*)\//)?.[1];
    if (prefix && prefix !== "origin") counts[prefix] = (counts[prefix] || 0) + 1;
  }
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const [[best, top], [, second]] = ranked;
  const noRemote = !remoteUrl.ok;
  const confidence = noRemote || top < 2 ? "low" : top >= 4 && top - second >= 3 ? "high" : "medium";
  const profile = top > 0 ? best : "gitflow";
  const proposal = profileDefaults(profile, { trunkBranch: mainName || "main" });
  for (const type of WORK_TYPES) {
    const observed = Object.keys(counts).find(prefix => counts[prefix] >= 2 && prefix === type);
    if (observed) evidence.push(`${type}/* ${counts[observed]} branches`);
  }
  const url = remoteUrl.stdout.trim();
  proposal.integration.forge = /github\.com/i.test(url) ? "github" : /gitlab/i.test(url) ? "gitlab" : noRemote ? "none" : "none";
  if (noRemote) { proposal.delivery.pushOnComplete = false; evidence.push("no origin remote"); }
  return { ok: true, proposal, confidence, evidence, card: policyCard(proposal, confidence, evidence) };
}

const CONFIDENCE_TH = { high: "สูง", medium: "กลาง", low: "ต่ำ" };

export function policyCard(proposal, confidence, evidence) {
  const base = proposal.branching.integrationBranch;
  const noPush = clone(proposal);
  noPush.delivery.pushOnComplete = false;
  const disabled = clone(proposal);
  disabled.branching.disabled = true;
  disabled.delivery.commitOnComplete = false;
  disabled.delivery.pushOnComplete = false;
  return {
    kind: "workflow",
    topic: "git/workflow-policy",
    risk: "R2",
    confidence,
    question: "ใช้ workflow นี้กับโปรเจกต์นี้ไหม",
    impact: "Agent จะแตก branch, commit และ push ตามนี้ทุกงาน (ถามครั้งเดียว)",
    checked: evidence.length ? evidence : ["ไม่พบ Jenkinsfile, remote branch หรือเอกสาร workflow"],
    options: [
      { id: "1", label: "ใช้ตามที่ตรวจพบ", effect: `feature|fix|hotfix/* แตกจาก ${base} → commit+push branch เมื่อเสร็จ → เปิด PR เมื่อสั่ง`, value: proposal },
      { id: "2", label: "ใช้แต่ไม่ push อัตโนมัติ", effect: "แตก branch + commit เมื่อเสร็จ, push เมื่อสั่ง", value: noPush },
      { id: "3", label: "ไม่ใช้ work branch", effect: "ทำบน branch ปัจจุบัน, commit เมื่อสั่งเท่านั้น (พฤติกรรมเดิม)", value: disabled },
    ],
    recommended: "1",
    recommendedReason: confidence === "high" ? `ไฟล์และ remote branch ตรง profile ${proposal.profile}` : `หลักฐานตรง profile ${proposal.profile} บางส่วน (ความมั่นใจ${CONFIDENCE_TH[confidence]})`,
    blocking: true,
    default: null,
    recordAs: "policy:init",
    paths: [],
    expiresHours: 24,
  };
}

function deepMerge(base, overrides) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return overrides === undefined ? base : overrides;
  const result = Array.isArray(base) || !base || typeof base !== "object" ? {} : { ...base };
  for (const [key, value] of Object.entries(overrides)) result[key] = deepMerge(result[key], value);
  return result;
}

async function writePolicyFile(root, policy) {
  const file = path.join(root, POLICY_PATH);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
}

export async function initPolicy(root, profile, overrides = {}, requestedBy, { now = new Date(), cardId = null } = {}) {
  if (!String(requestedBy || "").trim()) return { ok: false, code: "REQUESTER_REQUIRED", message: "--requested-by is required to confirm a team workflow policy." };
  const local = bangkokParts(now);
  const current = await loadPolicy(root);
  const policy = deepMerge(profileDefaults(profile), overrides || {});
  Object.assign(policy, { status: "confirmed", profile: overrides?.profile || profile, confirmedBy: requestedBy, confirmedAt: local.date });
  const validation = validatePolicy(policy);
  if (!validation.ok) return { ok: false, code: validation.details[0].code === "POLICY_INVALID" ? "POLICY_INVALID" : validation.details[0].code, details: validation.details, written: [] };
  const summary = `${policy.profile}: work branches from ${policy.branching.integrationBranch}; commit ${policy.delivery.commitOnComplete ? "on" : "off"}, push ${policy.delivery.pushOnComplete ? "on" : "off"}; ${policy.integration.method}`;
  const decisionRef = await writeDecision(root, {
    slug: "git-workflow-policy", topic: "git/workflow-policy", kind: "workflow", title: "Team git workflow policy",
    summary, requestedBy, origin: cardId ? "card" : "explicit", cardId, now,
    supersedes: current.exists && current.policy?.decisionRef ? current.policy.decisionRef : null,
    problem: "Agents need one confirmed team workflow for work branches, delivery and integration.",
    options: "Detected profile, detected profile without automatic push, or no work branches.",
    decision: `${summary}. Standing authorization covers only commit/push of the execution work branch; protected branches, PR merge, tags and force pushes still need an explicit instruction.`,
  });
  policy.decisionRef = decisionRef;
  await writePolicyFile(root, policy);
  const fact = await upsertProjectFact(root, "Workflow policy", `\`${POLICY_PATH}\` (${policy.profile}, confirmed ${local.date} by ${requestedBy})`);
  return { ok: true, written: [POLICY_PATH, `.agrimap-agent/${decisionRef}`, fact], policy };
}

function parseValue(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

// Validates the whole resulting policy before writing; unknown keys are kept.
// confirm:true (a card answer) confirms a draft policy once required fields validate.
export async function setPolicyValue(root, key, value, requestedBy, { now = new Date(), cardId = null, confirm = false } = {}) {
  const current = await loadPolicy(root);
  if (!current.exists || !current.policy) return { ok: false, code: "POLICY_REQUIRED", next: { action: "run", command: "policy infer" } };
  const parts = String(key || "").split(".").filter(Boolean);
  if (!parts.length || parts.some(part => ["__proto__", "constructor", "prototype"].includes(part))) return { ok: false, code: "POLICY_KEY_INVALID" };
  const policy = clone(current.policy);
  let cursor = policy;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== "object") cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = parseValue(value);
  if (confirm) policy.status = "confirmed";
  const wasConfirmed = policy.status === "confirmed";
  if (wasConfirmed) {
    if (!String(requestedBy || "").trim()) return { ok: false, code: "REQUESTER_REQUIRED", message: "Changing a confirmed team policy requires --requested-by." };
    Object.assign(policy, { confirmedBy: requestedBy, confirmedAt: bangkokParts(now).date });
  }
  const validation = validatePolicy(policy);
  if (!validation.ok) return { ok: false, code: "POLICY_INVALID", details: validation.details, written: [] };
  const written = [POLICY_PATH];
  if (wasConfirmed) {
    policy.decisionRef = await writeDecision(root, {
      slug: "git-workflow-policy", topic: "git/workflow-policy", kind: "workflow", title: `Workflow policy change: ${key}`,
      summary: `${key} = ${JSON.stringify(parseValue(value))}`.slice(0, 140), requestedBy, origin: cardId ? "card" : "explicit", cardId, now,
      supersedes: current.policy.decisionRef || null,
      problem: `The team changed ${key} of the confirmed workflow policy.`,
      options: "Keep the previous value or apply the requested value.",
      decision: `Apply ${key} = ${JSON.stringify(parseValue(value))}.`,
    });
    written.push(`.agrimap-agent/${policy.decisionRef}`);
  }
  await writePolicyFile(root, policy);
  return { ok: true, written, policy, warnings: validation.warnings };
}
