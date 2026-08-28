import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = file => fs.readFile(path.join(root, file), 'utf8')
const policy = JSON.parse(await read('shared/post-v115-m3a1-semantics-policy.json'))
const registry = JSON.parse(await read('shared/graph-semantics.json'))
const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const ids = entries => entries.map(item => item.id)
const unique = values => new Set(values).size === values.length
const hex = value => /^#[0-9a-f]{6}$/i.test(value)

requireFact(policy.stage === 'M3A-1' && policy.releaseCandidate === false, 'M3A-1 policy identity drifted')
requireFact(JSON.stringify(ids(registry.objectTypes).filter(id => policy.objectTypeIds.includes(id))) === JSON.stringify(policy.objectTypeIds), 'M3A-1 base object semantic order or coverage drifted')
requireFact(JSON.stringify(ids(registry.relationTypes)) === JSON.stringify(policy.relationTypeIds), 'relation semantic registry order or coverage drifted')
requireFact(unique(registry.objectTypes.map(item => item.order)) && unique(registry.relationTypes.map(item => item.order)), 'semantic order values must be unique')
requireFact(registry.objectTypes.every((item, index, entries) => index === 0 || entries[index - 1].order < item.order), 'object semantic order must be ascending')
requireFact(registry.relationTypes.every((item, index, entries) => index === 0 || entries[index - 1].order < item.order), 'relation semantic order must be ascending')
for (const item of registry.objectTypes) {
  requireFact(item.label && item.shortLabel && item.glyph.length === 1, `object labels/glyph missing: ${item.id}`)
  requireFact(['circle', 'square', 'diamond', 'hexagon'].includes(item.shape), `object shape invalid: ${item.id}`)
  requireFact(hex(item.color.light) && hex(item.color.dark), `object theme color invalid: ${item.id}`)
}
for (const item of registry.relationTypes) {
  requireFact(item.label && ['solid', 'dashed', 'dotted'].includes(item.line) && hex(item.color), `relation semantics invalid: ${item.id}`)
  requireFact(item.directed === !policy.undirectedRelationTypeIds.includes(item.id), `relation direction drifted: ${item.id}`)
}
requireFact(registry.fallback?.object?.glyph === '?' && registry.fallback?.object?.label, 'unknown object fallback missing')
requireFact(registry.fallback?.relation?.label && registry.fallback?.relation?.line === 'dotted', 'unknown relation fallback missing')

const graphView = await read('src/components/GraphView.vue')
const localGraph = await read('src/components/LocalGraph.vue')
const exportSource = await read('src/utils/graphWorkspace.ts')
const legend = await read('src/components/GraphSemanticLegend.vue')
const config = await read('src/config/graphSemantics.ts')
requireFact(graphView.includes('<GraphSemanticLegend') && graphView.includes('graphObjectSemantic') && graphView.includes('graphRelationSemantic'), 'global graph does not consume the shared semantics')
requireFact(localGraph.includes('graphSemanticColor') && localGraph.includes('graphRelationSemantic') && localGraph.includes("node.semantic.shape === 'diamond'") && localGraph.includes('isActiveThemeDark(store.theme)'), 'local graph does not consume shared shape, theme color and relation semantics')
requireFact(exportSource.includes('graphObjectSemantic') && exportSource.includes('graphRelationSemantic'), 'graph export does not consume the shared semantics')
requireFact(legend.includes('graph-object-legend') && legend.includes('graph-relation-legend') && legend.includes('data-directed'), 'user-visible semantic legend contract missing')
requireFact(config.includes("graph-semantics.json") && config.includes("id: 'unknown'"), 'semantic registry adapter or safe fallback missing')

const evidencePath = path.join(root, 'docs/evidence/post-v115-m3a1-semantics/desktop.json')
let desktop = null
try { desktop = JSON.parse(await fs.readFile(evidencePath, 'utf8')) } catch {}
if (desktop) {
  requireFact(desktop.stage === 'M3A-1' && desktop.actual?.runtimeErrors === 0, 'M3A-1 desktop identity or runtime errors drifted')
  requireFact(desktop.actual?.sourceFilesUnchanged === true && desktop.actual?.returnedToLibrary === true, 'M3A-1 changed source files or lost return path')
  requireFact(desktop.actual?.wide?.legendVisible === true && desktop.actual?.narrow?.legendVisible === true, 'semantic legend is not visible in both desktop widths')
  for (const id of policy.desktopFixture.requiredObjectTypes) requireFact(desktop.actual.wide.objectTypeIds.includes(id), `desktop object semantic missing: ${id}`)
  for (const id of policy.desktopFixture.requiredRelationTypes) requireFact(desktop.actual.wide.relationTypeIds.includes(id), `desktop relation semantic missing: ${id}`)
}

console.log(`M3A-1 semantic contract accepted: ${registry.objectTypes.length} object types, ${registry.relationTypes.length} relation types, shared consumers and safe fallbacks${desktop ? ', real desktop evidence' : ''}.`)
