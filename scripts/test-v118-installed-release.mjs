// In-memory validator inputs only. Never recorded as installed acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { test } from 'node:test'
import { parse } from 'yaml'
import { assertInstalledReleaseRuntime } from './lib/installed-release-runtime.mjs'
import { validateInstalledSearchCompleteness, searchCompletenessChecks } from './lib/installed-v1-1-8-evidence.mjs'
import { searchRuntimeIdentity, matchesSearchRuntimeTarget } from './lib/v118-search-runtime-identity.mjs'
import { assertV121DevelopmentBoundary, assertV121UpdaterStatus } from './lib/v121-updater-status.mjs'
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))

function fixture() {
  const manifest = json('docs/evidence/v1.1.7-release/artifact-manifest.json'), records = {}
  manifest.appVersion = manifest.sourceVersion = '1.1.8'
  const nsis = manifest.artifacts.find(item => item.target === 'nsis').sha256
  for (const [key, item] of Object.entries(manifest.runtimeSmoke.reports)) {
    const data = json(item.path); if (data.appVersion) data.appVersion = '1.1.8'
    if (data.observations) for (const name of Object.keys(data.observations)) if (typeof data.observations[name] === 'string') data.observations[name] = data.observations[name].replaceAll('1.1.7', '1.1.8')
    records[key] = { file: item.path.split('/').at(-1), data }
  }
  const rawRoot = 'docs/evidence/v118-native-office/run-38981834276/'
  for (const [key, file, level] of [
    ['searchBaseline', 'native-baseline.json', 'installed-tauri-ipc-and-disk'],
    ['searchUser', 'native-user.json', 'installed-webview-input-events-and-disk'],
    ['searchOffice', 'native-office.json', 'installed-webview-input-events-and-disk'],
  ]) {
    const data = json(rawRoot + file)
    Object.assign(data, { installed: true, appVersion: '1.1.8', runtimeBaseVersion: '1.1.8',
      sourceCommit: manifest.sourceCommit, productCommit: manifest.sourceCommit, installerSha256: nsis,
      harnessSourceCommit: data.harnessCommit, evidenceLevel: level })
    records[key] = { file: file.replace('native-', 'installed-v118-'), data }
  }
  const base = records.searchBaseline.data
  records.searchCompleteness = { file: 'installed-v118-workflow.json', data: { ...base,
    finalDraftAction: 'explicit-user-save-after-all-preservation-checks',
    checks: searchCompletenessChecks.map(id => ({ id, status: 'passed' })) } }
  const bytes = new Map()
  const update = () => {
    manifest.runtimeSmoke.reports = Object.fromEntries(Object.entries(records).map(([key, { file, data }]) => {
      const name = 'docs/evidence/v1-1-8-candidate-lifecycle/' + file, buffer = Buffer.from(JSON.stringify(data))
      bytes.set(name, buffer); return [key, { path: name, sha256: sha(buffer) }]
    }))
  }
  update(); return { manifest, records, update, read: file => bytes.get(file) }
}

test('v118 must retain every predecessor workflow and its own hash-bound installed report', () => {
  const f = fixture(); assert.doesNotThrow(() => assertInstalledReleaseRuntime(f.manifest, f.read))
  for (const key of ['workflow', 'experience', 'fileManagement', 'foundation', 'foundationExtended', 'foundationHardening', 'moveContinuity', 'saveHistory', 'searchCompleteness', 'searchBaseline', 'searchUser', 'searchOffice']) {
    const broken = fixture(); delete broken.records[key]; broken.update()
    assert.throws(() => assertInstalledReleaseRuntime(broken.manifest, broken.read), key)
  }
})

test('installed v118 rejects reused Debug identity, source/installer drift and weakened user tasks', () => {
  const original = fixture()
  const validate = f => validateInstalledSearchCompleteness(f.records.searchCompleteness.data, f.records.searchBaseline.data, f.records.searchUser.data, f.records.searchOffice.data, f.manifest)
  assert.doesNotThrow(() => validate(original))
  for (const mutate of [
    f => f.records.searchCompleteness.data.checks.pop(), f => f.records.searchUser.data.sourceCommit = '0'.repeat(40),
    f => delete f.records.searchCompleteness.data.finalDraftAction,
    f => f.records.searchOffice.data.installerSha256 = '0'.repeat(64), f => f.records.searchBaseline.data.harnessSourceCommit = '0'.repeat(40),
    f => f.records.searchUser.data.evidenceLevel = 'actual-wry-webview-input-events-generated-disk-not-installed',
    f => f.records.searchBaseline.data.generatedFixture.unregisteredEntries = 100,
    f => f.records.searchUser.data.footerRecovery.visibleWithoutRecoveryScroll = false,
    f => f.records.searchUser.data.draftChecks.pop(), f => f.records.searchUser.data.sourceFiles[0].after = '0'.repeat(64),
    f => f.records.searchOffice.data.inputTrace[0].trusted = false,
    f => f.records.searchOffice.data.observations.workbook[1].matchingFiles = 1,
    f => f.records.searchOffice.data.observations.pptxNotes.locatorToken = f.records.searchOffice.data.observations.pptxObject.locatorToken,
  ]) { const f = fixture(); mutate(f); assert.throws(() => validate(f)) }
})

test('installed runtime identity refuses local, self-hosted, wrong version and missing provenance', () => {
  const env = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Windows',
    LONGEDIT_SEARCH_INSTALLED: '1', LONGEDIT_R5I_DISPOSABLE: '1', LONGEDIT_R5J_APP_VERSION: '1.1.8',
    LONGEDIT_R5J_SOURCE_COMMIT: 'a'.repeat(40), LONGEDIT_R5J_INSTALLER_SHA256: 'b'.repeat(64), GITHUB_SHA: 'c'.repeat(40),
    LONGEDIT_NATIVE_EXECUTABLE: 'C:/owned/install/tauri-app.exe', LONGEDIT_R5J_EXECUTABLE: 'C:/owned/install/tauri-app.exe', LONGEDIT_SEARCH_TARGET_ID: 'MAIN-001' }
  const identity = searchRuntimeIdentity(env)
  assert.equal(identity.installed, true)
  assert.equal(matchesSearchRuntimeTarget({ id: 'MAIN-001', url: 'http://tauri.localhost/#/settings' }, identity), true)
  assert.equal(matchesSearchRuntimeTarget({ id: 'EXTERNAL-001', url: 'http://tauri.localhost/#/mindmap?external=1' }, identity), false)
  assert.equal(matchesSearchRuntimeTarget({ id: 'MAIN-001', url: 'http://127.0.0.1:14200/#/settings' }, identity), false)
  assert.equal(matchesSearchRuntimeTarget({ id: 'MAIN-001', url: 'http://tauri.localhost/#/quick-note' }, identity), false)
  for (const changed of [{ RUNNER_ENVIRONMENT: 'self-hosted' }, { GITHUB_ACTIONS: '' }, { LONGEDIT_R5J_APP_VERSION: '1.1.7' }, { LONGEDIT_R5J_SOURCE_COMMIT: '' }, { LONGEDIT_R5J_INSTALLER_SHA256: '' }, { LONGEDIT_R5J_EXECUTABLE: 'C:/different.exe' }, { LONGEDIT_SEARCH_TARGET_ID: '' }]) assert.throws(() => searchRuntimeIdentity({ ...env, ...changed }))
})

test('all historical installed entry guards accept v118 without removing their tasks', () => {
  for (let n = 0; n <= 7; n++) {
    const source = fs.readFileSync(`scripts/lib/installed-v1-1-${n}-workflow.mjs`, 'utf8')
    assert.ok(source.includes("'1.1.8'"), 'v11' + n)
  }
  const smoke = fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs', 'utf8')
  assert.match(smoke, /runInstalledV118Workflow/)
  for (let n = 0; n <= 7; n++) assert.match(smoke, new RegExp('runInstalledV11' + n + 'Workflow'))
  const publisher = fs.readFileSync('.github/workflows/community-release-publish.yml', 'utf8')
  assert.match(publisher, /validateInstalledSearchCompleteness/)
  for (const file of ['v1-1-0-candidate-lifecycle.yml', 'v1-1-0-installer-review.yml']) {
    const workflow = parse(fs.readFileSync('.github/workflows/' + file, 'utf8'))
    assert.equal(workflow.on.workflow_dispatch.inputs.current_version.default, '1.1.8')
    assert.equal(workflow.on.workflow_dispatch.inputs.previous_version.default, '1.1.7')
  }
})

test('v118 candidate/public handoff never inherits an official update observation', () => {
  const development = { runtimeBaseVersion: '1.1.8', publicVersion: '1.1.7', publicTag: 'v1.1.7',
    publicTagCommit: '84cc1ad6d4697bb98c17e3396b9d8d65da41847a', developmentTargetVersion: '1.1.8' }
  const community = { appVersion: '1.1.8', targetRelease: { tag: 'v1.1.8' }, gates: { githubReleasePublished: false }, release: null,
    patchValidation: { previousPublicVersion: '1.1.7', managedUpdaterUpgradePath: '1.1.7-to-1.1.8-pending' } }
  assert.doesNotThrow(() => assertV121DevelopmentBoundary(development, community))
  assert.throws(() => assertV121DevelopmentBoundary({ ...development, developmentTargetVersion: '1.1.9' }, community))
  assert.throws(() => assertV121DevelopmentBoundary({ ...development, publicTagCommit: '0'.repeat(40) }, community))
  const released = { ...development, publicVersion: '1.1.8', publicTag: 'v1.1.8', publicTagCommit: 'a'.repeat(40), developmentTargetVersion: '1.1.9' }
  assert.doesNotThrow(() => assertV121DevelopmentBoundary(released, { ...community, gates: { githubReleasePublished: true }, release: { taggedCommit: released.publicTagCommit } }))
  const policy = { status: 'hosted-managed-update-passed' }, receipt = { managedUpdaterObservation: '1.0.20-to-1.0.21-passed' }
  assert.doesNotThrow(() => assertV121UpdaterStatus(policy, community, receipt))
  assert.throws(() => assertV121UpdaterStatus({ status: 'hosted-execution-pending' }, community, receipt))
  assert.throws(() => assertV121UpdaterStatus(policy, community, { managedUpdaterObservation: '1.0.20-to-1.0.21-pending' }))
  assert.throws(() => assertV121UpdaterStatus(policy, { ...community, patchValidation: { ...community.patchValidation, managedUpdaterUpgradePath: '1.1.6-to-1.1.7-pending' } }, receipt))
})
