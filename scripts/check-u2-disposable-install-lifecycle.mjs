import fs from "node:fs";

const read = (filePath) => fs.readFileSync(filePath, "utf8");
const json = (filePath) => JSON.parse(read(filePath));
const policy = json("shared/u2-disposable-install-lifecycle-policy.json");
const u1 = json("shared/u1-unsigned-internal-candidate-policy.json");
const manifest = json(policy.runner.artifactManifest);
const environment = json(policy.evidence.environmentAudit);
const release = json("shared/release-capability-matrix.json");
const packageJson = json("package.json");
const generator = read(policy.runner.sandboxGenerator);
const lifecycle = read(policy.runner.lifecycleScript);
const audit = read("docs/U2_Disposable_Unsigned_Install_Lifecycle_Handoff_2026-08-01.md");
const handoff = read("docs/Development_Handoff.md");
const failures = [];
const fail = (message) => failures.push(message);

if (policy.schemaVersion !== 1 || policy.stage !== "U2" || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false || release.releaseCandidate !== false || policy.currentStatus !== "handoff-ready-current-host-execution-blocked") fail("invalid U2 identity or status");
if (u1.nextStage !== "U2" || manifest.sourceCommit !== policy.artifactSourceCommit || policy.runner.artifactSourceCommitBound !== true || policy.runner.sandboxConfigurationPrepared !== true || policy.runner.hostInstallerMutationAllowed !== false) fail("U1 artifact to U2 runner binding drift");
if (policy.requiredChecks.length !== 10 || !policy.requiredChecks.includes("management-backup-restore") || !policy.requiredChecks.includes("knowledge-index-recovery") || !policy.requiredChecks.includes("uninstall-retains-user-data")) fail("U2 lifecycle coverage drift");

if (environment.schemaVersion !== 1 || environment.stage !== "U2" || environment.appVersion !== packageJson.version || environment.sourceCommit !== policy.artifactSourceCommit || environment.artifactPreflight.candidateNsisMatchCount !== 1 || environment.artifactPreflight.previousNsisMatchCount !== 1 || environment.artifactPreflight.candidateHashMatchesManifest !== true || environment.artifactPreflight.candidateAuthenticodeStatus !== "NotSigned") fail("U2 artifact preflight drift");
if (environment.execution.sandboxConfigurationCanBePrepared !== true || environment.execution.isolatedRunnerAvailable !== false || environment.execution.lifecycleSmokeExecuted !== false || environment.execution.currentStatus !== policy.currentStatus || environment.execution.releaseCandidate !== false || environment.execution.promotionEligible !== false || environment.execution.sourceUserContentIncluded !== false) fail("U2 execution boundary drift");
if (environment.hostSafety.existingProductRegistrationCount < 1 || environment.hostSafety.runningProductProcessCount < 1 || environment.hostSafety.hostInstallerMutationAllowed !== false || environment.hostSafety.existingInstallMayBeOverwritten !== false) fail("U2 host safety evidence drift");
if (Object.values(environment.virtualization).some(Boolean)) fail("U2 current environment unexpectedly claims a disposable runner");
if (fs.existsSync(`${policy.evidence.sandboxOutput}/lifecycle-result.json`)) fail("U2 must not claim lifecycle output before external execution");

for (const token of ["manifestSourceCommit", "artifact source commit", "docs/evidence/u2-disposable-install-lifecycle", "-ConfirmDisposableMachine", "-AllowInstallerMutation"]) if (!generator.includes(token)) fail(`U2 generator token missing: ${token}`);
for (const token of ["WDAGUtilityAccount", "LONGEDIT_R5I_DISPOSABLE", "requires a disposable machine with no existing LongEdit product registration", "management-backup-index-evidence.json"]) if (!lifecycle.includes(token)) fail(`U2 lifecycle safety token missing: ${token}`);
if (!packageJson.scripts["ci:check"]?.includes("check:u2-disposable-install-lifecycle")) fail("U2 checker is not reachable from ci:check");
for (const [label, source, markers] of [["audit", audit, ["U2", "953494c", "handoff-ready-current-host-execution-blocked", "releaseCandidate=false", "R5N"]], ["handoff", handoff, ["U2", "u2-disposable-install-lifecycle-policy.json", "execute-on-disposable-windows-runner"]]]) for (const marker of markers) if (!source.includes(marker)) fail(`${label} is missing marker: ${marker}`);

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("U2 disposable install lifecycle handoff passed: artifact and rollback installer are ready, host mutation remains blocked, external disposable execution is next.");
