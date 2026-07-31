import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));
const contract = json("shared/e5-final-capability-closure.json");
const roadmap = json("shared/advanced-capability-roadmap.json");
const freeze = json("shared/product-acceptance-freeze.json");
const registry = json("shared/file-formats.json");
const release = json("shared/release-capability-matrix.json");
const safety = json("shared/safe-degradation-contract.json");
const evidence = json("docs/evidence/e5-final-capability-closure/audit-manifest.json");
const packageJson = json("package.json");
const audit = read("docs/E5_Final_Advanced_Capability_Closure_Audit_2026-08-01.md");
const closure = read("docs/Current_Closure_Status_and_Packaging_Plan_2026-07-31.md");
const handoff = read("docs/Development_Handoff.md");
const failures = [];
const fail = (message) => failures.push(message);

if (contract.schemaVersion !== 1 || contract.stage !== "E5" || contract.appVersion !== packageJson.version || contract.status !== "advanced-capability-closure-passed" || contract.releaseCandidate !== false || release.releaseCandidate !== false) fail("invalid E5 identity or RC state");

const readiness = release.formats.reduce((counts, format) => {
  counts[format.readiness] = (counts[format.readiness] ?? 0) + 1;
  return counts;
}, {});
const expectedBaseline = {
  registeredFormats: registry.formats.length,
  verifiedFormats: readiness.verified,
  limitedFormats: readiness["verified-with-limitations"],
  externalDependencyFormats: readiness["external-dependency"],
  releaseProfiles: release.profiles.length,
  safeDegradationLanes: safety.lanes.length,
};
for (const [key, value] of Object.entries(expectedBaseline)) {
  if (contract.frozenBaseline?.[key] !== value) fail(`baseline drift: ${key}`);
}
if (freeze.productAcceptanceStatus !== "accepted-for-capability-freeze" || roadmap.decision?.nextStage !== "U1" || roadmap.decision?.closureContract !== "shared/e5-final-capability-closure.json" || contract.nextStage !== "U1" || contract.nextSlice !== "unsigned-internal-candidate-package") fail("E5 handoff to U1 is incomplete");

const blocked = new Map(contract.externalEvidenceBlocked.map((item) => [item.id, item]));
for (const [id, evidenceValue] of [["E1B-array-producer-closure", "1/3"], ["E1C-multi-axis-pivot-reliable-copy", "2/3"], ["wps-odf-producer-closure", "2/3"], ["signed-windows-10-11-runtime", "0/2"]]) {
  const item = blocked.get(id);
  if (!item || item.evidence !== evidenceValue || item.promotionAllowed !== false) fail(`external blocker drift: ${id}`);
}

if (evidence.schemaVersion !== 1 || evidence.stage !== "E5" || evidence.status !== "passed" || evidence.releaseCandidate !== false || evidence.sourceCommit !== contract.auditedSourceCommit || evidence.externalEvidencePromoted !== false || evidence.sourceUserContentIncluded !== false || evidence.checks?.some((check) => check.status !== "passed")) fail("E5 evidence is incomplete or promotional");
const functional = evidence.checks.find((check) => check.id === "rust-functional-regression");
const performance = evidence.checks.find((check) => check.id === "rust-workbook-performance");
const dependencies = evidence.checks.find((check) => check.id === "production-dependency-audit");
if (functional?.passed !== contract.qualityEvidence.functionalRustTestsPassed || functional?.failed !== 0 || performance?.passed !== contract.qualityEvidence.performanceRustTestsPassed || performance?.failed !== 0 || dependencies?.vulnerabilities !== 0) fail("E5 quality totals drift");

if (!packageJson.scripts["ci:check"]?.includes("check:e5-final-capability-closure")) fail("E5 checker is not reachable from ci:check");
for (const [label, source, markers] of [["audit", audit, ["E5", "U1", "releaseCandidate=false", "431"]], ["closure plan", closure, ["E5 已完成", "U1", "releaseCandidate=false"]], ["handoff", handoff, ["E5 已完成", "U1", "e5-final-capability-closure.json"]]]) {
  for (const marker of markers) if (!source.includes(marker)) fail(`${label} is missing marker: ${marker}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`E5 final capability closure passed: ${registry.formats.length} formats, ${functional.passed} functional Rust tests, ${performance.passed} performance test, RC remains blocked; U1 is next.`);
