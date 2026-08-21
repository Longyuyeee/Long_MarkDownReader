import { readFile } from 'node:fs/promises'
import fs from 'node:fs'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [registry, app, settings, palette, styles, chart, graph, configCommand] = await Promise.all([
  read('src/config/themePresets.ts'),
  read('src/App.vue'),
  read('src/views/SettingsView.vue'),
  read('src/components/CommandPalette.vue'),
  read('src/styles/themes.scss'),
  read('src/components/TableChartEditor.vue'),
  read('src/components/GraphView.vue'),
  read('src-tauri/src/commands/config.rs'),
])
const visualManifest = JSON.parse(await read('docs/evidence/t8-1b/audit-manifest.json'))

const failures = []
const requireMatch = (source, pattern, message) => { if (!pattern.test(source)) failures.push(message) }
const forbidMatch = (source, pattern, message) => { if (pattern.test(source)) failures.push(message) }

for (const presetId of ['professional-light', 'professional-dark', 'high-contrast', 'cloud-paper', 'forest-green', 'dark-neon', 'purple-dream']) {
  requireMatch(registry, new RegExp(`preset\\('${presetId}'`), `missing required preset ${presetId}`)
}
requireMatch(registry, /professionalThemePresets\.length !== 3 \|\| scenarioThemePresets\.length !== 4/, 'release tier counts must be validated')
requireMatch(registry, /export const themePresetGroups =/, 'theme preset groups are missing')
requireMatch(registry, /contrastRatio\(colors\.text, colors\.background\) < 4\.5/, 'release presets must enforce WCAG AA text contrast')
requireMatch(registry, /tone\('contrast',[\s\S]*?'high-contrast'/, 'high-contrast tone must declare its mode')
requireMatch(styles, /body\[data-theme="contrast"\]/, 'high-contrast CSS tokens are missing')
requireMatch(styles, /body\[data-theme="dark"\]\[data-style="neo"\][\s\S]*?--theme-shadow-hover:[\s\S]*?rgba\(var\(--theme-primary-rgb\), 0\.24\)/, 'dark neo hover shadow must use a bounded theme glow')
requireMatch(app, /getThemeTone\(/, 'App must consume the theme registry')
requireMatch(settings, /themeTones\.map\(/, 'Settings must derive tone options from the registry')
requireMatch(settings, /themeFilters/, 'Settings must expose one filterable theme library')
requireMatch(settings, /filteredThemePresets/, 'Settings must filter and de-duplicate visible theme presets')
requireMatch(palette, /themePresets\.map\(/, 'Command palette must derive theme commands from the registry')
requireMatch(app, /data-motion/, 'App must expose preset motion through semantic data attributes')
requireMatch(settings, /preset\.motionSpeed/, 'Settings must apply preset motion')
requireMatch(chart, /getActiveThemeTone\(/, 'Table charts must consume the registered chart palette')
requireMatch(graph, /getActiveThemeTone\(/, 'Knowledge graph must consume the registered theme tokens')
requireMatch(graph, /compactViewport = window\.matchMedia\('\(max-width: 900px\)'\)/, 'Knowledge graph must keep initial details out of compact canvases')
requireMatch(graph, /@media \(max-width: 900px\)[\s\S]*?\.graph-controls[\s\S]*?overflow-x: auto/, 'Knowledge graph compact toolbar contract is missing')
requireMatch(configCommand, /LONGEDIT_E2E_STYLE/, 'Tauri theme audit style isolation is missing')
requireMatch(configCommand, /LONGEDIT_E2E_MOTION/, 'Tauri theme audit motion isolation is missing')
requireMatch(configCommand, /if std::env::var_os\("LONGEDIT_E2E_LIBRARY"\)\.is_some\(\) \{\s*return Ok\(\(\)\);/, 'Tauri E2E config writes must remain disabled')
forbidMatch(app, /body\[data-theme="(?:white|green|blue|pink|dark)"\]\s*\{\s*--theme-bg/, 'App.vue must not redeclare theme color tokens')
forbidMatch(settings, /const\s+presetPreviewColors\s*=/, 'Settings must not keep a duplicate preview color map')
forbidMatch(palette, /action:\s*'theme-(?:white|dark|green|blue|pink)'/, 'Command palette must not keep manual theme commands')

const expectedVisualScenarios = {
  'cloud-paper': ['white', 'airy', 'reduced'],
  'forest-green': ['green', 'soft', 'calm'],
  'dark-neon': ['dark', 'neo', 'swift'],
  'purple-dream': ['purple', 'glass', 'expressive'],
}
if (visualManifest.schemaVersion !== 1 || visualManifest.environment !== 'Tauri Debug WebView2 via Chrome DevTools Protocol') {
  failures.push('T8-1B visual manifest header is invalid')
}
for (const [scenarioId, [theme, style, motion]] of Object.entries(expectedVisualScenarios)) {
  const scenario = visualManifest.scenarios.find(item => item.id === scenarioId)
  if (!scenario || scenario.files.length !== 3) {
    failures.push(`T8-1B visual scenario is incomplete: ${scenarioId}`)
    continue
  }
  if (scenario.finalState.theme !== theme || scenario.finalState.style !== style || scenario.finalState.motion !== motion) {
    failures.push(`T8-1B semantic state drift: ${scenarioId}`)
  }
  for (const file of scenario.files) {
    const evidenceUrl = new URL(`../docs/evidence/t8-1b/${file}`, import.meta.url)
    if (!fs.existsSync(evidenceUrl) || fs.statSync(evidenceUrl).size < 20_000) {
      failures.push(`T8-1B screenshot is missing or too small: ${file}`)
    }
  }
}

if (failures.length) {
  console.error(`Theme contract check failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log('Theme contract check passed: one registry, 3 core + 4 scenario presets, 12 Tauri visual proofs, one filtered theme library, shared editor/chart consumers.')
}
