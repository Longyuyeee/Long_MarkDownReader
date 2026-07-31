import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));
const capabilities = json("shared/xlsx-formula-capabilities.json");
const matrix = json("shared/xlsx-compatibility-matrix.json");
const roadmap = json("shared/advanced-capability-roadmap.json");
const packageJson = json("package.json");
const rust = read("src-tauri/src/formats/workbook_dynamic_array.rs");
const command = read("src-tauri/src/commands/workbook.rs");
const library = read("src-tauri/src/lib.rs");
const view = read("src/views/WorkbookView.vue");
const audit = read("docs/E1A_Dynamic_Array_In_Memory_Preview_Audit_2026-07-31.md");
const handoff = read("docs/Development_Handoff.md");
const currentAudit = read(
  "docs/Current_Development_Audit_and_Next_Plan_2026-07-31.md",
);
const failures = [];
const fail = (message) => failures.push(message);

const contract = capabilities.dynamicArrayPreviewContract;
if (
  contract?.stage !== "E1A" ||
  contract?.status !== "verified-bounded-preview" ||
  contract?.supportedFunctions?.join(",") !== "SEQUENCE" ||
  contract?.mode !== "explicit-in-memory-preview" ||
  contract?.resultPersistence !== "none" ||
  contract?.writesUserFile !== false ||
  contract?.writesFormulaCache !== false ||
  contract?.maxPreviewCells !== 10_000 ||
  contract?.unsavedNumericDependencies !== true ||
  contract?.formulaDependencies !== "blocked" ||
  contract?.nestedFunctions !== "blocked" ||
  contract?.externalReferences !== "blocked" ||
  contract?.sourceSignatureRequired !== true ||
  contract?.sourcePackageUnchanged !== true
) {
  fail("E1A machine contract is missing or overstated");
}
for (const code of [
  "e1a_unsupported_function",
  "spill_conflict",
  "resource_limit",
  "sheet_boundary",
  "numeric_overflow",
  "legacy_array_blocked",
  "array_range_edit_blocked",
]) {
  if (!contract?.stableDiagnostics?.includes(code)) {
    fail(`E1A stable diagnostic missing: ${code}`);
  }
}

const feature = matrix.features.find((item) => item.id === "dynamic_arrays");
if (
  feature?.calculate !== "limited" ||
  feature?.edit !== "limited" ||
  feature?.roundTrip !== "preserved" ||
  !feature?.evidence?.includes("10,000-cell") ||
  !feature?.evidence?.includes("no file or cache writes")
) {
  fail("public dynamic-array capability matrix is stale");
}

const excel = roadmap.tracks.find((track) => track.id === "excel-equivalence");
const e1a = excel?.phases?.find((phase) => phase.id === "E1A");
const formats = roadmap.tracks.find((track) => track.id === "new-format-editors");
if (
  e1a?.status !== "completed" ||
  e1a?.writeUserFile !== false ||
  e1a?.deliveredContract !==
    "shared/xlsx-formula-capabilities.json#dynamicArrayPreviewContract" ||
  roadmap.decision?.nextStage !== "E2A" ||
  roadmap.decision?.nextSlice !==
    "svg-security-contract-and-basic-source-editor" ||
  formats?.phases?.[0]?.status !== "next"
) {
  fail("E1A completion and E2A handoff are not aligned");
}

for (const marker of [
  'SUPPORTED_DYNAMIC_ARRAY_FUNCTIONS: [&str; 1] = ["SEQUENCE"]',
  "const MAX_PREVIEW_CELLS: usize = 10_000",
  "preview_dynamic_array",
  "spill_conflict",
  "previews_sequence_in_memory_with_unsaved_scalar_dependency",
  "blocks_occupied_spill_targets_with_stable_addresses",
]) {
  if (!rust.includes(marker)) fail(`E1A Rust marker missing: ${marker}`);
}
for (const [label, source, markers] of [
  [
    "command",
    command,
    [
      "preview_workbook_dynamic_array",
      "expected_signature",
      "preview_dynamic_array",
      "dynamic_array_preview_command_requires_current_signature",
    ],
  ],
  ["Tauri registration", library, ["preview_workbook_dynamic_array"]],
  [
    "workbook view",
    view,
    [
      "previewSelectedDynamicArray",
      "dynamicArrayPreviewValues",
      "dynamic-array-preview",
      "内存预览",
    ],
  ],
]) {
  for (const marker of markers) {
    if (!source.includes(marker)) fail(`${label} marker missing: ${marker}`);
  }
}

if (
  packageJson.scripts["check:e1a-dynamic-array-preview"] !==
    "node scripts/check-e1a-dynamic-array-preview.mjs" ||
  !packageJson.scripts["ci:check"]?.includes(
    "npm run check:e1a-dynamic-array-preview",
  )
) {
  fail("E1A check is not reachable from ci:check");
}

for (const [label, source, markers] of [
  [
    "E1A audit",
    audit,
    ["E1A 已完成", "SEQUENCE", "10,000", "不写用户文件", "下一代码阶段为 E2A"],
  ],
  [
    "handoff",
    handoff,
    ["E1A 已完成", "dynamicArrayPreviewContract", "下一代码阶段为 E2A"],
  ],
  [
    "current audit",
    currentAudit,
    ["E1A 已完成", "下一代码阶段为 E2A"],
  ],
]) {
  for (const marker of markers) {
    if (!source.includes(marker)) fail(`${label} marker missing: ${marker}`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  "E1A dynamic-array preview passed: bounded SEQUENCE, direct numeric drafts, stable spill diagnostics, zero file/cache writes; E2A is next.",
);
