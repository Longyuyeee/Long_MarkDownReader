import fs from 'node:fs/promises'
import { compareGraphNodes } from '../src/utils/graphComparison.ts'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const policy = JSON.parse(await fs.readFile('shared/post-v115-m3a6-node-comparison-policy.json', 'utf8'))
const node = (id, tags = [], objectType = 'markdown') => ({ id, title: id.toUpperCase(), path: `${id}.md`, size: 10, tags, directory: '', modifiedAt: 0, objectType, searchText: id })
const mention = (syntax, line) => ({ target: 'b', syntax, context: syntax, line, relationType: 'depends-on' })
const edge = (source, target, relationType = 'links-to', mentions = []) => ({ source, target, relationType, directed: true, mentions })
const graph = {
  nodes: [node('a', ['shared', 'left']), node('b', ['shared', 'right'], 'pdf'), node('c'), node('d'), node('e')],
  edges: [
    edge('a', 'c'), edge('b', 'c', 'supports'), edge('a', 'd'), edge('b', 'e'),
    edge('a', 'b', 'depends-on', [mention('[[B]]', 3), mention('[[B|alias]]', 4)]), edge('b', 'a', 'links-to'),
  ],
}
const result = compareGraphNodes(graph, 'a', 'b')
requireFact(result.status === 'compared', 'comparison fixture should be valid')
if (result.status === 'compared') {
  requireFact(result.commonNeighbors.map(item => item.id).join(',') === 'c', 'common neighbors drifted')
  requireFact(result.leftOnlyNeighbors.map(item => item.id).join(',') === 'd' && result.rightOnlyNeighbors.map(item => item.id).join(',') === 'e', 'exclusive neighbors drifted')
  requireFact(result.directRelations.length === 2 && result.directRelations.reduce((sum, item) => sum + item.mentions.length, 0) === 2, 'parallel direct relations or mentions were collapsed')
  requireFact(result.directRelations.some(item => item.edge.source === 'b' && item.edge.target === 'a'), 'original relation direction was not preserved')
  requireFact(result.sharedTags.join(',') === 'shared' && result.leftOnlyTags.join(',') === 'left' && result.rightOnlyTags.join(',') === 'right', 'tag comparison drifted')
  requireFact(!result.sameObjectType && result.left.neighborCount === 2 && result.right.neighborCount === 2, 'attribute or endpoint-exclusion semantics drifted')
}
requireFact(compareGraphNodes(graph, 'a', 'a').status === 'same', 'same-node comparison should be explicit')
requireFact(compareGraphNodes(graph, 'missing', 'b').status === 'invalid', 'missing-node comparison should be invalid')
const shuffled = { nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() }
const shuffledResult = compareGraphNodes(shuffled, 'a', 'b')
requireFact(shuffledResult.status === 'compared' && shuffledResult.commonNeighbors.map(item => item.id).join(',') === 'c', 'comparison depends on input ordering')
requireFact(policy.stage === 'M3A-6' && policy.selectedNextStage.id === 'M3A-7', 'M3A-6 policy or continuation drifted')

const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
for (const token of ['graph-comparison-entry', 'graph-comparison-panel', 'graph-comparison-run', 'graph-comparison-common', 'graph-comparison-left-only', 'graph-comparison-right-only', 'graph-comparison-direct-relation', 'graph-comparison-evidence-return']) requireFact(graphView.includes(token), `M3A-6 UI contract missing: ${token}`)
let desktop = null
try { desktop = JSON.parse(await fs.readFile('docs/evidence/post-v115-m3a6-node-comparison/desktop.json', 'utf8')) } catch {}
if (desktop) {
  const actual = desktop.actual
  const comparison = actual.nodeComparison
  requireFact(desktop.stage === 'M3A-6' && actual.runtimeErrors === 0, 'M3A-6 desktop identity or runtime errors drifted')
  requireFact(actual.sourceFilesUnchanged && actual.returnedToLibrary, 'M3A-6 changed source files or lost library return')
  requireFact(comparison?.commonCount === 1 && comparison?.leftOnlyCount === 1 && comparison?.rightOnlyCount === 1, 'M3A-6 real shared/exclusive-neighbor comparison drifted')
  requireFact(comparison?.directRelationCount === 1 && comparison?.directRelationTypes?.join(',') === 'supports', 'M3A-6 real direct relation evidence drifted')
  requireFact(comparison?.evidencePair?.directRelationCount === 2 && comparison?.evidencePair?.directRelationTypes?.join(',') === 'depends-on,links-to' && comparison?.evidencePair?.mentionCount === 3, 'M3A-6 real parallel relation mentions drifted')
  requireFact(comparison?.wideFits && comparison?.narrowFits && comparison?.sourceReturn?.line === '3' && comparison?.sourceReturn?.targetVisible, 'M3A-6 responsive panel or exact source return failed')
}
console.log(`M3A-6 node comparison accepted: independent fixture preserves common/exclusive neighbors, attributes, directions, parallel relations, and all mentions${desktop ? ', with real desktop shared-neighbor/evidence workflow' : ''}.`)
