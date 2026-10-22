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
  assert.ok(['1.1.8','1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0'].includes(env.LONGEDIT_R5J_APP_VERSION))
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
