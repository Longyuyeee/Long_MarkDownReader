import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));
const policy = json("shared/u1-unsigned-internal-candidate-policy.json");
const e5 = json("shared/e5-final-capability-closure.json");
const release = json("shared/release-capability-matrix.json");
const manifest = json(policy.evidence.installerManifest);
const smoke = json(policy.evidence.portableRuntimeSmoke);
const packageJson = json("package.json");
const audit = read("docs/U1_Unsigned_Internal_Candidate_Audit_2026-08-01.md");
const handoff = read("docs/Development_Handoff.md");
const failures = [];
const fail = (message) => failures.push(message);
const sha256 = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

if (policy.schemaVersion !== 1 || policy.stage !== "U1" || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false || release.releaseCandidate !== false || policy.currentStatus !== "unsigned-candidate-built-runtime-smoke-blocked-existing-single-instance") fail("invalid U1 identity or status");
if (e5.nextStage !== "U1" || policy.nextStage !== "U2" || policy.nextSlice !== "disposable-unsigned-install-lifecycle") fail("E5 to U1 to U2 handoff drift");
if (policy.evidence.artifactFilesCommitted !== false || policy.evidence.sourceUserContentAllowed !== false || policy.gates.promotionEligible !== false || policy.gates.artifactsSigned !== false || policy.gates.installerExecuted !== false) fail("U1 truth boundary drift");

if (manifest.schemaVersion !== 1 || manifest.stage !== "U1" || manifest.appVersion !== packageJson.version || manifest.sourceCommit !== policy.sourceCommit || manifest.isolatedCleanWorktree !== true || manifest.buildExecuted !== true || manifest.releaseCandidate !== false || manifest.promotionEligible !== false || manifest.internalOnly !== true || manifest.artifactFilesCommitted !== false || manifest.sourceUserContentIncluded !== false) fail("U1 installer manifest drift");
const targets = manifest.artifacts?.map((artifact) => artifact.target).sort();
if (JSON.stringify(targets) !== JSON.stringify([...policy.requiredTargets].sort())) fail("U1 installer target set drift");
for (const artifact of manifest.artifacts ?? []) {
  if (!artifact.fileName.includes(packageJson.version) || !/^[a-f0-9]{64}$/.test(artifact.sha256) || artifact.sizeBytes < 1_000_000 || artifact.authenticodeStatus !== "NotSigned" || artifact.signed !== false || artifact.officialRelease !== false || artifact.promotionEligible !== false) fail(`invalid U1 artifact: ${artifact.target}`);
  const localDirectory = path.join(root, artifact.relativeDirectory);
  if (fs.existsSync(localDirectory)) {
    const localPath = path.join(localDirectory, artifact.fileName);
    if (!fs.existsSync(localPath)) fail(`local U1 artifact missing: ${artifact.fileName}`);
    else {
      const stats = fs.statSync(localPath);
      if (stats.size !== artifact.sizeBytes || sha256(localPath) !== artifact.sha256) fail(`local U1 artifact mismatch: ${artifact.fileName}`);
    }
  }
}

if (smoke.schemaVersion !== 1 || smoke.stage !== "U1" || smoke.sourceCommit !== policy.sourceCommit || smoke.status !== "blocked-existing-single-instance" || smoke.existingProductProcessCount < 1 || smoke.executableStarted !== false || smoke.installerExecuted !== false || smoke.registryMutated !== false || smoke.sourceUserContentIncluded !== false || smoke.releaseCandidate !== false) fail("U1 portable smoke blocker evidence drift");
for (const blocker of ["existing-longedit-single-instance-prevented-portable-runtime-smoke", "host-installer-mutation-not-authorized", "signed-windows-10-runtime-evidence-missing", "signed-windows-11-runtime-evidence-missing"]) {
  if (!policy.blockers.includes(blocker)) fail(`U1 blocker missing: ${blocker}`);
}
if (!packageJson.scripts["ci:check"]?.includes("check:u1-unsigned-internal-candidate")) fail("U1 checker is not reachable from ci:check");
for (const [label, source, markers] of [["audit", audit, ["U1", "6f3ce50", "NotSigned", "blocked-existing-single-instance", "releaseCandidate=false", "U2"]], ["handoff", handoff, ["U1 已更新到 1.0.0", "u1-unsigned-internal-candidate-policy.json", "U2"]]]) {
  for (const marker of markers) if (!source.includes(marker)) fail(`${label} is missing marker: ${marker}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`U1 unsigned internal candidate passed: ${manifest.artifacts.length} unsigned installers bound to ${policy.sourceCommit.slice(0, 7)}; runtime smoke truthfully blocked, U2 is next.`);
