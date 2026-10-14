import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TASK_ARTIFACT_SCHEMA_START = "<!-- BEGIN GENERATED TASK ARTIFACT SCHEMA -->";
export const TASK_ARTIFACT_SCHEMA_END = "<!-- END GENERATED TASK ARTIFACT SCHEMA -->";

const defaultSkillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function loadTaskArtifactSchema(skillRoot = defaultSkillRoot) {
  return JSON.parse(await readFile(path.join(skillRoot, "assets", "task-artifact-schema.json"), "utf8"));
}

export function taskArtifactRequiredSections(definition = {}) {
  const headings = new Set(definition.requiredSections || []);
  for (const cases of Object.values(definition.requiredSectionsByField || {})) {
    for (const conditionalHeadings of Object.values(cases || {})) {
      for (const heading of conditionalHeadings || []) headings.add(heading);
    }
  }
  return [...headings];
}

export function taskArtifactSchemaIssues(schema) {
  const issues = [];
  if (!Number.isInteger(schema?.schemaVersion) || schema.schemaVersion < 1) {
    issues.push("schemaVersion must be a positive integer");
  }
  if (!schema?.artifacts || typeof schema.artifacts !== "object" || Array.isArray(schema.artifacts)) {
    issues.push("artifacts must be an object");
    return issues;
  }
  const workflowDepths = schema.workflowDepths || [];
  if (!Array.isArray(workflowDepths) || workflowDepths.length === 0 || workflowDepths.some((depth) => !["light", "standard", "regulated"].includes(depth))) {
    issues.push("workflowDepths must contain only light|standard|regulated");
  }
  const artifactlessDepths = schema.artifactlessDepths || [];
  if (JSON.stringify(artifactlessDepths) !== JSON.stringify(["light"])) {
    issues.push("artifactlessDepths must be exactly light");
  }
  const phaseOrder = schema.phaseOrder || [];
  if (JSON.stringify(phaseOrder) !== JSON.stringify(["contract", "verification", "closure"])) {
    issues.push("phaseOrder must be contract|verification|closure");
  }
  for (const [file, definition] of Object.entries(schema.artifacts)) {
    if (!file.endsWith(".md")) issues.push(`${file}: artifact key must be a Markdown filename`);
    if (!definition?.template) issues.push(`${file}: template is required`);
    if (!definition?.purpose) issues.push(`${file}: purpose is required`);
    if (!phaseOrder.includes(definition?.writePhase)) issues.push(`${file}: writePhase must exist in phaseOrder`);
    if (!String(definition?.writer || "").trim()) issues.push(`${file}: writer is required`);
    if (typeof definition?.scaffoldAtStart !== "boolean") issues.push(`${file}: scaffoldAtStart must be boolean`);
    if (!Array.isArray(definition?.requiredForDepths) || definition.requiredForDepths.length === 0) {
      issues.push(`${file}: requiredForDepths must be non-empty`);
    } else if (definition.requiredForDepths.some((depth) => !workflowDepths.includes(depth))) {
      issues.push(`${file}: requiredForDepths contains an unknown workflow depth`);
    }
    for (const field of definition?.requiredFields || []) {
      if (!field?.label) issues.push(`${file}: every required field needs a label`);
      if (field?.enum && (!Array.isArray(field.enum) || field.enum.length === 0)) {
        issues.push(`${file}:${field?.label || "unknown"}: enum must contain at least one value`);
      }
    }
  }
  for (const file of schema.scaffoldOrder || []) {
    if (!schema.artifacts[file]) issues.push(`scaffoldOrder references unknown artifact: ${file}`);
    else if (!schema.artifacts[file].scaffoldAtStart) issues.push(`scaffoldOrder contains non-start artifact: ${file}`);
  }
  for (const [file, definition] of Object.entries(schema.artifacts)) {
    if (definition.scaffoldAtStart && !(schema.scaffoldOrder || []).includes(file)) {
      issues.push(`${file}: scaffoldAtStart artifact is missing from scaffoldOrder`);
    }
  }
  return issues;
}

function tableCell(values) {
  return values.length ? values.map((value) => `\`${value}\``).join("<br>") : "—";
}

export function renderTaskArtifactSchemaDocs(schema) {
  if (schema.runtimeArtifactVersion === 3) return [
    TASK_ARTIFACT_SCHEMA_START,
    'Ordinary answers: no execution/task artifacts. Bounded writes: concise memory/audit.',
    'Tracked v3 work: the savepoint in memory/current (goal, done, remaining, next step, decisions); no new tasks/ directories.',
    'Separate analysis/QA/results/reports are consumer-requested deliverables, not a five-file gate.',
    'Legacy v2 five-file validation remains in assets/task-artifact-schema.json for existing executions only; it is not the new-work checklist.',
    TASK_ARTIFACT_SCHEMA_END
  ].join('\n');
  const rows = Object.entries(schema.artifacts || {}).map(([file, definition]) => {
    const fields = (definition.requiredFields || []).map((field) => field.label);
    const sections = taskArtifactRequiredSections(definition);
    const phaseOwner = `\`${definition.writePhase}\`<br>${definition.writer}`;
    return `| \`${file}\` | ${phaseOwner} | ${tableCell(definition.requiredForDepths || [])} | \`${definition.template}\` | ${definition.purpose} | ${tableCell(fields)} | ${tableCell(sections)} |`;
  });
  const triggers = (schema.qaFullTriggers || []).map((trigger, index) => `${index + 1}. ${trigger}`);
  const rules = schema.crossArtifactRules || {};
  const completionRules = [
    `Depths ${tableCell(schema.artifactlessDepths || [])} create no task directory or task artifacts.`,
    `Tracked start scaffolds only ${tableCell(schema.scaffoldOrder || [])}; \`analysis.md\`, \`qa.md\`, and \`result.md\` are phase-owned completion artifacts.`,
    `Standard completion writes \`qa.md\` with status \`not-applicable\` and records result QA status/mode as \`not-applicable\`.`,
    `Regulated accepted QA statuses: ${tableCell(rules.acceptedQaStatuses || [])}.`,
    `At regulated depth, \`${rules.requesterField}\` and \`${rules.decisionOwnerField}\` match across brief, QA, and result.`,
    `Regulated QA identity (${tableCell(rules.qaIdentityFields || [])}) must differ from implementation identity (${tableCell(rules.implementationIdentityFields || [])}).`,
    `Delivery boundaries ${tableCell(rules.fullQaBoundaries || [])} require regulated depth and \`QA mode: full\`.`,
    `A regulated full run records \`${rules.lightSequenceField}: ${rules.fullLightSequence}\`; light runs may record only ${tableCell(rules.lightAllowedSequences || [])}.`,
  ];
  return [
    TASK_ARTIFACT_SCHEMA_START,
    "<!-- Generated by npm run sync from skills/agrimap-agent-skills/assets/task-artifact-schema.json. -->",
    "| Artifact | Write phase / owner | Required depths | Template | Purpose | Required fields | Required sections |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "Completion cross-artifact gates:",
    "",
    ...completionRules.map((rule) => `- ${rule}`),
    "",
    "Full QA is mandatory when any schema trigger applies:",
    "",
    ...triggers,
    TASK_ARTIFACT_SCHEMA_END,
  ].join("\n");
}

export function replaceTaskArtifactSchemaDocs(content, generatedBlock) {
  const start = content.indexOf(TASK_ARTIFACT_SCHEMA_START);
  const end = content.indexOf(TASK_ARTIFACT_SCHEMA_END);
  if (start < 0 || end < start) {
    throw new Error(`Missing generated schema markers: ${TASK_ARTIFACT_SCHEMA_START} / ${TASK_ARTIFACT_SCHEMA_END}`);
  }
  const after = end + TASK_ARTIFACT_SCHEMA_END.length;
  return `${content.slice(0, start)}${generatedBlock}${content.slice(after)}`;
}
