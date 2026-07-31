import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));
const contract = json("shared/product-acceptance-freeze.json");
const registry = json("shared/file-formats.json");
const release = json("shared/release-capability-matrix.json");
const safety = json("shared/safe-degradation-contract.json");
const packageJson = json("package.json");
const tauri = json("src-tauri/tauri.conf.json");
const auditDoc = read(
  "docs/D3_Final_Product_Acceptance_and_Capability_Freeze_Audit_2026-07-31.md",
);
const handoffDoc = read("docs/Development_Handoff.md");
const currentAuditDoc = read(
  "docs/Current_Development_Audit_and_Next_Plan_2026-07-31.md",
);
const failures = [];
const fail = (message) => failures.push(message);

if (
  contract.schemaVersion !== 1 ||
  contract.stage !== "D3" ||
  contract.appVersion !== packageJson.version ||
  contract.appVersion !== tauri.version
) {
  fail("invalid D3 contract identity");
}
if (
  contract.productAcceptanceStatus !== "accepted-for-capability-freeze" ||
  contract.releaseStatus !== "blocked-external-evidence" ||
  contract.releaseCandidate !== false ||
  release.releaseCandidate !== false
) {
  fail("D3 must freeze product capability without promoting an RC");
}

const expectedCounts = {
  registeredFormats: registry.formats.length,
  releaseProfiles: release.profiles.length,
  safeDegradationLanes: safety.lanes.length,
};
for (const [key, value] of Object.entries(expectedCounts)) {
  if (contract.frozenBaseline?.[key] !== value) {
    fail(`frozen baseline drift: ${key}`);
  }
}

const scriptDependencies = new Map();
for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  const dependencies = [];
  for (const match of command.matchAll(/npm(?:\.cmd)? run ([\w:-]+)/g)) {
    dependencies.push(match[1]);
  }
  scriptDependencies.set(name, dependencies);
}

const reachable = new Set();
const visit = (name) => {
  if (reachable.has(name)) return;
  reachable.add(name);
  for (const dependency of scriptDependencies.get(name) ?? []) visit(dependency);
};
visit("ci:check");

const expectedAreas = new Set([
  "daily-workspace-management",
  "format-authoring-and-safe-degradation",
  "knowledge-organization",
  "visual-authoring-theme-and-accessibility",
  "pdf-page-workflows",
  "modern-office-copy-workflows",
  "bounded-workbook-editing",
  "recovery-backup-and-privacy",
  "performance-and-regression-quality",
]);
const areaIds = new Set();

for (const area of contract.acceptanceAreas ?? []) {
  if (!area.id || areaIds.has(area.id)) fail(`invalid or duplicate area ${area.id}`);
  areaIds.add(area.id);
  if (area.status !== "accepted") fail(`${area.id} is not accepted`);
  if (!area.gateScripts?.length || !area.evidence?.length) {
    fail(`${area.id} has incomplete acceptance evidence`);
    continue;
  }

  for (const script of area.gateScripts) {
    if (!packageJson.scripts?.[script]) fail(`${area.id} gate is missing: ${script}`);
    if (!reachable.has(script)) fail(`${area.id} gate is not reachable from ci:check: ${script}`);
  }

  for (const evidencePath of area.evidence) {
    const absolutePath = path.join(root, evidencePath);
    if (!fs.existsSync(absolutePath)) {
      fail(`${area.id} evidence is missing: ${evidencePath}`);
      continue;
    }
    if (evidencePath.endsWith(".json")) {
      const evidence = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
      if (evidence.schemaVersion !== 1) {
        fail(`${area.id} evidence schema drift: ${evidencePath}`);
      }
      if (
        Array.isArray(evidence.checks) &&
        evidence.checks.some(
          (check) =>
            check &&
            typeof check === "object" &&
            "status" in check &&
            check.status !== "passed",
        )
      ) {
        fail(`${area.id} contains a failed evidence check: ${evidencePath}`);
      }
    }
  }
}

if (
  areaIds.size !== expectedAreas.size ||
  [...expectedAreas].some((id) => !areaIds.has(id))
) {
  fail("D3 acceptance area coverage drift");
}

const releaseExternalGates = new Map(
  (release.externalGates ?? []).map((gate) => [gate.id, gate]),
);
for (const gate of contract.externalGates ?? []) {
  const source = releaseExternalGates.get(gate.id);
  if (
    !source ||
    source.status !== gate.status ||
    source.evidence !== gate.evidence ||
    gate.status !== "partial"
  ) {
    fail(`external gate is overstated or stale: ${gate.id}`);
  }
}
if (
  contract.externalGates?.length !== release.externalGates?.length ||
  contract.nextStage !== "E0"
) {
  fail("D3 external gate or handoff drift");
}

for (const exclusion of [
  "signed-windows-rc-promotion",
  "complete-excel-equivalent-editing",
  "complex-office-and-odf-equivalent-editing",
  "wps-native-kernel-editing",
]) {
  if (!contract.scopeExclusions?.includes(exclusion)) {
    fail(`D3 scope exclusion is missing: ${exclusion}`);
  }
}

if (!packageJson.scripts["ci:check"]?.includes("npm run check:d3-product-acceptance-freeze")) {
  fail("D3 acceptance freeze must be part of ci:check");
}

for (const [label, source, markers] of [
  [
    "D3 audit",
    auditDoc,
    [
      "accepted-for-capability-freeze",
      "blocked-external-evidence",
      "releaseCandidate=false",
      "E0",
    ],
  ],
  [
    "development handoff",
    handoffDoc,
    [
      "D3 已完成",
      "product-acceptance-freeze.json",
      "下一代码阶段为 E0",
    ],
  ],
  [
    "current development audit",
    currentAuditDoc,
    [
      "D3 最终产品验收已完成",
      "E0 高级能力差距审计已完成",
      "后者继续为 `false`",
    ],
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
  `D3 product acceptance freeze passed: ${areaIds.size} areas, ${expectedCounts.registeredFormats} formats, ${expectedCounts.releaseProfiles} profiles, ${expectedCounts.safeDegradationLanes} safety lanes; RC remains blocked.`,
);
