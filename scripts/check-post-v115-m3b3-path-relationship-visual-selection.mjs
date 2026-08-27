import fs from 'node:fs/promises'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))

const policy = await readJson('shared/post-v115-m3b3-path-relationship-visual-selection-policy.json')
const predecessor = await readJson('shared/post-v115-m3b2-community-contours-semantic-hierarchy-policy.json')
const m3aExit = await readJson('docs/evidence/post-v115-m3a8-semantic-exploration-exit/desktop.json')
const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
const store = await fs.readFile('src/store/app.ts', 'utf8')

requireFact(policy.stage === 'M3B-3' && !policy.releaseCandidate && predecessor.selectedNextStage.id === policy.stage, 'M3B-3 stage chain drifted')
requireFact(policy.selectedNextStage.id === 'M3B-4' && policy.decision.implementStaticReadabilityBeforeMotion, 'M3B-3 selection drifted')
requireFact(graphView.includes("if (viewMode.value === 'mindmap')") && graphView.includes('ctx.bezierCurveTo') && graphView.includes('ctx.lineTo(t.x || 0, t.y || 0)'), 'current straight-network / curved-mind-map fact drifted')
requireFact(graphView.includes('if (e.directed)') && graphView.includes('ctx.rotate(angle)'), 'existing directed arrowhead strength is missing')
requireFact(graphView.includes('const pathEdges = activeShortestPath.value ? new Set(activeShortestPath.value.edges) : null'), 'selected path no longer uses verified real edges')
requireFact(!graphView.includes('data-testid="graph-relation-label"') && !graphView.includes('store.motionSpeed'), 'relation label or graph reduced-motion baseline changed before implementation')
requireFact(graphView.includes('animationId = requestAnimationFrame(loop)') && store.includes("motionSpeed: 'calm' as ThemeMotionSpeed"), 'motion preference or continuous graph loop fact drifted')

const actual = m3aExit.actual
requireFact(m3aExit.stage === 'M3A-8' && actual.combinedFlow?.path?.edgeCount === 3 && actual.combinedFlow.path.evidenceEdgeCount === 3, 'real three-edge path/evidence baseline is unavailable')
requireFact(actual.runtimeErrors === 0 && actual.sourceFilesUnchanged && actual.returnedToLibrary && actual.combinedFlow.wideFits && actual.combinedFlow.narrowFits, 'latest real path workflow is unsafe or incomplete')
for (const theme of ['dark', 'white', 'contrast']) {
  const evidence = await readJson(`docs/evidence/post-v115-m3b2-community-contours-semantic-hierarchy/desktop-${theme}.json`)
  requireFact(evidence.actual.runtimeErrors === 0 && evidence.actual.sourceFilesUnchanged, `${theme} M3B semantic hierarchy regression evidence is unsafe`)
}

console.log('M3B-3 selection accepted: verified path evidence is retained, while straight/overlapping unlabeled network edges and unconsumed reduced motion select the static curved-route and path-label foundation before animation or navigation work.')
