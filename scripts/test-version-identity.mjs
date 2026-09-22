import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
import { computed, reactive } from 'vue'

const source = fs.readFileSync('src/utils/versionIdentity.ts', 'utf8')
const ctx = vm.createContext({ exports: {} })
vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, ctx)
const resolve = changes => ctx.exports.resolveVersionIdentity({ runtimeVersion: '1.0.22', buildVersion: '1.0.22', developmentBuild: false, developmentTarget: '1.0.23', updateStatus: 'ready', latestVersion: '', ...changes })

test('installed version never becomes the future development target', () => {
  const identity = resolve({})
  assert.equal(identity.version, '1.0.22')
  assert.equal(identity.developmentLabel, '')
  assert.ok(!identity.indicatorLabel.includes('1.0.23'))
  assert.equal(identity.remoteLabel, '尚未检查更新')
})
test('development mode identifies the actual runtime separately from the planned version', () => {
  const identity = resolve({ developmentBuild: true })
  assert.equal(identity.version, '1.0.22')
  assert.equal(identity.developmentLabel, '开发模式 · 下一目标 v1.0.23')
})
test('runtime wins over build fallback, including a genuine 1.0.0 runtime', () => {
  assert.equal(resolve({ runtimeVersion: '1.0.0' }).version, '1.0.0')
  assert.equal(resolve({ runtimeVersion: '1.0.24' }).version, '1.0.24')
  assert.equal(resolve({ runtimeVersion: '1.0.24-beta.1' }).version, '1.0.24-beta.1')
  for (const runtimeVersion of ['', 'unknown', 'latest']) assert.equal(resolve({ runtimeVersion }).version, '1.0.22')
})
test('available update is not represented as already installed', () => {
  for (const updateStatus of ['available', 'installing']) {
    const identity = resolve({ updateStatus, latestVersion: '1.0.23' })
    assert.equal(identity.version, '1.0.22')
    assert.equal(identity.remoteLabel, '可更新至 v1.0.23')
    assert.equal(identity.hasUpdate, true)
  }
})
test('failed or pending checks do not advertise stale latest data', () => {
  for (const updateStatus of ['ready', 'error', 'checking', 'unsupported']) {
    const identity = resolve({ updateStatus, latestVersion: '1.0.23' })
    assert.equal(identity.hasUpdate, false)
    assert.ok(!identity.remoteLabel.includes('1.0.23'))
  }
  assert.equal(resolve({ updateStatus: 'error' }).remoteLabel, '更新检查失败，最新版本未知')
})
test('only successful update observation presents a verified remote version', () => {
  assert.equal(resolve({ updateStatus: 'up-to-date', latestVersion: '1.0.22' }).remoteLabel, '已核对远端版本 v1.0.22')
  assert.equal(resolve({ updateStatus: 'available', latestVersion: 'invalid' }).hasUpdate, false)
})
test('all identity surfaces consume the common reactive runtime source', () => {
  for (const file of ['src/views/LibraryMode.vue', 'src/views/ReleaseCapabilitiesView.vue', 'src/components/UpdateSettingsRow.vue']) {
    const view = fs.readFileSync(file, 'utf8')
    assert.ok(view.includes('appVersionIdentity'))
    assert.ok(!view.includes('PUBLIC_RELEASE_VERSION'))
  }
  const config = fs.readFileSync('src/config/releaseCapabilities.ts', 'utf8')
  assert.ok(config.includes('DEVELOPMENT_CHANNEL_ACTIVE = import.meta.env.DEV'))
  assert.ok(!config.includes('社区版已发布'))
  const updater = fs.readFileSync('src/services/appUpdater.ts', 'utf8')
  assert.ok(updater.includes('currentVersion: appPackage.version'))
  assert.ok(updater.indexOf('updaterState.currentVersion = await getVersion()') < updater.indexOf('await initializeProgressListener()'))
})

test('actual shared computed identity updates when initialization and network results arrive', () => {
  const updaterState = reactive({ currentVersion: '1.0.22', status: 'ready', latestVersion: '' })
  const environment = vm.createContext({ exports: {}, require: name => {
    if (name === 'vue') return { computed }
    if (name === '../../package.json') return { default: { version: '1.0.22' } }
    if (name === '../config/releaseCapabilities') return { DEVELOPMENT_CHANNEL_ACTIVE: false, DEVELOPMENT_TARGET_VERSION: '1.0.23' }
    if (name === './appUpdater') return { updaterState }
    if (name === '../utils/versionIdentity') return ctx.exports
    throw new Error(`Unexpected dependency: ${name}`)
  } })
  vm.runInContext(ts.transpileModule(fs.readFileSync('src/services/appVersionIdentity.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, environment)
  const identity = environment.exports.appVersionIdentity
  assert.equal(identity.value.version, '1.0.22')
  updaterState.currentVersion = '1.0.21'
  assert.equal(identity.value.version, '1.0.21')
  updaterState.latestVersion = '1.0.22'; updaterState.status = 'available'
  assert.equal(identity.value.version, '1.0.21')
  assert.equal(identity.value.hasUpdate, true)
  updaterState.status = 'error'
  assert.equal(identity.value.hasUpdate, false)
  assert.ok(identity.value.remoteLabel.includes('未知'))
})
