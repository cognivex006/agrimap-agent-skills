#!/usr/bin/env node
// agm-security patch (6.4.0): plan and verify fixes for findings the requester
// selected from an agm-security scan report. This script never edits product
// code: the agent applies each fix through the lane skill, then a rescan is the
// gate. "fixed" (claimed) is not "verified" (fingerprint gone in a completed
// rescan). Tiers come from sec-coverage.json patchTier:
//   AUTO_SAFE  contract-free mechanical fix; apply, then rescan
//   GUARDED    behavior can change; apply only with a regression test, then rescan
//   MANUAL     contract, consumer migration or a human step; never edited here
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCoverage, SECURITY_REPORT_SCHEMA } from "./security-scan.mjs";

export const PATCH_PLAN_SCHEMA = "agm-security-patch-plan/1";
export const PATCH_TIERS = ["AUTO_SAFE", "GUARDED", "MANUAL"];
const ACTION = {
  AUTO_SAFE: "Apply the surface file's 'Write it this way' shape in place; no contract change. Rescan.",
  GUARDED: "Apply only with a regression test for a valid request (or name why none exists); keep the response contract. Rescan.",
  MANUAL: "Do not edit. Report the decision needed (contract change, consumer migration or a human step such as secret rotation).",
};

export function planPatch({ report, select, coverage = loadCoverage() }) {
  if (report?.schema !== SECURITY_REPORT_SCHEMA) throw new Error(`PATCH_REPORT_SCHEMA: expected ${SECURITY_REPORT_SCHEMA}`);
  if (report.outcome === "blocked") throw new Error("PATCH_REPORT_BLOCKED: the scan did not complete; rescan before planning");
  const wanted = [...new Set((Array.isArray(select) ? select : String(select || "").split(",")).map(s => s.trim()).filter(Boolean))];
  if (!wanted.length) throw new Error("PATCH_SELECTION_REQUIRED: name the finding fingerprints the requester selected");
  const tierOf = new Map(coverage.classes.map(c => [c.id, c.patchTier]));
  const byFp = new Map(report.findings.map(f => [f.fingerprint, f]));
  const unknown = wanted.filter(fp => !byFp.has(fp));
  if (unknown.length) throw new Error(`PATCH_UNKNOWN_FINGERPRINT: ${unknown.join(", ")}`);
  const items = wanted.map(fp => {
    const f = byFp.get(fp);
    const tier = tierOf.get(f.class) || "MANUAL";
    return { fingerprint: fp, class: f.class, file: f.file, line: f.line, tier, action: ACTION[tier], editable: tier !== "MANUAL" };
  });
  return {
    schema: PATCH_PLAN_SCHEMA,
    root: report.root,
    baseReportFindings: report.findings.map(f => f.fingerprint),
    items,
    counts: Object.fromEntries(PATCH_TIERS.map(t => [t, items.filter(i => i.tier === t).length])),
    notSelected: report.findings.length - items.length,
  };
}

// Compare a completed rescan with the plan. claimed = fingerprints the agent
// says it changed. Never upgrades a claim without a completed rescan.
export function verifyPatch({ plan, rescan, claimed = [] }) {
  if (plan?.schema !== PATCH_PLAN_SCHEMA) throw new Error(`PATCH_PLAN_SCHEMA: expected ${PATCH_PLAN_SCHEMA}`);
  const done = rescan?.schema === SECURITY_REPORT_SCHEMA && rescan.outcome !== "blocked";
  const present = new Set((rescan?.findings || []).map(f => f.fingerprint));
  const claims = new Set(claimed);
  const items = plan.items.map(item => {
    let status;
    if (item.tier === "MANUAL") status = "manual-decision";
    else if (!done) status = claims.has(item.fingerprint) ? "fixed-unverified" : "not-verified";
    else if (present.has(item.fingerprint)) status = claims.has(item.fingerprint) ? "still-present" : "not-attempted";
    else status = "verified";
    return { ...item, status };
  });
  const touched = new Set(plan.items.filter(i => i.editable).map(i => i.file));
  const before = new Set(plan.baseReportFindings);
  const introduced = done ? rescan.findings.filter(f => touched.has(f.file) && !before.has(f.fingerprint)).map(f => ({ fingerprint: f.fingerprint, class: f.class, file: f.file, line: f.line })) : [];
  const ok = done && introduced.length === 0 && items.every(i => i.status === "verified" || i.status === "manual-decision");
  return { schema: "agm-security-patch-verify/1", rescan: done ? "completed" : "blocked", items, introduced, outcome: ok ? "verified" : done ? "incomplete" : "unverified" };
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  return out;
}
const readJson = file => JSON.parse(readFileSync(path.resolve(file), "utf8").replace(/^﻿/, ""));

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const opts = args(rest);
  try {
    let result;
    if (command === "plan" && opts.report) result = planPatch({ report: readJson(opts.report), select: opts.select });
    else if (command === "verify" && opts.plan && opts.rescan) result = verifyPatch({ plan: readJson(opts.plan), rescan: readJson(opts.rescan), claimed: String(opts.claimed || "").split(",").filter(Boolean) });
    else { console.error("usage: security-patch.mjs plan --report <scan.json> --select <fp,...> [--out <plan.json>]\n       security-patch.mjs verify --plan <plan.json> --rescan <scan.json> [--claimed <fp,...>]"); process.exit(2); }
    if (opts.out) writeFileSync(path.resolve(opts.out), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
    if (command === "verify" && result.outcome !== "verified") process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
