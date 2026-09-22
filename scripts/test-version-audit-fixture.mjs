import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'

const source = fs.readFileSync('scripts/fixtures/version-updater-bridge.ts', 'utf8')
function load({ dev = true, identifier = 'com.longyuye.mdreader.version-audit', check = 'current', open = 'failure', responseOk = true } = {}) {
  const calls = []
  const context = vm.createContext({ exports: {}, fetch: async () => ({ ok: responseOk, json: async () => ({ check, open }) }), require: name => {
    assert.equal(name, '@tauri-apps/api/core')
    return { invoke: async (command, args) => {
      calls.push({ command, args })
      if (command === 'plugin:app|identifier') return identifier
      if (command === 'plugin:app|version') return '1.0.22'
      return 'real backend forwarded'
    } }
  } })
  vm.runInContext(ts.transpileModule(source.replaceAll('import.meta.env.DEV', String(dev)), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return { bridge: context.exports, calls }
}
test('fixture refuses production mode and the real user application', async () => {
  for (const options of [{ dev: false }, { identifier: 'com.longyuye.mdreader' }]) {
    const { bridge } = load(options)
    await assert.rejects(bridge.invoke('check_community_update'), /isolated development application/)
    await assert.rejects(bridge.openUrl('https://example.com'), /isolated development application/)
  }
})
test('fixture cannot install under any scenario, including invalid config', async () => {
  for (const check of ['offline', 'available', 'current', 'invalid']) {
    const { bridge, calls } = load({ check })
    await assert.rejects(bridge.invoke('install_community_update'), /禁止执行安装/)
    assert.equal(calls.length, 0)
  }
})
test('only external results are injected; available update retains actual runtime version', async () => {
  const { bridge } = load({ check: 'available' })
  const info = await bridge.invoke('check_community_update')
  assert.equal(info.currentVersion, '1.0.22')
  assert.equal(info.latestVersion, '1.0.23')
  assert.equal(info.available, true)
  assert.match(info.releaseNotes, /验收模拟发布/)
})
test('offline and opener failures remain errors rather than empty successes', async () => {
  const { bridge } = load({ check: 'offline' })
  await assert.rejects(bridge.invoke('check_community_update'), /网络不可用/)
  await assert.rejects(bridge.openUrl('https://example.com'), /系统浏览器无法打开/)
})
test('invalid or missing scenario fails closed', async () => {
  for (const options of [{ check: 'invalid' }, { responseOk: false }]) {
    await assert.rejects(load(options).bridge.invoke('check_community_update'))
  }
  await assert.rejects(load({ open: 'invalid' }).bridge.openUrl('https://example.com'))
})
test('current and opener retry success are explicitly controllable', async () => {
  const { bridge } = load({ open: 'success' })
  const info = await bridge.invoke('check_community_update')
  assert.equal(info.available, false)
  assert.equal(info.latestVersion, info.currentVersion)
  await bridge.openUrl('https://example.com')
})
test('unrelated native calls retain their arguments and use the actual backend', async () => {
  const { bridge, calls } = load()
  const args = { file: 'synthetic.md' }
  assert.equal(await bridge.invoke('other_command', args), 'real backend forwarded')
  assert.deepEqual(calls, [{ command: 'other_command', args }])
})
test('normal product configuration never imports the opt-in fixture', () => {
  assert.doesNotMatch(fs.readFileSync('vite.config.ts', 'utf8'), /version-updater-bridge|vite.version-audit/)
  assert.doesNotMatch(fs.readFileSync('src/services/appUpdater.ts', 'utf8'), /version-updater-bridge|__version_audit/)
  const config = fs.readFileSync('scripts/vite.version-audit.config.ts', 'utf8')
  assert.match(config, /env.command !== 'serve'/)
  assert.match(config, /Version audit fixture cannot build production assets/)
})
