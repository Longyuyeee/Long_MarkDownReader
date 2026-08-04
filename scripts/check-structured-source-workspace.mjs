import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => {
  console.error(message)
  process.exit(1)
}
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label} token missing: ${token}`)
}

const scheduler = read('src/utils/structuredAnalysis.ts')
requireTokens(scheduler, 'Adaptive structured analysis', [
  'MEDIUM_SOURCE_CHARACTERS = 256 * 1024',
  'LARGE_SOURCE_CHARACTERS = 1024 * 1024',
  'STRUCTURED_ANALYSIS_BUSY_RETRY_MS = 160',
  'structuredAnalysisDelay',
  'return 900',
  'return 520',
  'return 280',
])

const workspaces = [
  ['src/views/YamlEditorView.vue', '文档结构与问题', 'analyze_yaml_source'],
  ['src/views/XmlEditorView.vue', '元素导航与问题', 'analyze_xml_source'],
  ['src/views/TomlEditorView.vue', '配置分区与问题', 'analyze_toml_source'],
]

for (const [path, taskLabel, analyzer] of workspaces) {
  const source = read(path)
  requireTokens(source, path, [
    taskLabel,
    '编辑不受影响',
    'structuredAnalysisDelay',
    'STRUCTURED_ANALYSIS_BUSY_RETRY_MS',
    'if (analysisPending.value)',
    analyzer,
    '...codeMirrorThemeExtensions',
    "EditorState.readOnly.of",
  ])
  if (/setTimeout\([^)]*=>[^]*?,\s*280\)/m.test(source)) fail(`${path} restored a fixed live-analysis delay.`)
}

const audit = read('docs/User_Experience_Closure_Audit_2026-08-04.md')
if (!/\| UX-31 \|[^\n]+\| 待复测 \|/.test(audit)) fail('UX-31 must remain pending installed-build retest.')

console.log('Structured source workspace contract passed: task-oriented panels, adaptive serialized analysis, navigation, diagnostics, and shared themes.')
