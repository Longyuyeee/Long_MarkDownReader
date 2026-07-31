import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));
const contract = json("shared/svg-security-contract.json");
const registry = json("shared/file-formats.json");
const roadmap = json("shared/advanced-capability-roadmap.json");
const safety = json("shared/safe-degradation-contract.json");
const release = json("shared/release-capability-matrix.json");
const packageJson = json("package.json");
const backend = read("src-tauri/src/formats/svg.rs");
const command = read("src-tauri/src/commands/svg.rs");
const editor = read("src/views/XmlEditorView.vue");
const audit = read("docs/E2A_SVG_Security_and_Basic_Source_Editor_Audit_2026-07-31.md");
const failures = [];
const fail = (message) => failures.push(message);

const svg = registry.formats.find((format) => format.id === "svg");
const releaseSvg = release.formats.find((format) => format.id === "svg");
const formatTrack = roadmap.tracks.find((track) => track.id === "new-format-editors");
const e2a = formatTrack?.phases?.find((phase) => phase.id === "E2A");
const e2b = formatTrack?.phases?.find((phase) => phase.id === "E2B");
const overwriteLane = safety.lanes.find((lane) => lane.id === "signature-protected-overwrite");

if (contract.schemaVersion !== 1 || contract.stage !== "E2A" || contract.formatId !== "svg" || contract.releaseCandidate !== false) {
  fail("invalid E2A SVG contract identity");
}
if (
  contract.sourceLimitBytes !== 5 * 1024 * 1024 ||
  contract.viewportLimit !== 16384 ||
  contract.structureLimits?.elements !== 20000 ||
  contract.structureLimits?.attributes !== 100000 ||
  contract.structureLimits?.depth !== 64 ||
  contract.previewBoundary?.transport !== "sanitized-svg-blob-in-img" ||
  contract.previewBoundary?.activeContentExecuted !== false ||
  contract.previewBoundary?.externalResourcesLoaded !== false
) fail("SVG preview boundary drift");
for (const item of ["script", "event-handler-attributes", "foreignObject", "external-href", "processing-instruction", "doctype-and-entities"]) {
  if (!contract.blockedContent?.includes(item)) fail(`blocked content policy missing: ${item}`);
}
if (
  contract.savePolicy?.mode !== "signature-protected-overwrite" ||
  contract.savePolicy?.unsafeSourceWriteAllowed !== false ||
  contract.savePolicy?.expectedSignatureRequiredAfterOpen !== true
) fail("SVG save boundary drift");
if (
  !svg ||
  svg.routeName !== "XmlEditor" ||
  svg.maxBytes !== contract.sourceLimitBytes ||
  svg.capabilities?.read !== "supported" ||
  svg.capabilities?.edit !== "supported" ||
  svg.capabilities?.create !== "supported" ||
  svg.capabilities?.index !== "supported" ||
  svg.userCapability?.saveMode !== "overwrite" ||
  svg.adapters?.reader !== "text" ||
  svg.adapters?.writer !== "text" ||
  svg.adapters?.indexer !== "text"
) fail("SVG format registration is incomplete");
if (releaseSvg?.profile !== "local-overwrite" || releaseSvg?.readiness !== "verified") {
  fail("SVG release capability mapping is incomplete");
}
if (!overwriteLane?.formats?.includes("svg")) fail("SVG is missing from the D2 overwrite lane");
if (
  formatTrack?.currentFacts?.registeredFormats !== registry.formats.length ||
  registry.formats.length !== 41 ||
  formatTrack?.currentFacts?.svgRegistered !== true ||
  e2a?.status !== "completed" ||
  e2a?.deliveredContract !== "shared/svg-security-contract.json" ||
  e2b?.status !== "completed" ||
  roadmap.decision?.nextStage !== "U1" ||
  roadmap.decision?.closureContract !==
    "shared/e5-final-capability-closure.json"
) fail("advanced roadmap did not preserve E2A through E5 closure");

for (const [label, source, markers] of [
  ["backend", backend, ["MAX_SVG_SOURCE_BYTES", "MAX_SVG_ELEMENTS", "exceeds_viewbox_limit", "is_allowed_element", "svg-attribute-blocked", "sanitized_svg"]],
  ["command", command, ["write_registered_text_document", "expected_signature", "unsafe-svg-save-blocked"]],
  ["editor", editor, ["analyze_svg_source", "write_svg_source_document", "image/svg+xml", "previewAvailable"]],
  ["audit", audit, ["E2A 已完成", "安全白名单", "E2B", "releaseCandidate=false"]],
]) {
  for (const marker of markers) {
    if (!source.includes(marker)) fail(`${label} marker missing: ${marker}`);
  }
}
if (!packageJson.scripts["ci:check"]?.includes("npm run check:e2a-svg-security-contract")) {
  fail("E2A SVG gate is not reachable from ci:check");
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("E2A SVG security contract passed: 41 formats; sanitized preview, safe source save, indexing, creation, and D2 coverage verified; Draw.io E2B is complete.");
