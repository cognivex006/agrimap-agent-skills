#!/usr/bin/env node
// agm-security scan (6.3.0): read-only security report for an AgriMap product
// root. Golden Lint runs first and is the only detector (decision 0001: read,
// never edit it). Classes without a detector (sec-coverage.json
// scanner.status=not-implemented) are listed as manual-review, and anything
// the runner could not check is listed as blocked; nothing is reported as
// passing by omission. Prints the report; writes files only with --write.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SECURITY_REPORT_SCHEMA = "agm-security-report/1";
const here = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(here, "..");

export function loadCoverage(dir = skillDir) {
  return JSON.parse(readFileSync(path.join(dir, "assets", "sec-coverage.json"), "utf8"));
}

// Installed Golden Lint skill directory, or null. AGM_GOLDEN_LINT_DIR wins.
export function findGoldenLint({ env = process.env, home = os.homedir() } = {}) {
  const ok = (dir) => dir && existsSync(path.join(dir, "scripts", "agm-lint.mjs")) && existsSync(path.join(dir, "assets", "security-classes.json"));
  if (env.AGM_GOLDEN_LINT_DIR) return ok(env.AGM_GOLDEN_LINT_DIR) ? env.AGM_GOLDEN_LINT_DIR : null;
  try {
    const installed = JSON.parse(readFileSync(path.join(home, ".claude", "plugins", "installed_plugins.json"), "utf8"));
    const entry = Object.entries(installed.plugins || {}).find(([key]) => key.startsWith("agrimap-golden-lint-skills@"))?.[1];
    const record = Array.isArray(entry) ? entry[0] : entry;
    const dir = record && path.join(record.installPath, "skills", "agrimap-golden-lint-skills");
    return ok(dir) ? dir : null;
  } catch { return null; }
}

// Stable across line moves: class + file + symbol, else Golden Lint's own
// content fingerprint. Never the line number alone.
export function fingerprint({ classId, file, symbol, evidence }) {
  const anchor = symbol || evidence || "";
  return createHash("sha256").update(`${classId}\n${file}\n${anchor}`).digest("hex").slice(0, 20);
}

export function buildReport({ root, coverage, lint, goldenLintDir, goldenLintVersion, error }) {
  const byDetector = new Map(coverage.classes.flatMap((c) => c.scanner.detectors.map((d) => [d, c.id])));
  const findings = [];
  for (const f of lint?.findings || []) {
    const classId = f.authority?.securityStandard?.class || byDetector.get(f.detectorId);
    if (!classId) continue;
    const symbol = f.symbol || f.member || null;
    findings.push({
      fingerprint: fingerprint({ classId, file: f.path, symbol, evidence: f.evidenceFingerprint }),
      class: classId,
      detector: f.detectorId,
      severity: f.severity || "unknown",
      disposition: f.disposition,
      file: f.path,
      line: f.line ?? null,
      symbol,
      owasp: f.authority?.securityStandard?.category || null,
      cwe: f.authority?.securityStandard?.cwe || [],
      observation: f.observation || null,
    });
  }
  findings.sort((a, b) => a.class.localeCompare(b.class) || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  const blocked = [];
  if (!goldenLintDir) blocked.push({ scope: "all automated classes", reason: "Golden Lint is not installed; set AGM_GOLDEN_LINT_DIR or install agrimap-golden-lint-skills." });
  else if (error) blocked.push({ scope: "all automated classes", reason: `Golden Lint did not complete: ${error}` });
  for (const file of lint?.files || []) {
    if (!file.selected && file.language && file.language !== "unknown" && file.reason !== "outside-declared-product-layout") blocked.push({ scope: file.path, reason: file.reason });
  }
  for (const item of lint?.limitations || []) if (/LEXER_UNAVAILABLE|not checked|unavailable/i.test(item)) blocked.push({ scope: "runner limitation", reason: item });
  const manualReview = coverage.classes.filter((c) => c.scanner.status === "not-implemented")
    .map((c) => ({ class: c.id, title: c.title, surfaces: c.authoring.surfaces }));
  const ran = Boolean(goldenLintDir && lint && !error);
  return {
    schema: SECURITY_REPORT_SCHEMA,
    root,
    scanner: { name: "agrimap-golden-lint-skills", version: goldenLintVersion || null, recordedVersion: coverage.goldenLint.version, status: ran ? "completed" : "blocked" },
    coverage: { selectedFiles: lint?.coverage?.selected ?? 0, automatedClasses: coverage.classes.filter((c) => c.scanner.status !== "not-implemented").length, manualReviewClasses: manualReview.length },
    findings,
    manualReview,
    blocked,
    outcome: !ran ? "blocked" : findings.length ? "findings" : "no-findings",
  };
}

export function renderMarkdown(report) {
  const rows = report.findings.map((f) => `| ${f.class} | ${f.severity} | \`${f.file}\`${f.line ? `:${f.line}` : ""} | ${f.detector} | \`${f.fingerprint}\` |`);
  return [
    "# Security scan",
    "",
    `- Schema: \`${report.schema}\``,
    `- Root: \`${report.root}\``,
    `- Scanner: ${report.scanner.name} ${report.scanner.version || "unknown"} (${report.scanner.status}; coverage recorded for ${report.scanner.recordedVersion})`,
    `- Outcome: **${report.outcome}** — ${report.findings.length} finding(s), ${report.manualReview.length} class(es) need manual review, ${report.blocked.length} blocked item(s)`,
    "",
    "## Findings",
    "",
    rows.length ? ["| Class | Severity | Location | Detector | Fingerprint |", "| --- | --- | --- | --- | --- |", ...rows].join("\n") : "None reported by the scanner. This is not a pass for the manual-review classes below.",
    "",
    "## Manual review (no detector)",
    "",
    ...report.manualReview.map((c) => `- ${c.class} ${c.title} (${c.surfaces.join(", ") || "—"})`),
    "",
    "## Blocked",
    "",
    ...(report.blocked.length ? report.blocked.map((b) => `- ${b.scope}: ${b.reason}`) : ["- None."]),
    "",
  ].join("\n");
}

function runGoldenLint(dir, root) {
  try {
    const out = execFileSync(process.execPath, [path.join(dir, "scripts", "agm-lint.mjs"), "scan", "--root", root, "--golden", path.resolve(skillDir, "..", ".."), "--source-mode", "checkout", "--format", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
    return { lint: JSON.parse(out) };
  } catch (error) {
    // Exit 3 = governance needs review; the scan itself completed.
    if (error.status === 3 && error.stdout) { try { return { lint: JSON.parse(error.stdout) }; } catch { /* fall through */ } }
    return { error: `exit ${error.status ?? "unknown"}` };
  }
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  return out;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const opts = args(rest);
  if (command !== "scan" || !opts.root) {
    console.error("usage: security-scan.mjs scan --root <product-root> [--format json|markdown] [--write]");
    process.exit(2);
  }
  const root = path.resolve(opts.root);
  const coverage = loadCoverage();
  const goldenLintDir = findGoldenLint();
  const version = goldenLintDir ? (() => { try { return JSON.parse(readFileSync(path.resolve(goldenLintDir, "..", "..", "package.json"), "utf8")).version; } catch { return null; } })() : null;
  const { lint, error } = goldenLintDir ? runGoldenLint(goldenLintDir, root) : {};
  const report = buildReport({ root, coverage, lint, goldenLintDir, goldenLintVersion: version, error });
  if (opts.write) {
    const dir = path.join(root, ".agrimap-agent", "reports", "security", new Date().toISOString().replace(/[:.]/g, "-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2) + "\n");
    writeFileSync(path.join(dir, "report.md"), renderMarkdown(report));
    report.written = path.relative(root, dir).split(path.sep).join("/");
  }
  console.log(opts.format === "markdown" ? renderMarkdown(report) : JSON.stringify(report, null, 2));
  process.exitCode = report.outcome === "blocked" ? 1 : 0;
}
