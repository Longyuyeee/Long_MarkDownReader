import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = 'docs/evidence/v123-fault-states'
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))
const manifest = read('manifest.json')
assert.equal(manifest.productCommit, 'ca8a6a0db324fbab213a30131b6e7f21f099e0cd')
assert.equal(manifest.harnessCommit, 'a744b66c69e1555ffc4e0c65f85d3eb52b9d33e6')
assert.equal(manifest.method, 'native UI actions with external API fault injection')
for (const key of ['sourceUserContentIncluded', 'installerExecuted', 'realNetworkFailure', 'realBrowserFailure']) assert.equal(manifest[key], false)
assert.equal(manifest.appVersion, '1.0.22')
assert.equal(manifest.simulatedLatestVersion, '1.0.23')
assert.equal(manifest.screenshotsReviewed, 5)
const scenarios = ['offline', 'recovered-current', 'available', 'opener-failure', 'opener-retry']
assert.deepEqual(manifest.files.map(file => file.name).sort(), scenarios.flatMap(name => [`${name}.json`, `${name}.png`]).sort())
for (const file of manifest.files) {
  const bytes = fs.readFileSync(path.join(root, file.name))
  assert.equal(bytes.length, file.sizeBytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256)
}
const observations = Object.fromEntries(scenarios.map(name => {
  const state = read(`${name}.json`)
  assert.equal(state.window.title, 'LongEdit Version Audit - isolated')
  assert.match(state.accessibility.tree, /http:\/\/127\.0\.0\.1:9000/)
  assert.match(state.accessibility.document_text, /当前版本 v1\.0\.22/)
  return [name, state.accessibility.document_text]
}))
assert.match(observations.offline, /更新失败：验收故障注入：网络不可用/)
assert.doesNotMatch(observations.offline, /下载并安装|当前已是最新/)
assert.match(observations['recovered-current'], /当前已是最新版本 v1\.0\.22/)
assert.doesNotMatch(observations['recovered-current'], /更新失败|下载并安装/)
for (const name of ['available', 'opener-failure', 'opener-retry']) {
  assert.match(observations[name], /发现 v1\.0\.23/)
  assert.match(observations[name], /验收模拟发布/)
  assert.match(observations[name], /发现新版本/)
  assert.match(observations[name], /发布详情/)
  assert.match(observations[name], /下载并安装/)
}
assert.match(observations['opener-failure'], /系统浏览器无法打开。更新状态未改变，可重试打开/)
assert.doesNotMatch(observations['opener-retry'], /无法打开发布详情|系统浏览器无法打开/)
console.log('Verified 5 native fault/recovery observations and original hashes; external responses were simulated, no installer acceptance claimed.')
