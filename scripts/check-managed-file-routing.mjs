import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const failures = []
const fail = message => failures.push(message)

const navigation = read('src/services/fileNavigation.ts')
for (const token of ['managedFileLocation', 'openManagedFile', "name: 'LibraryMode'", 'query: { ...query, path }']) {
  if (!navigation.includes(token)) fail(`managed file navigation contract is missing: ${token}`)
}

const managedIngressSources = [
  'src/App.vue',
  'src/components/FileRelationContext.vue',
  'src/components/GraphView.vue',
  'src/components/WorkspaceTabs.vue',
  'src/views/CanvasView.vue',
  'src/views/LibraryMode.vue',
  'src/views/MindMapView.vue',
  'src/views/PdfView.vue',
  'src/views/TableView.vue',
  'src/views/WorkbookView.vue',
  'src/views/WorkspaceHome.vue',
]

const embeddedRoutePattern = /name:\s*['"](?:TextEditor|JsonEditor|YamlEditor|XmlEditor|DrawioEditor|TomlEditor|LogViewer|DocxEditor|OdtReader|OdfReader|PptxReader|Canvas|Pdf|Table|Workbook|Diagram|MindMap)['"]/g
const embeddedPathPattern = /path:\s*['"]\/(?:text|json|yaml|xml|drawio|toml|log|docx|odt|odf-content|pptx|canvas|pdf|table|workbook|diagram|mindmap)['"]/g

for (const path of managedIngressSources) {
  const source = read(path)
  if (!source.includes('openManagedFile')) fail(`managed ingress does not use the shared navigator: ${path}`)
  const directRoutes = (source.match(embeddedRoutePattern) || []).filter(route => !(
    path === 'src/App.vue'
    && route === "name: 'TextEditor'"
    && source.includes("query: { path: cleanPath, external: '1'")
  ))
  if (directRoutes.length) fail(`managed ingress bypasses the library shell in ${path}: ${directRoutes.join(', ')}`)
  const directPaths = source.match(embeddedPathPattern) || []
  if (directPaths.length) fail(`managed ingress uses an embedded top-level path in ${path}: ${directPaths.join(', ')}`)
}

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log(`Managed file routing contract passed: ${managedIngressSources.length} ingress surfaces preserve the library shell.`)
