import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/u2-unsigned-lifecycle.yml", "utf8");
const lifecycle = fs.readFileSync("scripts/run-r5i-isolated-install-lifecycle.ps1", "utf8");
const policy = JSON.parse(fs.readFileSync("shared/u2-disposable-install-lifecycle-policy.json", "utf8"));
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const failures = [];
const fail = (message) => failures.push(message);

for (const token of [
  "workflow_dispatch:",
  "runs-on: windows-latest",
  "timeout-minutes: 60",
  "artifact_run_id:",
  "actions: read",
  "LONGEDIT_R5I_DISPOSABLE: \"1\"",
  "ref: ${{ inputs.product_ref }}",
  "ref: v0.6.2",
  "npm run tauri -- build --bundles nsis",
  "Get-AuthenticodeSignature",
  "-ExpectedSourceCommit $env:PRODUCT_SOURCE_COMMIT",
  "-ConfirmDisposableMachine",
  "-AllowInstallerMutation",
  "if: always()",
  "actions/upload-artifact@v4",
  "actions/download-artifact@v4",
  "Restore prior verified U2 installers",
]) {
  if (!workflow.includes(token)) fail(`U2 workflow token missing: ${token}`);
}
for (const token of ["Write-RuntimeLaunchDiagnostics", "runtime-launch-diagnostics-$Phase.json", "$attempt -lt 1200", "processExitCode", "webViewRuntimeVersions", "Enable-WebView2TestPolicy", "AdditionalBrowserArguments", "Disable-WebView2TestPolicy", "Refusing to overwrite an existing WebView2 policy"]) {
  if (!lifecycle.includes(token)) fail(`U2 runtime diagnostic token missing: ${token}`);
}
if (policy.runner.githubHostedWorkflow !== ".github/workflows/u2-unsigned-lifecycle.yml" || policy.runner.githubHostedRunnerPrepared !== true) fail("U2 policy does not bind the hosted runner");
if (!packageJson.scripts["ci:check"]?.includes("check:u2-github-hosted-workflow")) fail("U2 hosted workflow checker is not reachable from ci:check");
if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("U2 GitHub hosted disposable workflow passed: frozen current and v0.6.2 rollback builds, fail-closed unsigned lifecycle, and always-uploaded evidence are defined.");
