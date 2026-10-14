// Shared v3 decisions. No filesystem, database or subprocess effects.
export const READ_OPERATIONS = new Set(['analyze', 'diagnose', 'simulate', 'plan', 'design', 'architect', 'review', 'history', 'qa', 'help', 'explain']);

export function selectWorkflow({ operation, action, tracking = false, risk = '', depth, persist = false } = {}) {
  const readOnly = READ_OPERATIONS.has(action || operation)
    || (operation === 'doctor' && (!action || ['status', 'version', 'check'].includes(action)));
  if (readOnly && !tracking && !persist) return { depth: null, reason: 'direct-answer', task: false };
  if (depth && !['light', 'standard', 'regulated'].includes(depth)) throw new Error('INVALID_WORKFLOW_DEPTH');
  const regulated = /^(external-publication|persisted-data-change|public-contract-change|independent-assurance|security-boundary)$/.test(risk);
  const selected = regulated ? 'regulated' : tracking ? 'standard' : 'light';
  if (depth && depth !== selected) throw new Error('WORKFLOW_DEPTH_REASON_MISMATCH');
  return { depth: selected, reason: regulated ? risk : tracking ? 'resume-or-handoff' : 'bounded-authorized-work', task: selected !== 'light' };
}

export function instructionProfile({ measuredProfile, taskProfile, model } = {}) {
  // Names and parameter counts are not capability evidence.
  const profile = taskProfile || measuredProfile || 'guided';
  if (!['outcome', 'guided', 'bounded'].includes(profile)) throw new Error('INVALID_INSTRUCTION_PROFILE');
  return { profile, model: model || 'unknown', changesAuthority: false };
}

export function verificationDecision({ kind, behaviorChanged = false, sharedContract = false, release = false, evidenceMatches = false } = {}) {
  if (evidenceMatches) return 'reuse-matching-evidence';
  if (kind === 'discussion') return 'none';
  if (kind === 'docs') return 'structure-and-links';
  if (release || sharedContract) return 'affected-contract-and-delivery-checks';
  return behaviorChanged ? 'targeted-regression' : 'proportional-static-check';
}

export function unquotedIntent(prompt = '') {
  return String(prompt).replace(/```[\s\S]*?```/g, '').replace(/^\s*>.*$/gm, '')
    .replace(/`[^`]*`/g, '').replace(/"[^"\n]*"|“[^”\n]*”/g, '');
}

export function classifyRequest({ prompt = '', explicit = false, recognized = false, relevant = false } = {}) {
  const text = unquotedIntent(prompt).trim();
  if (!text) return { active: false, reason: 'no-current-intent' };
  if (!explicit && /^\s*(?:example|ตัวอย่าง)\s*:/i.test(text)) return { active: false, reason: 'non-project-example' };
  // Require a relationship to the current software work, not a keyword alone.
  const projectAnchor = /\b(?:agrimap|agm(?:ws|wa|bo)-[\w-]+|(?:this|our|current)\s+(?:repo(?:sitory)?|project|code|file|service|pipeline|release|branch))\b|(?:ในโครงการ|ในโปรเจกต์|โครงการนี้|โปรเจกต์นี้|โค้ด.*นี้|ไฟล์.*นี้|งานเดิม)/i.test(text);
  const changeIntent = /\b(?:implement|fix|refactor|modify|update|build|deploy|merge|push|bump|migrate)\b|(?:แก้ไข|ปรับแก้|ปรับปรุง|เพิ่ม|สร้าง|อัปเดต)/i.test(text);
  const softwareTarget = /\b(?:repo(?:sitory)?|project|code|skill|plugin|hook|pipeline|release|branch|changelog|sql|schema|api|test|component|service|version|bug|table|procedure|sp|view|controller|endpoint|page)\b|(?:โครงการ|โปรเจกต์|โค้ด|สกิล|แพ็กเกจ|ฐานข้อมูล|เวอร์ชัน|ไฟล์|บั๊ก|ตาราง|โปรซีเยอร์|หน้าจอ)/i.test(text);
  const projectTerms = projectAnchor || (changeIntent && softwareTarget);
  return { active: explicit || (recognized && (relevant || projectTerms)), reason: explicit ? 'explicit-invocation' : recognized && (relevant || projectTerms) ? 'relevant-project-intent' : 'ordinary-conversation' };
}

// Mirrors supporting[sql-context-pack].readOnlyTools in assets/skill-routing.json (tests keep them equal).
const SQL_READ_TOOLS = new Set(['sqlctx_get_capabilities', 'sqlctx_get_active_profile', 'sqlctx_list_context_index', 'sqlctx_list_managed_folders', 'sqlctx_query_data']);
// Mirrors supporting[sql-context-pack].migrateTools: only agm-sql context migrate (5.0.1).
const SQL_MIGRATE_TOOLS = new Set([...SQL_READ_TOOLS, 'sqlctx_create_catalog', 'sqlctx_get_catalog_status', 'sqlctx_get_materialization_plan', 'sqlctx_list_sitemap', 'sqlctx_export_batch', 'sqlctx_get_export_status', 'sqlctx_list_exports', 'sqlctx_validate_exports']);
export function sqlContextToolAllowed(name, { action = null } = {}) { return action === 'context-migrate' ? SQL_MIGRATE_TOOLS.has(name) : SQL_READ_TOOLS.has(name); }

// Defense in depth for the AgriMap adapter. The managed service's read-only
// profile/relational parser remains authoritative; this is not a SQL parser.
export function validateReadQuery(sql) {
  const text = String(sql || '').replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, ' ').trim();
  if (!/^SELECT\b/i.test(text) || /;\s*\S/.test(text)
      || /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|MERGE|TRUNCATE|EXEC(?:UTE)?|INTO|OPENROWSET|OPENQUERY|OPENDATASOURCE)\b/i.test(text)) {
    return { ok: false, code: 'SQL_CONTEXT_READ_ONLY' };
  }
  return { ok: true };
}

// Short replies after a card or delivery (ACG C6). Pure: the caller supplies the
// stored card and, optionally, the policy's allowed integration targets.
export const QUESTION_PATTERN = /[?？]|ยังไง|อย่างไร|ไหม|มั้ย|หรือเปล่า|รึเปล่า|ได้ไหม|\b(?:how|what|why|should|can i)\b/iu;
export const TARGET_ALIASES = Object.freeze({ dev: 'develop', prod: 'jenkins-release', inh: 'jenkins', inhouse: 'jenkins' });
const RELEASE_TARGETS = new Set(['jenkins', 'jenkins-release']);
const POLITE_SUFFIX = /(?:\s*(?:ครับ|ค่ะ|คะ|นะ|จ้า|จ้ะ|เลย|ด้วย|หน่อย|please|pls|[.!]))+$/u;
const INTEGRATE = String.raw`(?:merge|รวม(?:ได้|เลย)?|ship(?: it)?|lgtm(?: merge)?|ผ่าน(?:แล้ว)?(?:\s*(?:รวม|merge)(?:ได้|เลย)?)?)`;
const WHEN_GREEN = String.raw`\s*(?:เมื่อ|when)\s*(?:ci|pipeline|checks?)\s*(?:ผ่าน|green|pass(?:es)?)`;
const SHORT_PATTERNS = [
  ['select-option', /^(?:ข้อ\s*|option\s*|ตัวเลือก(?:ที่)?\s*)?([1-9])$/u],
  ['integrate', new RegExp(`^${INTEGRATE}${WHEN_GREEN}$`, 'u'), { whenGreen: true }],
  ['integrate', new RegExp(`^${INTEGRATE}$`, 'u')],
  ['integrate', /^(?:merge|รวม|เอา)\s*(?:เข้า|to|into|ไป|ขึ้น)?\s*([a-z0-9._/-]+)$/u, { target: true }],
  ['open-pr', /^(?:pr|mr|เปิด\s*(?:pr|mr)|ส่ง\s*(?:รีวิว|review)|create\s+(?:pr|mr))$/u],
  ['update-branch', /^(?:(?:อัปเดต|อัพเดท|update|sync)(?:\s*branch)?(?:\s*(?:กับ|with|จาก|from)\s*[a-z0-9._/-]+)?|rebase)$/u],
  ['continue', /^(?:แก้ต่อ|ทำต่อ|continue|ยังไม่\s*(?:merge|รวม))$/u],
  ['park', /^(?:พัก(?:ไว้)?|hold|park|รอก่อน)$/u],
  ['abandon', /^(?:ทิ้ง(?:\s*branch)?|ยกเลิก\s*branch|abandon|discard)$/u],
];
const QUESTION_TOPICS = [['integrate', /merge|รวม|ship/u], ['open-pr', /\bpr\b|\bmr\b|รีวิว|review/u], ['update-branch', /update|sync|rebase|อัปเดต|อัพเดท/u], ['abandon', /ทิ้ง|abandon|discard/u]];

export function resolveShortIntent(text, { lastCard = null, now = Date.now(), allowedTargets = null } = {}) {
  let value = unquotedIntent(text).trim().toLowerCase();
  if (!value) return { intent: 'none', reason: 'empty-or-quoted' };
  if (value.length > 60) return { intent: 'none', reason: 'not-short' };
  if (QUESTION_PATTERN.test(value)) {
    const about = QUESTION_TOPICS.find(([, pattern]) => pattern.test(value))?.[0] || 'integration';
    return { intent: 'question', about, reason: 'question-guard' };
  }
  value = value.replace(POLITE_SUFFIX, '').trim();
  for (const [intent, pattern, flags = {}] of SHORT_PATTERNS) {
    const match = value.match(pattern);
    if (!match) continue;
    if (intent === 'select-option') {
      const expired = !lastCard || !(Date.parse(lastCard.expiresAt) > now);
      const option = lastCard?.options?.find(item => String(item.id) === match[1]);
      if (expired || !option) return { intent: 'none', reason: expired ? 'no-active-card' : 'option-not-in-card' };
      return { intent, option: option.id, label: option.label, cardId: lastCard.cardId, reason: 'card-option' };
    }
    const result = { intent, reason: 'short-intent', ...(flags.whenGreen ? { whenGreen: true } : {}) };
    if (flags.target) {
      const target = TARGET_ALIASES[match[1]] || match[1];
      result.target = target;
      if (RELEASE_TARGETS.has(target)) return { ...result, code: 'TARGET_IS_RELEASE_FLOW', reason: 'release-target' };
      if (Array.isArray(allowedTargets) && !allowedTargets.includes(target)) return { ...result, code: 'TARGET_NOT_ALLOWED', reason: 'target-outside-policy' };
    }
    return result;
  }
  return { intent: 'none', reason: 'no-match' };
}
