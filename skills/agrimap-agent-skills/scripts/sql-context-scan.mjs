#!/usr/bin/env node
// agm-sql context check (5.0.1, owner decision 2026-10-14): which stored procedures,
// tables, views and functions this repository uses, and which of them already have
// local DDL (repository .sql files or .agrimap-agent/knowledge/references/db-schema).
// Read-only and deterministic; `context migrate` exports only the missing names.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs } from "./cli-args.mjs";

const SKIP_DIRECTORIES = new Set([".git", "bin", "obj", "node_modules", "dist", "coverage", ".angular", ".vs", ".idea", "packages", "TestResults"]);
const CODE_EXTENSIONS = new Set([".cs", ".ts", ".js", ".mjs", ".java", ".py"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
// The name never ends inside a longer word, so lookaheads cannot be dodged by backtracking.
const OBJECT = String.raw`(?:\[?([A-Za-z_][A-Za-z0-9_]*)\]?\.)?\[?([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?![A-Za-z0-9_])\]?`;
const PARAMETER = /^(?:PI|PO|P)_/;
const DEFINITION = new RegExp(String.raw`\bCREATE\s+(?:OR\s+ALTER\s+)?(PROCEDURE|PROC|TABLE|VIEW|FUNCTION)\s+${OBJECT}`, "gi");
// A name followed by "(" is a function call (STRING_SPLIT, OPENJSON), not a table.
const SQL_TABLE_USE = new RegExp(String.raw`\b(?:FROM|JOIN|INTO|UPDATE|MERGE\s+INTO|DELETE\s+FROM)\s+${OBJECT}(?!\s*\()`, "gi");
const SQL_EXEC = new RegExp(String.raw`\bEXEC(?:UTE)?\s+(?:@\w+\s*=\s*)?${OBJECT}`, "gi");
// Methods named like CallProcedureAsync or ExecuteStoredProcedure, not ToProcedureException.
const PROCEDURE_CALL = /\b\w*(?:Procedure|StoredProc|Sproc)(?:Async)?\s*(?:<[^>]*>)?\s*\(/g;
const LITERAL = new RegExp(String.raw`["'\`]${OBJECT}["'\`]`, "g");
// SQL Server names are case-insensitive; services also pass "um_role_user_search_q".
const CALL_LITERAL = new RegExp(String.raw`["'\`]${OBJECT}["'\`]`, "gi");
// ADO.NET command text, a command constructor, or EXEC inside a SQL string.
const COMMAND_TEXT = new RegExp(String.raw`(?:CommandText\s*=\s*|new\s+\w*Command\s*\(\s*)["'\`]${OBJECT}["'\`]`, "gi");
const EXEC_IN_STRING = new RegExp(String.raw`["'\`][^"'\`\n]*?\bEXEC(?:UTE)?\s+${OBJECT}`, "gi");

const toSlash = (value) => value.split(path.sep).join("/");
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

async function walk(root, directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name) || entry.name.endsWith(".worktrees")) continue;
      await walk(root, full, files);
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function stripSqlComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " ")).replace(/--[^\n]*/g, (line) => " ".repeat(line.length));
}

function cteNames(text) {
  const names = new Set();
  for (const match of text.matchAll(/(?:\bWITH|,)\s*\[?([A-Za-z_][A-Za-z0-9_]*)\]?\s*(?:\([^)]*\))?\s+AS\s*\(/gi)) names.add(match[1].toUpperCase());
  return names;
}

export function scanSql(text, { schema = "agrimap_app" } = {}) {
  const clean = stripSqlComments(text);
  const defined = [];
  for (const match of clean.matchAll(DEFINITION)) {
    const kind = match[1].toUpperCase();
    defined.push({ name: match[3].toUpperCase(), schema: match[2] || schema, type: kind === "PROC" ? "procedure" : kind.toLowerCase() });
  }
  const local = cteNames(clean);
  const tables = new Set();
  for (const match of clean.matchAll(SQL_TABLE_USE)) {
    const name = match[2].toUpperCase();
    if (!local.has(name) && !defined.some((item) => item.name === name && item.type === "procedure")) tables.add(name);
  }
  const procedures = new Set([...clean.matchAll(SQL_EXEC)].map((match) => match[2].toUpperCase()));
  return { defined, tables: [...tables], procedures: [...procedures] };
}

// Names a code file passes to a stored-procedure call, plus schema-qualified
// literals and literals next to CommandType.StoredProcedure. Column and parameter
// literals (PI_/PO_) never count.
export function scanCode(text) {
  const found = new Map();
  const add = (name, index, how) => {
    const upper = name.toUpperCase();
    if (PARAMETER.test(upper)) return;
    if (!found.has(upper)) found.set(upper, { name: upper, lines: [], how });
    found.get(upper).lines.push(lineOf(text, index));
  };
  for (const call of text.matchAll(PROCEDURE_CALL)) {
    const window = text.slice(call.index, call.index + 400);
    const literal = [...window.matchAll(CALL_LITERAL)].find((match) => !PARAMETER.test(match[2].toUpperCase()));
    if (literal) add(literal[2], call.index + literal.index, "procedure-call");
  }
  for (const match of text.matchAll(COMMAND_TEXT)) add(match[2], match.index, "stored-procedure-hint");
  for (const match of text.matchAll(EXEC_IN_STRING)) add(match[2], match.index, "stored-procedure-hint");
  for (const match of text.matchAll(LITERAL)) if (match[1]) add(match[2], match.index, "schema-qualified");
  return [...found.values()].map((item) => ({ ...item, lines: [...new Set(item.lines)].slice(0, 5) }));
}

export async function scanRepository(root, { schema = "agrimap_app" } = {}) {
  const started = Date.now();
  const files = await walk(root, root, []);
  const referenceRoot = path.join(root, ".agrimap-agent", "knowledge", "references", "db-schema");
  const objects = new Map();
  const object = (name) => {
    if (!objects.has(name)) objects.set(name, { name, type: "unknown", usedBy: [], via: [], local: null });
    return objects.get(name);
  };
  const definitions = new Map();
  const procedureTables = new Map();
  let codeFiles = 0;
  let sqlFiles = 0;
  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    if (extension !== ".sql" && !CODE_EXTENSIONS.has(extension)) continue;
    const relative = toSlash(path.relative(root, file));
    if (relative.startsWith(".agrimap-agent/") && !file.startsWith(referenceRoot)) continue;
    if ((await stat(file)).size > MAX_FILE_BYTES) continue;
    const text = await readFile(file, "utf8").catch(() => "");
    if (extension === ".sql") {
      sqlFiles += 1;
      const scanned = scanSql(text, { schema });
      const stem = path.basename(file, ".sql").toUpperCase();
      for (const item of scanned.defined) definitions.set(item.name, { path: relative, type: item.type });
      if (!scanned.defined.length && /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(stem) && !definitions.has(stem)) definitions.set(stem, { path: relative, type: "unknown" });
      for (const item of scanned.defined.filter((entry) => entry.type === "procedure")) procedureTables.set(item.name, scanned.tables);
    } else {
      codeFiles += 1;
      for (const hit of scanCode(text)) {
        const entry = object(hit.name);
        entry.usedBy.push(...hit.lines.map((line) => `${relative}:${line}`));
        if (hit.how === "procedure-call" || hit.how === "stored-procedure-hint") entry.type = "procedure";
      }
    }
  }
  // One hop: the tables each used procedure reads or writes, when its DDL is local.
  for (const entry of [...objects.values()]) {
    for (const table of procedureTables.get(entry.name) || []) {
      const used = object(table);
      if (used.type === "unknown") used.type = "table";
      if (!used.via.includes(entry.name)) used.via.push(entry.name);
    }
  }
  for (const entry of objects.values()) {
    const definition = definitions.get(entry.name);
    if (definition) {
      entry.local = definition.path;
      if (definition.type !== "unknown") entry.type = definition.type;
    }
    entry.usedBy = [...new Set(entry.usedBy)].slice(0, 5);
  }
  const list = [...objects.values()].sort((a, b) => a.name.localeCompare(b.name));
  const missing = list.filter((entry) => !entry.local);
  return {
    ok: true,
    root: toSlash(root),
    schema,
    scanned: { codeFiles, sqlFiles, ms: Date.now() - started },
    summary: { used: list.length, local: list.length - missing.length, missing: missing.length },
    objects: list,
    missing: missing.map((entry) => entry.name),
    includePatterns: missing.map((entry) => `${schema}.${entry.name}`),
    note: missing.some((entry) => entry.type === "procedure")
      ? "Tables behind a procedure without local DDL are found after it is exported; run check again and export those once."
      : null,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  const root = path.resolve(String(args.cwd || process.cwd()));
  const result = await scanRepository(root, { schema: args.schema && args.schema !== true ? String(args.schema) : "agrimap_app" });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
