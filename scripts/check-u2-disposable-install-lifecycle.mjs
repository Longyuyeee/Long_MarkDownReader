import fs from "node:fs";

const read = (filePath) => fs.readFileSync(filePath, "utf8");
const json = (filePath) => JSON.parse(read(filePath));
const policy = json("shared/u2-disposable-install-lifecycle-policy.json");
const u1 = json("shared/u1-unsigned-internal-candidate-policy.json");
const manifest = json(policy.runner.artifactManifest);
const environment = json(policy.evidence.environmentAudit);
const importedRoot = policy.evidence.importedEvidence;
const bundle = json(`${importedRoot}/r5k-bundle-manifest.json`);
const lifecycleResult = json(`${importedRoot}/lifecycle-result.json`);
const installedSmoke = json(`${importedRoot}/installed-artifact-smoke.json`);
const managementEvidence = json(`${importedRoot}/management-backup-index-evidence.json`);
const release = json("shared/release-capability-matrix.json");
const packageJson = json("package.json");
const generator = read(policy.runner.sandboxGenerator);
const lifecycle = read(policy.runner.lifecycleScript);
const audit = read("docs/U2O_Hosted_Unsigned_Lifecycle_Closure_Audit_2026-08-01.md");
const handoff = read("docs/Development_Handoff.md");
const failures = [];
const fail = (message) => failures.push(message);

if (policy.schemaVersion !== 1 || policy.stage !== "U2" || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false || release.releaseCandidate !== false || policy.currentStatus !== "hosted-unsigned-lifecycle-passed-signed-client-matrix-pending") fail("invalid U2 identity or status");
if (u1.nextStage !== "U2" || manifest.sourceCommit !== policy.artifactSourceCommit || policy.runner.artifactSourceCommitBound !== true || policy.runner.sandboxConfigurationPrepared !== true || policy.runner.hostInstallerMutationAllowed !== false || policy.runner.githubRunId !== 30664431101) fail("U2 hosted artifact binding drift");
if (policy.requiredChecks.length !== 10 || !policy.requiredChecks.includes("management-backup-restore") || !policy.requiredChecks.includes("knowledge-index-recovery") || !policy.requiredChecks.includes("uninstall-retains-user-data")) fail("U2 lifecycle coverage drift");

if (environment.schemaVersion !== 1 || environment.stage !== "U2" || environment.appVersion !== packageJson.version || environment.artifactPreflight.candidateNsisMatchCount !== 1 || environment.artifactPreflight.previousNsisMatchCount !== 1 || environment.artifactPreflight.candidateHashMatchesManifest !== true || environment.artifactPreflight.candidateAuthenticodeStatus !== "NotSigned") fail("U2 historical local artifact preflight drift");
if (environment.execution.sandboxConfigurationCanBePrepared !== true || environment.execution.isolatedRunnerAvailable !== false || environment.execution.lifecycleSmokeExecuted !== false || environment.execution.releaseCandidate !== false || environment.execution.promotionEligible !== false || environment.execution.sourceUserContentIncluded !== false) fail("U2 historical host execution boundary drift");
if (environment.hostSafety.existingProductRegistrationCount < 1 || environment.hostSafety.runningProductProcessCount < 1 || environment.hostSafety.hostInstallerMutationAllowed !== false || environment.hostSafety.existingInstallMayBeOverwritten !== false) fail("U2 host safety evidence drift");
if (Object.values(environment.virtualization).some(Boolean)) fail("U2 current environment unexpectedly claims a disposable runner");
if (!fs.existsSync(importedRoot) || policy.evidence.lifecycleResultComplete !== true) fail("U2 imported lifecycle evidence is missing");
if (bundle.sourceCommit !== policy.artifactSourceCommit || bundle.currentInstallerSha256 !== manifest.artifacts[0].sha256 || bundle.environment?.productName !== "Microsoft Windows Server 2025 Datacenter") fail("U2 hosted bundle binding or environment drift");
for (const result of [lifecycleResult, installedSmoke, managementEvidence]) if (result.status !== "passed" || result.releaseCandidate !== false || result.promotionEligible !== false || result.sourceUserContentIncluded !== false) fail("U2 imported evidence boundary drift");
if (lifecycleResult.checks.length !== 18 || lifecycleResult.signature?.status !== "NotSigned" || lifecycleResult.signedArtifactRuntimeProven !== false) fail("U2 lifecycle coverage or unsigned boundary drift");
for (const id of ["installed-txt-read-edit-save-reopen", "installed-json-read-edit-save-reopen"]) {
  const result = installedSmoke.checks.find(check => check.id === id);
  if (result?.status !== "passed" || result.visual?.markerHitTestVisible !== true || result.visual?.contrastRatio < 4.5) fail(`U2 visual evidence failed: ${id}`);
}

for (const token of ["manifestSourceCommit", "artifact source commit", "docs/evidence/u2-disposable-install-lifecycle", "-ConfirmDisposableMachine", "-AllowInstallerMutation"]) if (!generator.includes(token)) fail(`U2 generator token missing: ${token}`);
for (const token of ["WDAGUtilityAccount", "LONGEDIT_R5I_DISPOSABLE", "requires a disposable machine with no existing LongEdit product registration", "management-backup-index-evidence.json"]) if (!lifecycle.includes(token)) fail(`U2 lifecycle safety token missing: ${token}`);
if (!packageJson.scripts["ci:check"]?.includes("check:u2-disposable-install-lifecycle")) fail("U2 checker is not reachable from ci:check");
for (const [label, source, markers] of [["audit", audit, ["U2", "dfe5e9c", "30664431101", "hosted-unsigned-lifecycle-passed-signed-client-matrix-pending", "releaseCandidate=false", "R5N"]], ["handoff", handoff, ["U2O", "30664431101", "execute-signed-windows-10-and-windows-11-client-matrix"]]]) for (const marker of markers) if (!source.includes(marker)) fail(`${label} is missing marker: ${marker}`);

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("U2 hosted unsigned install lifecycle passed with imported visual and management recovery evidence; signed Windows 10/11 execution remains next.");
