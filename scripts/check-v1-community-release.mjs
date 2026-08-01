import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const json = (path) => JSON.parse(read(path));
const failures = [];
const fail = (message) => failures.push(message);

const pkg = json("package.json");
const tauri = json("src-tauri/tauri.conf.json");
const policy = json("shared/v1-community-release-policy.json");
const u2 = json("shared/u2-disposable-install-lifecycle-policy.json");
const r5h = json("docs/evidence/r5h-current-installers/installer-artifact-manifest.json");
const cargo = read("src-tauri/Cargo.toml");
const gitignore = read(".gitignore");
const readme = read("README.md");
const appUpdater = read("src/services/appUpdater.ts");
const updaterUi = read("src/components/AppUpdater.vue");
const updateSettings = read("src/components/UpdateSettingsRow.vue");

if (pkg.version !== "1.0.0" || tauri.version !== pkg.version || !cargo.includes('version = "1.0.0"')) fail("v1 version identity drift");
if (policy.schemaVersion !== 1 || policy.stage !== "V1" || policy.appVersion !== pkg.version || policy.channel !== "community-unsigned") fail("V1 policy identity drift");
if (policy.userDecision.authenticodeRequired !== false || policy.userDecision.unsignedCommunityReleaseApproved !== true || policy.userDecision.unknownPublisherWarningRequired !== true) fail("unsigned community decision drift");
if (policy.updater.enabled !== true || policy.updater.integritySignatureRequired !== true || policy.updater.privateKeyCommitted !== false || policy.updater.latestManifestAsset !== "latest.json") fail("V1 updater policy drift");
if (tauri.bundle.createUpdaterArtifacts !== true || !tauri.plugins?.updater?.pubkey || !tauri.plugins.updater.endpoints?.includes("https://github.com/Longyuyeee/Long_MarkDownReader/releases/latest/download/latest.json")) fail("Tauri updater configuration drift");
if (!pkg.dependencies?.["@tauri-apps/plugin-updater"] || !pkg.dependencies?.["@tauri-apps/plugin-process"] || !cargo.includes('tauri-plugin-updater = "2"') || !cargo.includes('tauri-plugin-process = "2"')) fail("updater dependencies drift");
for (const token of ["checkForUpdates", "downloadAndInstall", "relaunch"]) if (!appUpdater.includes(token) && !updaterUi.includes(token)) fail(`updater implementation token missing: ${token}`);
if (!updateSettings.includes("checkForUpdates") || !gitignore.includes(".release-secrets/")) fail("manual updater or secret ignore boundary drift");
if (!readme.includes("v1.0.0") || !readme.includes("未知发布者") || !readme.includes("SHA-256") || !readme.includes("每 24 小时")) fail("README release disclosure drift");
if (u2.evidence.lifecycleResultComplete !== true || u2.runner.artifactSourceCommitBound !== true || u2.blockers.length !== 0) fail("installed lifecycle evidence is incomplete");
if (r5h.sourceCommit !== u2.artifactSourceCommit || r5h.artifacts.length !== 2 || r5h.artifacts.some((item) => item.authenticodeStatus !== "NotSigned" || item.signed !== false)) fail("V1 installer evidence drift");
if (policy.gates.installedLifecyclePassed !== true || policy.gates.frontendBuildPassed !== true || policy.gates.rustLockedCheckPassed !== true || policy.gates.updaterSignaturesBuilt !== true) fail("V1 prerequisite gate drift");

if (policy.gates.githubReleasePublished === true) {
  if (policy.gates.qualityGatePassed !== true || policy.releaseCandidate !== true || policy.currentStatus !== "v1.0.0-community-release-published") fail("published V1 state is inconsistent");
} else if (policy.gates.qualityGatePassed === true) {
  if (policy.releaseCandidate !== true || policy.currentStatus !== "v1.0.0-community-release-ready-to-publish") fail("ready-to-publish V1 state is inconsistent");
} else if (policy.releaseCandidate !== false || policy.currentStatus !== "installed-lifecycle-passed-final-quality-gate-pending") {
  fail("pre-quality V1 state is inconsistent");
}

for (const path of ["docs/RELEASE_NOTES_v1.0.0.md", "docs/V1_0_0_Unsigned_Community_Release_Audit_2026-08-01.md"]) if (!fs.existsSync(path)) fail(`release document missing: ${path}`);

if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exit(1);
}
console.log("V1 community release contract passed: 1.0.0, unsigned disclosure, updater integrity, and installed lifecycle evidence are aligned.");
