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

function loadUpdater(openUrl = async () => {}, invoke = async () => {}) {
  const storage = new Map()
  const environment = vm.createContext({ exports: {}, localStorage: {
    getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value),
  }, require: name => {
    if (name === 'vue') return { reactive }
    if (name === '../../package.json') return { default: { version: '1.0.22' } }
    if (name === '@tauri-apps/api/app') return { getVersion: async () => '1.0.22' }
    if (name === '@tauri-apps/api/core') return { invoke }
    if (name === '@tauri-apps/plugin-opener') return { openUrl }
    if (name === './tauriRuntime') return { isTauriRuntime: () => true, listen: async () => () => {} }
    throw new Error(`Unexpected dependency: ${name}`)
  } })
  vm.runInContext(ts.transpileModule(fs.readFileSync('src/services/appUpdater.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, environment)
  return environment.exports
}

test('opening release notes preserves current, failed and available update observations', async () => {
  for (const status of ['up-to-date', 'error', 'available', 'ready', 'unsupported']) {
    const opened = []
    const updater = loadUpdater(async url => opened.push(url))
    Object.assign(updater.updaterState, { status, latestVersion: '1.0.22', error: status === 'error' ? 'Offline' : '' })
    const before = { ...updater.updaterState }
    assert.equal(await updater.openLatestRelease(), true)
    assert.deepEqual({ ...updater.updaterState }, before)
    assert.deepEqual(opened, [updater.LATEST_RELEASE_URL])
  }
})

test('slow release-page opening cannot overwrite a completed concurrent update check', async () => {
  let finishOpen
  const updater = loadUpdater(() => new Promise(resolve => { finishOpen = resolve }), async () => ({
    available: false, currentVersion: '1.0.22', latestVersion: '1.0.22',
    releaseUrl: 'https://github.com/Longyuyeee/Long_MarkDownReader/releases/latest',
    releaseNotes: '', publishedAt: null, installerName: '', installerSize: 0, installerSha256: '',
  }))
  await updater.initializeUpdater()
  const opening = updater.openLatestRelease()
  await updater.checkForUpdates(true)
  assert.equal(updater.updaterState.status, 'up-to-date')
  finishOpen()
  assert.equal(await opening, true)
  assert.equal(updater.updaterState.status, 'up-to-date')
})

test('release-page opening is blocked during installation and reports opener failure', async () => {
  let calls = 0
  const updater = loadUpdater(async () => { calls++; throw new Error('Browser unavailable') })
  updater.updaterState.status = 'installing'
  assert.equal(await updater.openLatestRelease(), false)
  assert.equal(calls, 0)
  updater.updaterState.status = 'ready'
  assert.equal(await updater.openLatestRelease(), false)
  assert.equal(updater.updaterState.status, 'error')
  assert.match(updater.updaterState.error, /Browser unavailable/)
})

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
