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
  assert.equal(env.LONGEDIT_R5J_APP_VERSION, '1.1.8')
  assert.match(env.LONGEDIT_R5J_SOURCE_COMMIT || '', /^[a-f0-9]{40}$/)
  assert.match(env.LONGEDIT_R5J_INSTALLER_SHA256 || '', /^[a-f0-9]{64}$/)
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/)
  assert.equal(env.LONGEDIT_NATIVE_EXECUTABLE, env.LONGEDIT_R5J_EXECUTABLE)
  assert.ok(env.LONGEDIT_NATIVE_EXECUTABLE, 'installed executable required')
  return { installed: true, productCommit: env.LONGEDIT_R5J_SOURCE_COMMIT, runtimeBaseVersion: '1.1.8',
    appVersion: '1.1.8', sourceCommit: env.LONGEDIT_R5J_SOURCE_COMMIT,
    installerSha256: env.LONGEDIT_R5J_INSTALLER_SHA256, harnessSourceCommit: env.GITHUB_SHA,
    endpoint: 'http://127.0.0.1:9343' }
}

export function matchesSearchRuntimeTarget(target, identity) {
  return !target.url.includes('quick-note') && (identity.installed
    ? /^(?:https?:\/\/tauri\.localhost|tauri:\/\/localhost)(?:\/|$)/.test(target.url)
    : target.url.startsWith(identity.urlPrefix))
}
