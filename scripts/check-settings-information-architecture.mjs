import fs from 'node:fs'

const settings = fs.readFileSync('src/views/SettingsView.vue', 'utf8')
const failures = []
const requireText = (token, message) => { if (!settings.includes(token)) failures.push(message) }

for (const label of ['资料库', '编辑与保存', '外观', '格式与文件', '知识能力', '系统与更新', '隐私与诊断', 'AI']) {
  requireText(`label: '${label}'`, `设置分类缺失：${label}`)
}

for (const token of [
  'class="settings-navigation"',
  'activeCategoryMeta.description',
  "router.replace({ name: 'Settings', query: { category } })",
  'ref="settingsPanelRef"',
  "settingsPanelRef.value?.scrollTo({ top: 0, behavior: 'auto' })",
  'scrollbar-gutter: stable',
  'transform-origin: center top',
  'scale(1.002)',
  '@media (max-width: 900px)',
  'grid-auto-flow: column',
]) requireText(token, `设置分类导航合同缺失：${token}`)

for (const token of [
  'class="advanced-settings"',
  '高级：关系改善对比',
  '记录当前状态',
  '对比改善结果',
  '关系整理效果对比',
]) requireText(token, `知识能力用户文案缺失：${token}`)

for (const forbidden of ['知识网络匿名观察', '真实资料库改善观察']) {
  if (settings.includes(forbidden)) failures.push(`设置页残留内部审计术语：${forbidden}`)
}

for (const token of [
  'themeFilters',
  'filteredThemePresets',
  "{ id: 'light', label: '浅色' }",
  "{ id: 'dark', label: '深色' }",
  "{ id: 'eye-care', label: '护眼' }",
  "{ id: 'creative', label: '创意' }",
  "{ id: 'contrast', label: '高对比' }",
  'presets.findIndex(candidate =>',
]) requireText(token, `统一主题库合同缺失：${token}`)

for (const forbidden of ['专业与场景预设', '更多外观组合', 'themePresetGroups']) {
  if (settings.includes(forbidden)) failures.push(`设置页仍暴露旧主题分组：${forbidden}`)
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}

console.log('Settings information architecture check passed: 8 categories, user-facing knowledge tools, and one filtered theme library.')
