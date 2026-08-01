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
const packageJson = json("package.json");
const generator = read(policy.runner.sandboxGenerator);
const lifecycle = read(policy.runner.lifecycleScript);
const failures = [];
const fail = (message) => failures.push(message);

if (policy.schemaVersion !== 1 || policy.stage !== "U2" || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false || policy.currentStatus !== "v1-hosted-unsigned-lifecycle-passed-community-release-ready") fail("invalid U2 identity or status");
if (u1.nextStage !== "U2" || manifest.sourceCommit !== policy.artifactSourceCommit || policy.runner.artifactSourceCommitBound !== true || policy.runner.sandboxConfigurationPrepared !== true || policy.runner.hostInstallerMutationAllowed !== false || policy.runner.githubRunId !== 30707592201) fail("U2 hosted artifact binding drift");
if (policy.runner.githubRunUrl !== "https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/30707592201" || policy.blockers.length !== 0 || policy.evidence.lifecycleResultComplete !== true) fail("U2 hosted run closure drift");
if (policy.requiredChecks.length !== 10 || !policy.requiredChecks.includes("management-backup-restore") || !policy.requiredChecks.includes("knowledge-index-recovery") || !policy.requiredChecks.includes("uninstall-retains-user-data")) fail("U2 lifecycle coverage drift");

if (manifest.schemaVersion !== 1 || manifest.stage !== "U2I" || manifest.status !== "hosted-evidence-import-approved" || manifest.appVersion !== packageJson.version || manifest.sourceCommit !== policy.artifactSourceCommit || manifest.githubRunId !== policy.runner.githubRunId || manifest.artifacts.length !== 1 || manifest.artifacts[0].sha256 !== bundle.currentInstallerSha256 || manifest.artifacts[0].authenticodeStatus !== "NotSigned") fail("U2 hosted artifact manifest drift");
if (environment.schemaVersion !== 1 || environment.stage !== "U2" || environment.appVersion !== packageJson.version || environment.sourceCommit !== policy.artifactSourceCommit || environment.githubRunId !== policy.runner.githubRunId || environment.artifactPreflight.candidateHashMatchesManifest !== true || environment.artifactPreflight.candidateAuthenticodeStatus !== "NotSigned") fail("U2 hosted environment preflight drift");
if (environment.environment.productName !== "Microsoft Windows Server 2025 Datacenter" || environment.environment.disposable !== true || environment.environment.windowsClientEvidenceClaimed !== false || environment.execution.lifecycleSmokeExecuted !== true || environment.execution.lifecycleCheckCount !== 18 || environment.execution.installedSmokeCheckCount !== 12 || environment.execution.sourceUserContentIncluded !== false) fail("U2 hosted execution boundary drift");

if (!fs.existsSync(importedRoot)) fail("U2 imported lifecycle evidence is missing");
if (bundle.sourceCommit !== policy.artifactSourceCommit || bundle.currentInstallerSha256 !== manifest.artifacts[0].sha256 || bundle.environment?.productName !== environment.environment.productName || bundle.sourceUserContentIncluded !== false) fail("U2 hosted bundle binding or environment drift");
for (const result of [lifecycleResult, installedSmoke, managementEvidence]) if (result.status !== "passed" || result.releaseCandidate !== false || result.promotionEligible !== false || result.sourceUserContentIncluded !== false) fail("U2 imported evidence boundary drift");
if (lifecycleResult.currentVersion !== packageJson.version || lifecycleResult.currentInstallerSha256 !== manifest.artifacts[0].sha256 || lifecycleResult.checks.length !== 18 || lifecycleResult.signature?.status !== "NotSigned" || lifecycleResult.signedArtifactRuntimeProven !== false) fail("U2 lifecycle coverage or unsigned boundary drift");
if (installedSmoke.appVersion !== packageJson.version || installedSmoke.installerSha256 !== manifest.artifacts[0].sha256 || installedSmoke.checks.length !== 12) fail("U2 installed smoke binding drift");
for (const id of ["installed-txt-read-edit-save-reopen", "installed-json-read-edit-save-reopen"]) {
  const result = installedSmoke.checks.find((check) => check.id === id);
  if (result?.status !== "passed" || result.visual?.markerHitTestVisible !== true || result.visual?.contrastRatio < 4.5) fail(`U2 visual evidence failed: ${id}`);
}

for (const token of ["manifestSourceCommit", "artifact source commit", "docs/evidence/u2-disposable-install-lifecycle", "-ConfirmDisposableMachine", "-AllowInstallerMutation"]) if (!generator.includes(token)) fail(`U2 generator token missing: ${token}`);
for (const token of ["WDAGUtilityAccount", "LONGEDIT_R5I_DISPOSABLE", "requires a disposable machine with no existing LongEdit product registration", "management-backup-index-evidence.json"]) if (!lifecycle.includes(token)) fail(`U2 lifecycle safety token missing: ${token}`);
if (!packageJson.scripts["ci:check"]?.includes("check:u2-disposable-install-lifecycle")) fail("U2 checker is not reachable from ci:check");

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("U2 v1.0.0 hosted unsigned lifecycle evidence is source- and installer-bound; community release quality gate is next.");
