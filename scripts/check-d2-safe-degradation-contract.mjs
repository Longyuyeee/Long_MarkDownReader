import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const contract = JSON.parse(read("shared/safe-degradation-contract.json"));
const registry = JSON.parse(read("shared/file-formats.json"));
const release = JSON.parse(read("shared/release-capability-matrix.json"));
const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
const failures = [];
const fail = (message) => failures.push(message);

if (
  contract.schemaVersion !== 1 ||
  contract.stage !== "D2" ||
  contract.appVersion !== tauri.version
) {
  fail("invalid D2 contract header");
}
if (contract.formatRegistrySchemaVersion !== registry.schemaVersion) {
  fail("format registry schema version drift");
}

const registryById = new Map(
  registry.formats.map((format) => [format.id, format]),
);
const releaseById = new Map(
  release.formats.map((format) => [format.id, format]),
);
const covered = new Set();
const laneIds = new Set();

for (const lane of contract.lanes ?? []) {
  if (!lane.id || laneIds.has(lane.id)) fail(`invalid or duplicate lane ${lane.id}`);
  laneIds.add(lane.id);
  if (
    !Array.isArray(lane.formats) ||
    !lane.formats.length ||
    !Array.isArray(lane.saveModes) ||
    !lane.saveModes.length ||
    !Array.isArray(lane.profiles) ||
    !lane.profiles.length ||
    !lane.sourcePolicy ||
    !lane.failurePolicy
  ) {
    fail(`incomplete lane ${lane.id}`);
    continue;
  }

  for (const id of lane.formats) {
    const format = registryById.get(id);
    const mapping = releaseById.get(id);
    if (!format || !mapping) {
      fail(`${lane.id} references unknown format ${id}`);
      continue;
    }
    if (covered.has(id)) fail(`${id} appears in more than one D2 lane`);
    covered.add(id);
    if (!lane.saveModes.includes(format.userCapability.saveMode)) {
      fail(`${id} save mode escaped ${lane.id}`);
    }
    if (!lane.profiles.includes(mapping.profile)) {
      fail(`${id} release profile escaped ${lane.id}`);
    }
    if (
      ["none", "sidecar"].includes(format.userCapability.saveMode) &&
      format.adapters.writer !== null
    ) {
      fail(`${id} must not expose a source writer`);
    }
    if (
      format.userCapability.level === "external-open" &&
      Object.values(format.adapters).some((adapter) => adapter !== null)
    ) {
      fail(`${id} external handoff must not expose internal adapters`);
    }
  }

  if (!Array.isArray(lane.evidence) || !lane.evidence.length) {
    fail(`${lane.id} has no implementation evidence`);
    continue;
  }
  for (const item of lane.evidence) {
    const absolutePath = path.join(root, item.path);
    if (!fs.existsSync(absolutePath)) {
      fail(`${lane.id} evidence is missing: ${item.path}`);
      continue;
    }
    const source = fs.readFileSync(absolutePath, "utf8");
    for (const marker of item.markers ?? []) {
      if (!source.includes(marker)) {
        fail(`${lane.id} evidence marker is missing: ${item.path} -> ${marker}`);
      }
    }
  }
}

if (
  covered.size !== registryById.size ||
  [...registryById.keys()].some((id) => !covered.has(id))
) {
  fail("D2 contract must cover every registered format exactly once");
}

const expectedLanes = new Set([
  "signature-protected-overwrite",
  "strict-readonly-preview",
  "verified-ods-reliable-copy",
  "verified-image-copy",
  "pdf-reliable-copy-isolation",
  "verified-pptx-bounded-overwrite",
  "external-application-handoff",
  "bounded-structured-write",
]);
if (
  laneIds.size !== expectedLanes.size ||
  [...expectedLanes].some((id) => !laneIds.has(id))
) {
  fail("D2 safety lane set drift");
}

for (const [id, saveMode, profile] of [
  ["log", "overwrite", "professional-log"],
  ["pdf", "copy", "pdf-copy"],
  ["docx", "bounded-overwrite", "office-copy"],
  ["pptx", "bounded-overwrite", "office-copy"],
  ["ods", "copy", "office-copy"],
  ["odp", "none", "odf-preview"],
  ["raster-image", "copy", "media-preview"],
  ["workbook", "bounded-overwrite", "workbook-bounded"],
]) {
  const format = registryById.get(id);
  const mapping = releaseById.get(id);
  if (
    format?.userCapability.saveMode !== saveMode ||
    mapping?.profile !== profile
  ) {
    fail(`${id} safety boundary drift`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  `D2 safe degradation contract passed: ${covered.size} formats across ${laneIds.size} lanes with source, conflict, failure, and recovery evidence.`,
);
