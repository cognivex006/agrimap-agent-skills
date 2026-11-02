import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const TAG_PATTERN = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export function compareVersions(left, right) {
  const parse = (value) => {
    const [core, prerelease] = value.split("-", 2);
    return { numbers: core.split(".").map(Number), prerelease };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] - b.numbers[index];
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, "en", { numeric: true });
}

// Reads many `<rev>:<path>` blobs through one `git cat-file --batch` process.
// Missing names are skipped; no Git or no tags returns an empty map.
function readBlobs(root, names) {
  const blobs = new Map();
  if (!names.length) return blobs;
  let output;
  try {
    output = execFileSync("git", ["cat-file", "--batch"], { cwd: root, input: `${names.join("\n")}\n`, maxBuffer: 512 * 1024 * 1024 });
  } catch {
    return blobs;
  }
  let offset = 0;
  for (const name of names) {
    const end = output.indexOf(0x0a, offset);
    if (end < 0) break;
    const header = /^[0-9a-f]+ blob (\d+)$/.exec(output.subarray(offset, end).toString("utf8"));
    offset = end + 1;
    if (!header) continue;
    const size = Number(header[1]);
    blobs.set(name, output.subarray(offset, offset + size));
    offset += size + 1;
  }
  return blobs;
}

// Published SHA-256 of each repository path at every local v<version> tag, oldest first.
export function publishedHashes(root, repoPaths) {
  const result = new Map(repoPaths.map((repoPath) => [repoPath, []]));
  let tags;
  try {
    tags = execFileSync("git", ["tag", "--list", "v*"], { cwd: root, encoding: "utf8" }).split(/\r?\n/).map((tag) => tag.trim());
  } catch {
    return result;
  }
  const versions = tags.map((tag) => TAG_PATTERN.exec(tag)?.[1]).filter(Boolean).sort(compareVersions);
  const specs = repoPaths.flatMap((repoPath) => versions.map((version) => ({ repoPath, version, name: `v${version}:${repoPath}` })));
  const blobs = readBlobs(root, specs.map((spec) => spec.name));
  for (const spec of specs) {
    const blob = blobs.get(spec.name);
    if (blob) result.get(spec.repoPath).push({ version: spec.version, sha256: createHash("sha256").update(blob).digest("hex") });
  }
  return result;
}

// Keeps every published template recognisable to project-bootstrap. Between
// releases sync rewrites item.sha256 with development content, so the hash a
// version actually shipped comes from its tag; item.sha256 is only a fallback
// for a version that has no local tag (shallow clone, unpublished version).
export function recordPreviousHashes(item, { manifestVersion, packageVersion, nextHash, published = [] }) {
  const previous = item.previous ?? [];
  const known = (sha256) => sha256 === nextHash || previous.some((old) => old.sha256 === sha256);
  for (const entry of published) {
    if (!known(entry.sha256)) previous.push({ version: entry.version, sha256: entry.sha256 });
  }
  const tagged = published.some((entry) => entry.version === manifestVersion);
  if (manifestVersion !== packageVersion && !tagged && item.sha256 && !known(item.sha256)) {
    previous.push({ version: manifestVersion, sha256: item.sha256 });
  }
  if (previous.length) item.previous = previous;
  item.sha256 = nextHash;
  return item;
}
