#!/usr/bin/env node
// Agent profile registry (6.4.0, light): role, lanes, rule packs and a version
// hash. Profiles never grant permission; the role table in
// subagents-and-branches.md and the Leader's packet decide what a subagent may do.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(here, "..");
export const ROLES = ["Explorer", "Analyst", "Worker", "Verifier"];
export const LANES = ["be-main", "be-library", "fe-main", "fe-library", "sql", "*"];
const FIELDS = new Set(["id", "role", "lanes", "rulePacks"]);
// Anything that looks like authority is rejected outright.
const AUTHORITY = /^(?:permissions?|tools?|allowedTools|writes?|depth|qaMode|mode|approve|approval|publish|push|merge|release|model|tier|sql|database)$/i;

export function loadProfiles(dir = skillDir) {
  return JSON.parse(readFileSync(path.join(dir, "assets", "agent-profiles.json"), "utf8"));
}

export function validateProfiles(registry, dir = skillDir) {
  const errors = [];
  const ids = new Set();
  for (const profile of registry.profiles || []) {
    const id = profile.id || "(missing id)";
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(String(profile.id || ""))) errors.push(`${id}: invalid id`);
    if (ids.has(profile.id)) errors.push(`${id}: duplicate id`);
    ids.add(profile.id);
    for (const key of Object.keys(profile)) {
      if (AUTHORITY.test(key)) errors.push(`${id}: "${key}" grants authority; profiles cannot grant permission`);
      else if (!FIELDS.has(key)) errors.push(`${id}: unknown field "${key}"`);
    }
    if (!ROLES.includes(profile.role)) errors.push(`${id}: unknown role ${profile.role}`);
    if (!Array.isArray(profile.lanes) || !profile.lanes.length || profile.lanes.some(lane => !LANES.includes(lane))) errors.push(`${id}: lanes must be from ${LANES.join(", ")}`);
    if (!Array.isArray(profile.rulePacks) || !profile.rulePacks.length) errors.push(`${id}: needs at least one rule pack`);
    for (const pack of profile.rulePacks || []) if (!existsSync(path.join(dir, "references", pack))) errors.push(`${id}: missing rule pack ${pack}`);
  }
  return errors;
}

// sha256 over the profile JSON and each rule-pack file (LF-normalized), first 16 hex.
export function profileHash(profile, dir = skillDir) {
  const hash = createHash("sha256").update(JSON.stringify({ id: profile.id, role: profile.role, lanes: profile.lanes, rulePacks: profile.rulePacks }));
  for (const pack of profile.rulePacks) hash.update(`\n${pack}\n`).update(readFileSync(path.join(dir, "references", pack), "utf8").replaceAll("\r\n", "\n"));
  return hash.digest("hex").slice(0, 16);
}

export function resolveProfile(registry, { role, lane }, dir = skillDir) {
  const match = registry.profiles.find(p => p.role === role && p.lanes.includes(lane)) || registry.profiles.find(p => p.role === role && p.lanes.includes("*"));
  return match ? { id: match.id, role: match.role, rulePacks: match.rulePacks, versionHash: profileHash(match, dir) } : null;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const registry = loadProfiles();
  const errors = validateProfiles(registry);
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  if (command === "resolve") {
    const opt = Object.fromEntries(rest.join(" ").match(/--\S+\s+\S+/g)?.map(pair => pair.slice(2).split(/\s+/)) || []);
    const found = resolveProfile(registry, { role: opt.role, lane: opt.lane });
    console.log(JSON.stringify(found || { error: "NO_PROFILE", role: opt.role, lane: opt.lane }, null, 2));
    process.exitCode = found ? 0 : 1;
  } else {
    console.log(JSON.stringify(registry.profiles.map(p => ({ id: p.id, role: p.role, lanes: p.lanes, versionHash: profileHash(p) })), null, 2));
  }
}
