import assert from 'node:assert/strict'
import { assertHostedSearchAudit, nativeSearchProduct } from './v118-native-search-fixture.mjs'

// Separate the immutable development-program proof from installed evidence.
// Installed mode is enabled only by the disposable lifecycle orchestrator.
export function searchRuntimeIdentity(env = process.env) {
  assertHostedSearchAudit(env)
  if (env.LONGEDIT_SEARCH_INSTALLED !== '1') {
    assert.equal(env.LONGEDIT_NATIVE_PRODUCT_COMMIT, nativeSearchProduct)
    return { installed: false, productCommit: nativeSearchProduct, runtimeBaseVersion: '1.1.7',
      endpoint: 'http://127.0.0.1:9458', urlPrefix: 'http://127.0.0.1:14200/' }
  }
  assert.equal(env.LONGEDIT_R5I_DISPOSABLE, '1')
  assert.ok(['1.1.8','1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10'].includes(env.LONGEDIT_R5J_APP_VERSION))
  assert.match(env.LONGEDIT_R5J_SOURCE_COMMIT || '', /^[a-f0-9]{40}$/)
  assert.match(env.LONGEDIT_R5J_INSTALLER_SHA256 || '', /^[a-f0-9]{64}$/)
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/)
  assert.equal(env.LONGEDIT_NATIVE_EXECUTABLE, env.LONGEDIT_R5J_EXECUTABLE)
  assert.ok(env.LONGEDIT_NATIVE_EXECUTABLE, 'installed executable required')
  assert.match(env.LONGEDIT_SEARCH_TARGET_ID || '', /^[a-zA-Z0-9_-]+$/, 'the lifecycle must bind its already-verified main WebView target')
  return { installed: true, productCommit: env.LONGEDIT_R5J_SOURCE_COMMIT, runtimeBaseVersion: env.LONGEDIT_R5J_APP_VERSION,
    appVersion: env.LONGEDIT_R5J_APP_VERSION, sourceCommit: env.LONGEDIT_R5J_SOURCE_COMMIT,
    installerSha256: env.LONGEDIT_R5J_INSTALLER_SHA256, harnessSourceCommit: env.GITHUB_SHA,
    endpoint: 'http://127.0.0.1:9343', targetId: env.LONGEDIT_SEARCH_TARGET_ID }
}

export function matchesSearchRuntimeTarget(target, identity) {
  return (!identity.installed || target.id === identity.targetId) && !target.url.includes('quick-note') && (identity.installed
    ? /^(?:https?:\/\/tauri\.localhost|tauri:\/\/localhost)(?:\/|$)/.test(target.url)
    : target.url.startsWith(identity.urlPrefix))
}
