import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));
const contract = json("shared/drawio-security-contract.json");
const registry = json("shared/file-formats.json");
const roadmap = json("shared/advanced-capability-roadmap.json");
const safety = json("shared/safe-degradation-contract.json");
const release = json("shared/release-capability-matrix.json");
const packageJson = json("package.json");
const backend = read("src-tauri/src/formats/drawio.rs");
const command = read("src-tauri/src/commands/drawio.rs");
const editor = read("src/views/DrawioEditorView.vue");
const fixture = read("src-tauri/tests/fixtures/formats/drawio-uncompressed.drawio");
const audit = read("docs/E2B_Drawio_Structured_Editor_Audit_2026-07-31.md");
const failures = [];
const fail = (message) => failures.push(message);

const drawio = registry.formats.find((format) => format.id === "drawio");
const releaseDrawio = release.formats.find((format) => format.id === "drawio");
const formatTrack = roadmap.tracks.find((track) => track.id === "new-format-editors");
const e2b = formatTrack?.phases?.find((phase) => phase.id === "E2B");
const overwriteLane = safety.lanes.find((lane) => lane.id === "signature-protected-overwrite");

if (
  contract.schemaVersion !== 1 ||
  contract.stage !== "E2B" ||
  contract.formatId !== "drawio" ||
  contract.releaseCandidate !== false
) fail("invalid E2B Draw.io contract identity");
if (
  contract.sourceLimitBytes !== 10 * 1024 * 1024 ||
  contract.structureLimits?.pages !== 100 ||
  contract.structureLimits?.pageInflatedBytes !== 20 * 1024 * 1024 ||
  contract.structureLimits?.totalInflatedBytes !== 40 * 1024 * 1024 ||
  contract.structureLimits?.cellsPerPage !== 50000 ||
  contract.structureLimits?.depth !== 96
) fail("Draw.io resource budgets drift");
if (
  contract.previewBoundary?.renderer !== "local-mxCell-svg-projection" ||
  contract.previewBoundary?.activeContentExecuted !== false ||
  contract.previewBoundary?.externalResourcesLoaded !== false ||
  contract.previewBoundary?.linksOpenedAutomatically !== false
) fail("Draw.io preview boundary drift");
if (
  contract.resourcePolicy?.httpLinks !== "preserve-with-warning" ||
  contract.resourcePolicy?.externalImages !== "preserve-with-warning-never-load" ||
  !["javascript", "data", "file"].every((scheme) => contract.resourcePolicy?.blockedSchemes?.includes(scheme))
) fail("Draw.io resource policy drift");
if (
  contract.editingBoundary?.unknownAttributesPreserved !== true ||
  contract.editingBoundary?.targetPageOnlyRewrite !== true ||
  contract.editingBoundary?.compressedPageReencoded !== true ||
  contract.savePolicy?.mode !== "signature-protected-overwrite" ||
  contract.savePolicy?.unsafeSourceWriteAllowed !== false ||
  contract.savePolicy?.expectedSignatureRequiredAfterOpen !== true
) fail("Draw.io edit or save boundary drift");
if (
  !drawio ||
  drawio.routeName !== "DrawioEditor" ||
  drawio.maxBytes !== contract.sourceLimitBytes ||
  !drawio.extensions.includes(".drawio") ||
  !drawio.extensions.includes(".dio") ||
  Object.values(drawio.capabilities).some((value) => value !== "supported") ||
  drawio.userCapability?.level !== "basic-edit" ||
  drawio.userCapability?.saveMode !== "overwrite" ||
  drawio.adapters?.reader !== "text" ||
  drawio.adapters?.writer !== "text" ||
  drawio.adapters?.creator !== "text-template" ||
  drawio.adapters?.indexer !== "text"
) fail("Draw.io format registration is incomplete");
if (releaseDrawio?.profile !== "local-overwrite" || releaseDrawio?.readiness !== "verified") {
  fail("Draw.io release capability mapping is incomplete");
}
if (!overwriteLane?.formats?.includes("drawio")) fail("Draw.io is missing from the D2 overwrite lane");
if (
  registry.formats.length !== 41 ||
  formatTrack?.status !== "completed" ||
  formatTrack?.currentFacts?.registeredFormats !== 41 ||
  formatTrack?.currentFacts?.drawioRegistered !== true ||
  e2b?.status !== "completed" ||
  e2b?.writeUserFile !== true ||
  e2b?.deliveredContract !== "shared/drawio-security-contract.json" ||
  roadmap.decision?.nextStage !== "U1" ||
  roadmap.decision?.nextSlice !== "unsigned-internal-candidate-package" ||
  roadmap.decision?.closureContract !==
    "shared/e5-final-capability-closure.json"
) fail("advanced roadmap did not preserve E2B through E5 and hand off to U1");

for (const [label, source, markers] of [
  ["backend", backend, ["DeflateDecoder", "MAX_TOTAL_PAGE_BYTES", "unknown_attribute_count", "external-image-not-loaded", "transform_drawio_cell_source"]],
  ["command", command, ["write_registered_text_document", "expected_signature", "unsafe-drawio-save-blocked"]],
  ["editor", editor, ["analyze_drawio_source", "transform_drawio_cell_source", "write_drawio_source_document", "externalImageCount"]],
  ["fixture", fixture, ["customFlag=\"preserve-me\"", "image=https://example.com/image.png", "<diagram id=\"page-2\""]],
  ["audit", audit, ["E2B 已完成", "压缩页", "未知属性", "E5", "releaseCandidate=false"]],
]) {
  for (const marker of markers) {
    if (!source.includes(marker)) fail(`${label} marker missing: ${marker}`);
  }
}
if (!packageJson.scripts["ci:check"]?.includes("npm run check:e2b-drawio-contract")) {
  fail("E2B Draw.io gate is not reachable from ci:check");
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("E2B Draw.io contract passed: 41 formats; compressed/uncompressed pages, bounded local preview, structured edits, unknown-attribute preservation, and signature-protected save verified; E5 is closed and U1 is next.");
