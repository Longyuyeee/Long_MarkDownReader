import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = 'docs/evidence/v123-local-version-observation'
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))
const manifest = read('manifest.json')
assert.equal(manifest.sourceCommit, 'ca8a6a0db324fbab213a30131b6e7f21f099e0cd')
assert.equal(manifest.sourceUserContentIncluded, false)
assert.equal(manifest.appVersion, '1.0.22')
assert.equal(manifest.files.length, 12)
assert.equal(new Set(manifest.files.map(file => file.name)).size, 12)
assert.equal(manifest.screenshotsReviewed, 5)
assert.equal(manifest.files.filter(file => file.name.endsWith('.png')).length, 5)
for (const file of manifest.files) {
  assert.equal(path.basename(file.name), file.name)
  const bytes = fs.readFileSync(path.join(root, file.name))
  assert.equal(bytes.length, file.sizeBytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256)
}
const observation = name => {
  const data = read(`${name}.json`)
  assert.equal(data.window.title, 'LongEdit Version Audit - isolated')
  assert.match(data.window.app, /MarkDownReader\\src-tauri\\target\\debug\\tauri-app\.exe/i)
  return data.accessibility
}
for (const name of ['production-library', 'production-settings-before-release', 'production-settings-after-release', 'production-capabilities']) {
  const state = observation(name)
  assert.match(state.tree, /http:\/\/tauri\.localhost/)
  assert.match(state.document_text, /v1\.0\.22/)
  assert.doesNotMatch(state.document_text, /DEV|下一目标/)
}
for (const name of ['production-settings-before-release', 'production-settings-after-release']) {
  assert.match(observation(name).document_text, /当前已是最新版本 v1\.0\.22/)
  assert.doesNotMatch(observation(name).document_text, /下载并安装|发现 v/)
}
assert.match(observation('production-capabilities').document_text, /社区版 · 未签名/)
for (const name of ['development-library', 'development-settings', 'development-capabilities']) {
  const state = observation(name)
  assert.match(state.tree, /http:\/\/127\.0\.0\.1:9000/)
  assert.match(state.document_text, /v1\.0\.22/)
}
assert.match(observation('development-library').document_text, /DEV/)
assert.match(observation('development-capabilities').document_text, /开发模式 · 下一目标 v1\.0\.23/)
assert.match(observation('development-capabilities').document_text, /开发构建 · 社区版/)
console.log('Local version observation verified: 5 reviewed screenshots, 7 native accessibility observations; installer and failure-state acceptance remain pending.')
