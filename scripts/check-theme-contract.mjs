import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [registry, app, settings, palette, styles, chart, graph] = await Promise.all([
  read('src/config/themePresets.ts'),
  read('src/App.vue'),
  read('src/views/SettingsView.vue'),
  read('src/components/CommandPalette.vue'),
  read('src/styles/themes.scss'),
  read('src/components/TableChartEditor.vue'),
  read('src/components/GraphView.vue'),
])

const failures = []
const requireMatch = (source, pattern, message) => { if (!pattern.test(source)) failures.push(message) }
const forbidMatch = (source, pattern, message) => { if (pattern.test(source)) failures.push(message) }

for (const presetId of ['professional-light', 'professional-dark', 'high-contrast']) {
  requireMatch(registry, new RegExp(`preset\\('${presetId}'`), `missing required preset ${presetId}`)
}
requireMatch(registry, /tone\('contrast',[\s\S]*?'high-contrast'/, 'high-contrast tone must declare its mode')
requireMatch(styles, /body\[data-theme="contrast"\]/, 'high-contrast CSS tokens are missing')
requireMatch(app, /getThemeTone\(/, 'App must consume the theme registry')
requireMatch(settings, /themeTones\.map\(/, 'Settings must derive tone options from the registry')
requireMatch(palette, /themePresets\.map\(/, 'Command palette must derive theme commands from the registry')
requireMatch(chart, /getActiveThemeTone\(/, 'Table charts must consume the registered chart palette')
requireMatch(graph, /getActiveThemeTone\(/, 'Knowledge graph must consume the registered theme tokens')
forbidMatch(app, /body\[data-theme="(?:white|green|blue|pink|dark)"\]\s*\{\s*--theme-bg/, 'App.vue must not redeclare theme color tokens')
forbidMatch(settings, /const\s+presetPreviewColors\s*=/, 'Settings must not keep a duplicate preview color map')
forbidMatch(palette, /action:\s*'theme-(?:white|dark|green|blue|pink)'/, 'Command palette must not keep manual theme commands')

if (failures.length) {
  console.error(`Theme contract check failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log('Theme contract check passed: one registry, 3 professional presets, shared editor/chart consumers.')
}
