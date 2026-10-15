#!/usr/bin/env node
// agm-sql context migrate, format step (5.0.1, owner decision 2026-10-15): reads the
// neutral `table_metadata/<schema>__<table>.yaml` sql-context-pack 3.1.0+ exports and
// writes the AgriMap golden layout of references/patterns/sql.md (DDL contract). The
// content stays the database truth: types, constraint names (system names included)
// and column order are never changed; every difference from golden is reported as a
// golden_deviation and every missing fact as a metadata_gap, never guessed.
import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs } from "./cli-args.mjs";

export const MANAGED_HEADER_PREFIX = "-- sqlctx-context: ";
export const DEFAULT_OUT = ".agrimap-agent/knowledge/references/db-schema/agm-golden";
const SQLFLUFF_ARGS = ["format", "--exclude-rules", "CP02, LT01, RF06", "--dialect", "tsql"];
const AUDIT = ["DATE_CREATED", "DATE_MODIFIED", "USER_CREATED", "USER_MODIFIED"];
const LIFECYCLE = new Set([...AUDIT, "DATE_EXPIRED"]);
const SOFT_DELETE = new Set(["DEL_FLAG", "ROW_VERSION"]);
const ACTIONS = { NO_ACTION: null, CASCADE: "CASCADE", SET_NULL: "SET NULL", SET_DEFAULT: "SET DEFAULT" };

// ---------------------------------------------------------------------------
// YAML: the block style PyYAML safe_dump writes (mappings, indentless sequences,
// plain/single/double-quoted scalars folded over lines, [] and {}). Not general YAML.

const indentOf = (line) => line.match(/^ */)[0].length;

function unescapeDouble(body) {
  const escapes = { n: "\n", t: "\t", r: "\r", 0: "\0", '"': '"', "\\": "\\", "/": "/", " ": " ", _: " ", N: "\u0085", L: " ", P: " ", e: "\x1b", a: "\x07", b: "\b", v: "\v", f: "\f" };
  return body.replace(/\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|.)/g, (_, code) =>
    /^[xuU]/.test(code) ? String.fromCodePoint(parseInt(code.slice(1), 16)) : escapes[code] ?? code);
}

function foldLines(parts, quoted) {
  let out = "";
  for (let index = 0; index < parts.length; index += 1) {
    const raw = index === 0 ? parts[index] : parts[index].trimStart();
    const line = index === parts.length - 1 ? raw : raw.trimEnd();
    if (index > 0) {
      if (quoted === '"' && out.endsWith("\\") && !out.endsWith("\\\\")) out = out.slice(0, -1);
      else if (line === "") { out += "\n"; continue; }
      else if (!out.endsWith("\n")) out += " ";
    }
    out += line;
  }
  return out;
}

function scalar(parts) {
  const first = parts[0].trimStart();
  if (first.startsWith("'")) return foldLines(parts, "'").trim().slice(1, -1).replace(/''/g, "'");
  if (first.startsWith('"')) return unescapeDouble(foldLines(parts, '"').trim().slice(1, -1));
  const text = foldLines(parts, null).trim();
  if (text === "" || text === "null" || text === "~") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "[]") return [];
  if (text === "{}") return {};
  if (/^-?\d+$/.test(text)) return Number(text);
  if (/^-?\d+\.\d+$/.test(text)) return Number(text);
  return text;
}

export function parseYaml(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim() !== "" && !/^\s*#/.test(line) && line !== "---");
  let index = 0;
  const continuation = (head, minIndent) => {
    const parts = [head];
    while (index < lines.length && indentOf(lines[index]) > minIndent) parts.push(lines[index++]);
    return parts;
  };
  function block(indent) {
    if (index >= lines.length) return null;
    return lines[index].slice(indent).startsWith("- ") || lines[index].slice(indent) === "-" ? sequence(indent) : mapping(indent);
  }
  function entryValue(rest, indent, isItemKey) {
    if (rest.trim() !== "") return scalar(continuation(rest, indent));
    if (index < lines.length) {
      const next = indentOf(lines[index]);
      if (next > indent) return block(next);
      if (next === indent && !isItemKey && lines[index].slice(indent).startsWith("-")) return sequence(indent);
    }
    return null;
  }
  function mapping(indent, firstLine = null) {
    const result = {};
    let pending = firstLine;
    while (pending !== null || (index < lines.length && indentOf(lines[index]) === indent && !lines[index].slice(indent).startsWith("- "))) {
      const line = pending ?? lines[index++].slice(indent);
      pending = null;
      const match = line.match(/^([^:'"\s][^:]*?):(?:\s+(.*)|\s*)$/);
      if (!match) throw new Error(`YAML_UNSUPPORTED: ${line.trim().slice(0, 60)}`);
      result[match[1]] = entryValue(match[2] ?? "", indent, false);
    }
    return result;
  }
  function sequence(indent) {
    const result = [];
    while (index < lines.length && indentOf(lines[index]) === indent && lines[index].slice(indent).startsWith("-")) {
      const item = lines[index++].slice(indent + 2);
      if (/^[^:'"\s][^:]*?:(\s|$)/.test(item)) result.push(mapping(indent + 2, item));
      else if (item.trim() === "") result.push(index < lines.length && indentOf(lines[index]) > indent ? block(indentOf(lines[index])) : null);
      else result.push(scalar(continuation(item, indent)));
    }
    return result;
  }
  return block(0);
}

export function parseMetadata(text) {
  const trimmed = String(text).trimStart();
  return trimmed.startsWith("{") ? JSON.parse(trimmed) : parseYaml(text);
}

// ---------------------------------------------------------------------------
// Formatting

const q = (name) => `[${String(name).replace(/]/g, "]]")}]`;
const literal = (value) => `N'${String(value).replace(/'/g, "''")}'`;

export function goldenType(typeSql) {
  const value = String(typeSql).trim();
  if (value.startsWith("[")) return value;
  return value.toUpperCase().replace(/\s*,\s*/g, ", ").replace(/\s*\(\s*/g, "(").replace(/\s*\)/g, ")");
}

function parseObjectId(value) {
  const match = String(value || "").match(/^[a-z_]+:([^.]+)\.(.+)$/i);
  return match ? { schema: match[1], name: match[2] } : null;
}

function keyList(columns, orders = []) {
  return columns.map((column, position) => `${q(column)}${orders[position] ? ` ${orders[position]}` : ""}`).join(", ");
}

function groupOf(column, keys) {
  if (keys.primary.has(column.name)) return "-- Primary Key";
  if (LIFECYCLE.has(column.name)) return "-- Audit Columns";
  if (SOFT_DELETE.has(column.name)) return "-- Soft Delete";
  if (keys.business.has(column.name) || String(column.data_type).toLowerCase() === "uniqueidentifier") return "-- Public and Business Keys";
  return "-- Business Data";
}

export function formatTable(metadata) {
  const schema = metadata.schema;
  const table = metadata.table;
  const target = `${q(schema)}.${q(table)}`;
  const deviations = [];
  const gaps = [];
  const deviation = (code, detail) => deviations.push({ table: `${schema}.${table}`, code, detail });
  const gap = (code, detail, blocking = false) => gaps.push({ table: `${schema}.${table}`, code, detail, blocking });
  const columns = [...(metadata.columns || [])].sort((a, b) => a.ordinal - b.ordinal);
  const constraints = metadata.constraints || [];
  const foreignKeys = metadata.foreign_keys || [];
  const indexes = metadata.indexes || [];

  if (!schema || !table || !columns.length) gap("table_identity_missing", "schema, table and columns are required", true);
  if (columns.length && !columns.every((column) => "type_sql" in column)) {
    gap("metadata_pre_3_1_0", "columns lack type_sql/identity/default; export again with sql-context-pack 3.1.0 or later", true);
  }
  for (const column of columns) {
    if (!column.computed && !column.type_sql) gap("column_type_missing", column.name, true);
  }
  for (const foreignKey of foreignKeys) {
    if (!parseObjectId(foreignKey.target_object_id)) gap("foreign_key_target_unparsed", `${foreignKey.name}: ${foreignKey.target_object_id}`, true);
  }
  if (gaps.some((item) => item.blocking)) return { schema, table, sql: null, deviations, gaps };

  const primary = constraints.find((item) => item.constraint_type === "primary_key");
  const uniques = constraints.filter((item) => item.constraint_type === "unique");
  const checks = constraints.filter((item) => item.constraint_type === "check");
  const keys = {
    primary: new Set(primary?.columns || []),
    business: new Set([...uniques.flatMap((item) => item.columns), ...indexes.filter((item) => item.unique && !item.primary).flatMap((item) => item.key_columns)]),
  };

  // Golden checks: reported, never applied to the content.
  if (schema !== "agrimap_app") deviation("schema_not_agrimap_app", `[${schema}]`);
  if (!primary) deviation("primary_key_missing", "no primary key");
  else {
    if (primary.name !== `PK_${table}`) deviation("constraint_name_nonstandard", `${primary.name} (expected PK_${table})`);
    if (primary.columns.length !== 1 || primary.columns[0] !== "ID") deviation("primary_key_not_id", primary.columns.join(", "));
    const keyColumn = columns.find((column) => column.name === primary.columns[0]);
    const expected = table.startsWith("LUT_") ? "INT" : "NUMERIC(38, 0)";
    if (keyColumn && goldenType(keyColumn.type_sql) !== expected) deviation("id_type_nonstandard", `${keyColumn.name} ${goldenType(keyColumn.type_sql)} (golden ${expected}; legacy, change only by owner decision)`);
    if (keyColumn && !keyColumn.identity) deviation("id_not_identity", keyColumn.name);
  }
  const names = new Set(columns.map((column) => column.name));
  const missingBaseline = [...AUDIT, "DEL_FLAG"].filter((name) => !names.has(name));
  if (missingBaseline.length) deviation("audit_baseline_missing", missingBaseline.join(", "));
  for (const item of uniques) if (!item.name.startsWith("UQ_")) deviation("constraint_name_nonstandard", item.name);
  for (const item of checks) {
    if (!item.name.startsWith("CK_")) deviation("constraint_name_nonstandard", item.name);
    if (item.trusted === false || item.enabled === false) deviation("check_not_trusted", item.name);
  }
  for (const column of columns) {
    if (!column.default) continue;
    if (column.default.system_named) deviation("default_system_named", `${column.default.name} on ${column.name}`);
    else if (column.default.name !== `DF_${table}_${column.name}`) deviation("default_name_nonstandard", `${column.default.name} (expected DF_${table}_${column.name})`);
  }
  for (const foreignKey of foreignKeys) {
    if (!foreignKey.name.startsWith("FK_")) deviation("constraint_name_nonstandard", foreignKey.name);
    if (foreignKey.trusted === false) deviation("foreign_key_not_trusted", `${foreignKey.name} (WITH NOCHECK, golden WITH CHECK)`);
    if (foreignKey.enabled === false) deviation("foreign_key_disabled", foreignKey.name);
    for (const action of ["on_delete", "on_update"]) {
      if (foreignKey[action] && foreignKey[action] !== "NO_ACTION") deviation("foreign_key_action", `${foreignKey.name} ${action.toUpperCase().replace("_", " ")} ${ACTIONS[foreignKey[action]] ?? foreignKey[action]} (needs owner evidence)`);
    }
  }
  const renderedIndexes = indexes.filter((item) => !item.primary && !item.unique_constraint);
  for (const item of renderedIndexes) {
    const prefix = item.unique && item.filter_definition ? "UX_" : "IX_";
    if (!item.name.startsWith(prefix) && !(item.unique && item.name.startsWith("UX_"))) deviation("index_name_nonstandard", `${item.name} (expected ${prefix})`);
  }
  if (!metadata.description) deviation("ms_description_missing", "table");
  const undocumented = columns.filter((column) => !column.description).map((column) => column.name);
  if (undocumented.length) deviation("ms_description_missing", `columns: ${undocumented.join(", ")}`);

  for (const feature of metadata.unsupported_features || []) {
    if (!feature.rendered) gap("not_rendered", `${feature.feature}${feature.detail ? ` (${feature.detail})` : ""}`);
  }
  for (const item of [primary, ...uniques].filter(Boolean)) {
    if (item.clustered == null) gap("clustered_unknown", `${item.name}: rendered without CLUSTERED/NONCLUSTERED (server default)`);
  }

  // Column lines in physical order; a group comment repeats when the order leaves its group.
  const body = [];
  let previous = null;
  for (const column of columns) {
    const group = groupOf(column, keys);
    if (group !== previous) {
      if (previous) body.push("");
      body.push(`    ${group}`);
      previous = group;
    }
    const parts = [q(column.name)];
    if (column.computed) {
      parts.push(`AS ${column.computed.definition}`);
      if (column.computed.persisted) parts.push("PERSISTED");
      if (column.computed.persisted && column.nullable === false) parts.push("NOT NULL");
    } else {
      parts.push(goldenType(column.type_sql));
      if (column.sparse) parts.push("SPARSE");
      if (column.collation) parts.push(`COLLATE ${column.collation}`);
      if (column.identity) parts.push(`IDENTITY(${column.identity.seed}, ${column.identity.increment})`);
      parts.push(column.nullable ? "NULL" : "NOT NULL");
    }
    body.push(`    ${parts.join(" ")},`);
  }
  const inline = [];
  const clusterWord = (item) => (item.clustered == null ? "" : item.clustered ? " CLUSTERED" : " NONCLUSTERED");
  if (primary) inline.push(`CONSTRAINT ${q(primary.name)} PRIMARY KEY${clusterWord(primary)} (${keyList(primary.columns, primary.column_orders)})`);
  for (const item of uniques) inline.push(`CONSTRAINT ${q(item.name)} UNIQUE${clusterWord(item)} (${keyList(item.columns, item.column_orders)})`);
  const trustedChecks = checks.filter((item) => item.trusted !== false && item.enabled !== false);
  for (const item of trustedChecks) inline.push(`CONSTRAINT ${q(item.name)} CHECK ${item.expression}`);
  if (inline.length) body.push("", ...inline.map((line, position) => `    ${line}${position < inline.length - 1 ? "," : ""}`));
  else body[body.length - 1] = body[body.length - 1].replace(/,$/, "");

  const statements = [`CREATE TABLE ${target}\n(\n${body.join("\n")}\n);`];
  const lines = (...parts) => statements.push(parts.filter(Boolean).join("\n"));
  for (const column of columns) {
    if (column.default) lines(`ALTER TABLE ${target}`, `    ADD CONSTRAINT ${q(column.default.name)}`, `    DEFAULT ${column.default.definition} FOR ${q(column.name)};`);
  }
  for (const item of checks.filter((check) => !trustedChecks.includes(check))) {
    lines(`ALTER TABLE ${target} WITH NOCHECK`, `    ADD CONSTRAINT ${q(item.name)} CHECK ${item.expression};`);
    if (item.enabled === false) lines(`ALTER TABLE ${target} NOCHECK CONSTRAINT ${q(item.name)};`);
  }
  for (const foreignKey of foreignKeys) {
    const reference = parseObjectId(foreignKey.target_object_id);
    const actions = ["on_delete", "on_update"]
      .filter((action) => ACTIONS[foreignKey[action]])
      .map((action) => `    ${action === "on_delete" ? "ON DELETE" : "ON UPDATE"} ${ACTIONS[foreignKey[action]]}`);
    const references = `    REFERENCES ${q(reference.schema)}.${q(reference.name)} (${keyList(foreignKey.target_columns)})`;
    lines(
      `ALTER TABLE ${target} WITH ${foreignKey.trusted === false ? "NOCHECK" : "CHECK"}`,
      `    ADD CONSTRAINT ${q(foreignKey.name)}`,
      `    FOREIGN KEY (${keyList(foreignKey.source_columns)})`,
      ...(actions.length ? [references, ...actions.slice(0, -1), `${actions.at(-1)};`] : [`${references};`]),
    );
    lines(`ALTER TABLE ${target} ${foreignKey.enabled === false ? "NOCHECK" : "CHECK"} CONSTRAINT ${q(foreignKey.name)};`);
  }
  for (const item of renderedIndexes) {
    if (item.index_type && !["CLUSTERED", "NONCLUSTERED"].includes(item.index_type)) continue;
    const kind = `${item.unique ? "UNIQUE " : ""}${item.clustered ? "CLUSTERED" : "NONCLUSTERED"}`;
    const tail = [
      `    ON ${target} (${keyList(item.key_columns, item.key_orders)})`,
      item.included_columns?.length ? `    INCLUDE (${keyList(item.included_columns)})` : null,
      item.filter_definition ? `    WHERE ${item.filter_definition}` : null,
    ].filter(Boolean);
    tail[tail.length - 1] += ";";
    lines(`CREATE ${kind} INDEX ${q(item.name)}`, ...tail);
  }
  const property = (value, column) => [
    "EXEC sys.sp_addextendedproperty",
    "    @name = N'MS_Description',",
    `    @value = ${literal(value)},`,
    `    @level0type = N'SCHEMA', @level0name = ${literal(schema)},`,
    `    @level1type = N'TABLE', @level1name = ${literal(table)}${column ? "," : ";"}`,
    ...(column ? [`    @level2type = N'COLUMN', @level2name = ${literal(column)};`] : []),
  ].join("\n");
  if (metadata.description) statements.push(property(metadata.description));
  for (const column of columns) if (column.description) statements.push(property(column.description, column.name));

  const notRendered = gaps.filter((item) => item.code === "not_rendered").map((item) => `-- not rendered: ${item.detail}`);
  const sql = [
    "SET ANSI_NULLS ON;", "GO", "SET QUOTED_IDENTIFIER ON;", "GO", "SET XACT_ABORT ON;", "GO", "",
    `/* ${schema}.${table}: ${metadata.description || "no MS_Description"}`,
    "   agm-sql golden layout of sql-context-pack table_metadata;",
    "   content is the database as exported. */",
    ...notRendered, "",
    `IF SCHEMA_ID(${literal(schema)}) IS NULL`, `    EXEC(N'CREATE SCHEMA ${q(schema).replace(/'/g, "''")} AUTHORIZATION [dbo];');`, "GO", "",
    `IF OBJECT_ID(${literal(`${q(schema)}.${q(table)}`)}, N'U') IS NOT NULL`,
    `    THROW 50000, ${literal(`${table} deployment stopped because the target table already exists.`)}, 1;`, "GO", "",
    "BEGIN TRY", "    BEGIN TRANSACTION;", "",
    ...statements.flatMap((statement) => [statement.split("\n").map((line) => (line ? `    ${line}` : line)).join("\n"), ""]),
    "    COMMIT TRANSACTION;", "END TRY", "BEGIN CATCH", "    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;", "    THROW;", "END CATCH;", "GO", "",
  ].join("\n");
  return { schema, table, sql, deviations, gaps };
}

// ---------------------------------------------------------------------------
// Files

export function goldenPath(outRoot, schema, table) {
  return path.join(outRoot, "sql", String(schema).toUpperCase(), "table", `${table}.sql`);
}

const inside = (root, target) => {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

async function collect(source, files) {
  for (const entry of await readdir(source, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(source, entry.name);
    if (entry.isDirectory()) await collect(full, files);
    else if (/\.(ya?ml|json)$/i.test(entry.name) && path.basename(source) === "table_metadata") files.push(full);
  }
  return files.sort();
}

// SQLFluff owns layout. A long MS_Description or expression is data and cannot be wrapped,
// so a file counts as formatted when the only violations left are LT05 long lines.
function runSqlfluff(file) {
  const formatted = spawnSync("sqlfluff", [...SQLFLUFF_ARGS, file], { encoding: "utf8", shell: false });
  if (formatted.error) return { ok: false, code: formatted.error.code };
  if (formatted.status === 0) return { ok: true, code: 0 };
  const lint = spawnSync("sqlfluff", ["lint", ...SQLFLUFF_ARGS.slice(1), "--format", "json", file], { encoding: "utf8", shell: false });
  try {
    const rules = JSON.parse(lint.stdout).flatMap((entry) => entry.violations.map((item) => item.code));
    const others = [...new Set(rules.filter((code) => code !== "LT05"))];
    return others.length ? { ok: false, code: formatted.status, rules: others } : { ok: true, code: formatted.status, long_lines: rules.length };
  } catch {
    return { ok: false, code: formatted.status };
  }
}

export async function formatGolden({ cwd = process.cwd(), metadata = [], from = null, out = DEFAULT_OUT, sqlfluff = false, dryRun = false, format = runSqlfluff } = {}) {
  const root = path.resolve(cwd);
  const outRoot = path.resolve(root, out);
  const inputs = [...metadata.map((file) => path.resolve(root, file))];
  if (from) {
    const source = path.resolve(root, from);
    if (inside(source, outRoot) || inside(outRoot, source)) {
      return { ok: false, code: "GOLDEN_OUT_OVERLAPS_EXPORT", message: "write golden files to their own folder, never inside the sql-context-pack export" };
    }
    inputs.push(...(await collect(source, [])));
  }
  const report = { ok: true, outRoot: path.relative(root, outRoot).split(path.sep).join("/"), written: [], preserved: [], blocked: [], golden_deviation: [], metadata_gap: [], formatted: null };
  for (const input of inputs) {
    let result;
    try {
      result = formatTable(parseMetadata(await readFile(input, "utf8")));
    } catch (error) {
      const file = path.relative(root, input).split(path.sep).join("/");
      report.metadata_gap.push({ table: null, code: "metadata_unreadable", detail: `${file}: ${error.code || error.message}`, blocking: true });
      report.blocked.push(file);
      continue;
    }
    report.golden_deviation.push(...result.deviations);
    report.metadata_gap.push(...result.gaps);
    if (!result.sql) { report.blocked.push(`${result.schema}.${result.table}`); continue; }
    const target = goldenPath(outRoot, result.schema, result.table);
    const relative = path.relative(root, target).split(path.sep).join("/");
    const existing = await readFile(target, "utf8").catch(() => null);
    if (existing !== null && existing.startsWith(MANAGED_HEADER_PREFIX)) { report.preserved.push(relative); continue; }
    if (!dryRun) {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, result.sql, "utf8");
    }
    report.written.push(relative);
  }
  if (sqlfluff && !dryRun) {
    const results = report.written.map((file) => ({ file, ...format(path.resolve(root, file)) }));
    report.formatted = `${results.filter((item) => item.ok).length}/${results.length}`;
    report.format_failures = results.filter((item) => !item.ok);
    if (report.format_failures.length) report.ok = false;
  }
  if (report.blocked.length) report.ok = false;
  return report;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const report = await formatGolden({
    cwd: args.cwd || process.cwd(),
    metadata: String(args.metadata || "").split(",").map((value) => value.trim()).filter(Boolean),
    from: args.from || null,
    out: args.out || DEFAULT_OUT,
    sqlfluff: Boolean(args.sqlfluff),
    dryRun: Boolean(args["dry-run"]),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
