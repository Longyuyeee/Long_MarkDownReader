import fs from 'node:fs/promises'
import { findShortestGraphPath } from '../src/utils/graphPath.ts'
import { buildGraphPathEvidence } from '../src/utils/graphEvidence.ts'

const policy = JSON.parse(await fs.readFile('shared/post-v115-m3a4-relation-evidence-policy.json', 'utf8'))
const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const node = (id, objectType = 'markdown') => ({ id, title: id, path: `${id}.md`, size: 10, tags: [], directory: '', modifiedAt: 0, objectType, searchText: id })
const mentions = [
  { target: 'b', syntax: '[[b]]', context: 'first [[b]] context', line: 3, relationType: 'links-to' },
  { target: 'b', alias: 'B', syntax: '[[b|B]]', context: 'second B context', line: 9, relationType: 'links-to' },
]
const graph = {
  nodes: [node('a'), node('b'), node('c', 'pdf_annotation')],
  edges: [
    { source: 'a', target: 'b', relationType: 'links-to', directed: true, mentions },
    { source: 'b', target: 'c', relationType: 'annotates', directed: true, mentions: [] },
  ],
}
const forward = buildGraphPathEvidence(graph, findShortestGraphPath(graph, 'a', 'c'))
requireFact(forward.length === 2, 'path evidence omitted an edge')
requireFact(forward[0].mentions.length === 2 && forward[0].mentions[1].line === 9, 'all mentions were not preserved')
requireFact(forward[0].source.id === 'a' && forward[0].target.id === 'b' && !forward[0].traversalReversed, 'original direction drifted')
requireFact(forward[1].mentions.length === 0 && forward[1].source.id === 'b', 'structural evidence boundary drifted')
const reverse = buildGraphPathEvidence(graph, findShortestGraphPath(graph, 'c', 'a'))
requireFact(reverse.length === 2 && reverse.every(item => item.traversalReversed), 'reverse traversal must not rewrite fact direction')
requireFact(policy.stage === 'M3A-4' && policy.requiredEvidence.length === 6, 'M3A-4 policy drifted')

const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
for (const token of ['graph-path-evidence-list', 'graph-path-evidence-edge', 'graph-path-evidence-mention', 'graph-path-evidence-return', 'graph-path-structural-evidence', 'graph-path-structure-return']) requireFact(graphView.includes(token), `M3A-4 UI contract missing: ${token}`)
const library = await fs.readFile('src/views/LibraryMode.vue', 'utf8')
for (const token of ['relationLine', 'relationSyntax', 'relationLocator', 'workspace-relation-evidence-target']) requireFact(library.includes(token), `M3A-4 Markdown locator missing: ${token}`)

let desktop = null
try { desktop = JSON.parse(await fs.readFile('docs/evidence/post-v115-m3a4-relation-evidence/desktop.json', 'utf8')) } catch {}
if (desktop) {
  const actual = desktop.actual
  requireFact(desktop.stage === 'M3A-4' && actual.runtimeErrors === 0, 'M3A-4 desktop identity or runtime errors drifted')
  requireFact(actual.sourceFilesUnchanged && actual.returnedToLibrary, 'M3A-4 changed source files or lost library return')
  requireFact(actual.relationEvidence?.edgeCount === 3 && actual.relationEvidence?.mentionCount === 3 && actual.relationEvidence?.edges?.[0]?.mentionCount === 2, 'M3A-4 real path evidence is incomplete')
  requireFact(actual.relationEvidence?.allEdgesTypedAndDirected && actual.relationEvidence?.hasStructuralBoundary, 'M3A-4 type, direction, or structural boundary failed')
  requireFact(actual.relationEvidence?.sourceReturn?.line === '3' && actual.relationEvidence?.sourceReturn?.targetVisible, 'M3A-4 exact Markdown source return failed')
  requireFact(actual.relationEvidence?.wideFits && actual.relationEvidence?.narrowFits, 'M3A-4 evidence panel overflowed wide or narrow desktop')
}
console.log(`M3A-4 relation evidence accepted: all mentions survive, original direction is preserved, and empty structural evidence remains explicit${desktop ? ', with exact real Markdown source return' : ''}.`)
