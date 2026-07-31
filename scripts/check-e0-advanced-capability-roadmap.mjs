import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));
const roadmap = json("shared/advanced-capability-roadmap.json");
const freeze = json("shared/product-acceptance-freeze.json");
const registry = json("shared/file-formats.json");
const formulas = json("shared/xlsx-formula-capabilities.json");
const linkedData = json("shared/xlsx-linked-data-capabilities.json");
const arrayMatrix = json(
  "docs/evidence/x3-b2-xlsx-array-producers/matrix.json",
);
const pivotMatrix = json(
  "docs/evidence/s8-7e3g-xlsx-pivot-multi-axis-roundtrip/matrix.json",
);
const visualManifest = json("docs/evidence/t8-1b/audit-manifest.json");
const packageJson = json("package.json");
const themeRegistry = read("src/config/themePresets.ts");
const requirements = read("docs/Product_Requirements_and_Development_Roadmap.md");
const formatRequirements = read(
  "docs/Unified_File_Manager_Format_Requirements.md",
);
const auditDoc = read(
  "docs/E0_Advanced_Editing_Gap_and_Priority_Audit_2026-07-31.md",
);
const handoffDoc = read("docs/Development_Handoff.md");
const currentAuditDoc = read(
  "docs/Current_Development_Audit_and_Next_Plan_2026-07-31.md",
);
const failures = [];
const fail = (message) => failures.push(message);

if (
  roadmap.schemaVersion !== 1 ||
  roadmap.stage !== "E0" ||
  roadmap.appVersion !== packageJson.version
) {
  fail("invalid E0 roadmap identity");
}
if (
  roadmap.baseline?.contract !== "shared/product-acceptance-freeze.json" ||
  roadmap.baseline?.productAcceptanceStatus !==
    freeze.productAcceptanceStatus ||
  roadmap.baseline?.releaseCandidate !== false ||
  freeze.releaseCandidate !== false
) {
  fail("E0 must extend the frozen product baseline without promoting RC");
}

const expectedTracks = new Map([
  ["excel-equivalence", ["FR-DATA-009", "P0", "partial"]],
  ["new-format-editors", ["FR-VECTOR-001..002", "P1", "in-progress"]],
  ["theme-expansion", ["FR-THEME-001", "P2", "current-commitment-complete"]],
  ["complex-office-and-wps", ["FR-OFFICE-001..006", "P2", "deferred-risk-review"]],
]);
const tracks = new Map((roadmap.tracks ?? []).map((track) => [track.id, track]));
for (const [id, [requirement, priority, status]] of expectedTracks) {
  const track = tracks.get(id);
  if (
    !track ||
    track.requirement !== requirement ||
    track.priority !== priority ||
    track.status !== status
  ) {
    fail(`advanced track drift: ${id}`);
    continue;
  }
  if (!track.phases?.length || !track.evidence?.length) {
    fail(`advanced track is incomplete: ${id}`);
  }
  for (const evidencePath of track.evidence ?? []) {
    if (!fs.existsSync(path.join(root, evidencePath))) {
      fail(`${id} evidence is missing: ${evidencePath}`);
    }
  }
}
if (tracks.size !== expectedTracks.size) fail("unexpected E0 track count");

const excel = tracks.get("excel-equivalence");
const verifiedFormulaFamilies = formulas.families.filter(
  (family) => family.status === "verified",
).length;
const multiAxis =
  linkedData.pivotAudit?.writebackAudit
    ?.multiLevelAxisProducerRoundTrip;
if (
  excel?.currentFacts?.verifiedFormulaFamilies !== verifiedFormulaFamilies ||
  verifiedFormulaFamilies !== 10 ||
  formulas.arrayFormulaReadContract?.calculationPolicy !== "blocked" ||
  formulas.arrayFormulaReadContract?.fullProducerMatrixVerified !== false ||
  arrayMatrix.verifiedProducers !== 1 ||
  arrayMatrix.requiredProducers !== 3 ||
  excel?.currentFacts?.arrayProducerEvidence !== "1/3" ||
  multiAxis?.verifiedProducerCount !== 2 ||
  multiAxis?.requiredProducerCount !== 3 ||
  pivotMatrix.verifiedCount !== 2 ||
  pivotMatrix.requiredCount !== 3 ||
  excel?.currentFacts?.multiAxisPivotProducerEvidence !== "2/3"
) {
  fail("Excel equivalence facts are stale or overstated");
}

const e1a = excel?.phases?.find((phase) => phase.id === "E1A");
if (
  !e1a ||
  e1a.status !== "completed" ||
  e1a.writeUserFile !== false ||
  e1a.deliveredContract !==
    "shared/xlsx-formula-capabilities.json#dynamicArrayPreviewContract" ||
  !e1a.exitCriteria.includes("formula-cache-and-source-package-remain-unchanged")
) {
  fail("E1A completion must remain bound to the no-write preview contract");
}
for (const phase of excel?.phases ?? []) {
  if (phase.writeUserFile !== false) {
    fail(`${phase.id} must not pre-authorize user-file writes`);
  }
}

const formatIds = new Set(registry.formats.map((format) => format.id));
const formatTrack = tracks.get("new-format-editors");
if (
  formatTrack?.currentFacts?.registeredFormats !== registry.formats.length ||
  registry.formats.length !== 40 ||
  !formatIds.has("svg") ||
  formatIds.has("drawio") ||
  formatTrack?.currentFacts?.svgRegistered !== true ||
  formatTrack?.currentFacts?.drawioRegistered !== false
) {
  fail("new-format implementation facts are stale");
}
if (
  formatTrack?.phases?.[0]?.id !== "E2A" ||
  formatTrack.phases[0].name !== "svg-basic-source-editor" ||
  formatTrack.phases[0].status !== "completed" ||
  formatTrack.phases[0].writeUserFile !== true ||
  formatTrack.phases[0].deliveredContract !== "shared/svg-security-contract.json" ||
  formatTrack?.phases?.[1]?.id !== "E2B" ||
  formatTrack.phases[1].status !== "next"
) {
  fail("SVG completion and Draw.io handoff drift");
}

const registeredPresetCount = [
  ...themeRegistry.matchAll(/preset\('([^']+)'/g),
].length;
const themeTrack = tracks.get("theme-expansion");
if (
  registeredPresetCount !== 19 ||
  themeTrack?.currentFacts?.registeredPresets !== registeredPresetCount ||
  themeTrack?.currentFacts?.releasePresets !== 7 ||
  themeTrack?.currentFacts?.corePresets !== 3 ||
  themeTrack?.currentFacts?.scenarioPresets !== 4 ||
  themeTrack?.currentFacts?.compatiblePresets !== 12 ||
  visualManifest.scenarios?.length !== 4 ||
  visualManifest.scenarios.some((scenario) => scenario.files?.length !== 3) ||
  themeTrack?.currentFacts?.realTauriScenarioProofs !== 12
) {
  fail("theme completion facts are stale");
}
for (const token of [
  "professionalThemePresets.length !== 3",
  "scenarioThemePresets.length !== 4",
  "contrastRatio(colors.text, colors.background) < 4.5",
]) {
  if (!themeRegistry.includes(token)) fail(`theme registry marker missing: ${token}`);
}

for (const [requirement, source] of [
  ["FR-DATA-009", requirements],
  ["FR-THEME-001", requirements],
  ["FR-VECTOR-001", formatRequirements],
  ["FR-OFFICE-001", formatRequirements],
]) {
  if (!source.includes(requirement)) {
    fail(`product requirement marker missing: ${requirement}`);
  }
}

if (
  roadmap.decision?.nextStage !== "E2B" ||
  roadmap.decision?.nextSlice !== "drawio-structured-editor-security-contract"
) {
  fail("E0 roadmap must advance to E2B after SVG E2A completion");
}
if (
  !packageJson.scripts["ci:check"]?.includes(
    "npm run check:e0-advanced-capability-roadmap",
  )
) {
  fail("E0 roadmap must be part of ci:check");
}

for (const [label, source, markers] of [
  [
    "E0 audit",
    auditDoc,
    ["E0 已完成", "E1A", "SVG", "3 套核心 + 4 套场景", "releaseCandidate=false"],
  ],
  [
    "development handoff",
    handoffDoc,
    ["E0 已完成", "advanced-capability-roadmap.json", "E1A 已完成"],
  ],
  [
    "current development audit",
    currentAuditDoc,
    ["E0 高级能力差距审计已完成", "E2A SVG 安全源码编辑已完成", "下一代码阶段为 E2B"],
  ],
]) {
  for (const marker of markers) {
    if (!source.includes(marker)) fail(`${label} is missing marker: ${marker}`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  `E0 advanced capability roadmap passed: ${tracks.size} tracks; bounded Excel E1A and SVG E2A are complete, Draw.io E2B is next, themes remain 3 core + 4 scenario, RC remains blocked.`,
);
