import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const settings = read('src/views/SettingsView.vue')
const capabilities = read('src/views/ReleaseCapabilitiesView.vue')
const failures = []

const requireText = (source, token, message) => {
  if (!source.includes(token)) failures.push(message)
}

for (const token of [
  "query: { from: 'settings', settingsFocus: 'format-capabilities' }",
  "route.query.focus === 'format-capabilities'",
  'formatCapabilityRow.value?.scrollIntoView',
]) requireText(settings, token, `设置页缺少格式能力返回定位契约：${token}`)

for (const token of [
  "route.query.from === 'settings'",
  "name: 'Settings'",
  "name: 'LibraryMode'",
]) requireText(capabilities, token, `格式能力页缺少来源感知返回契约：${token}`)

for (const token of [
  '隐私诊断包',
  '导出脱敏诊断信息，不包含文档正文、完整路径、API 密钥、缓存正文或凭据。',
  '导出诊断包',
  '隐私诊断包已导出',
  '导出隐私诊断包失败',
]) requireText(settings, token, `隐私诊断中文文案缺失：${token}`)

for (const forbidden of [
  'Privacy Diagnostic',
  'Export redacted diagnostics',
  'Privacy diagnostic exported',
  'Export privacy diagnostic failed',
]) {
  if (settings.includes(forbidden)) failures.push(`设置页残留英文隐私诊断文案：${forbidden}`)
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}

console.log('Settings navigation and privacy diagnostic localization check passed.')
