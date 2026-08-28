import fs from 'node:fs/promises'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const policy = await readJson('shared/post-v115-m3b8-remaining-navigation-selection-policy.json')
const predecessor = await readJson('shared/post-v115-m3b7-fit-selection-reduced-motion-focus-policy.json')
requireFact(policy.stage === 'M3B-8' && predecessor.selectedNextStage.id === policy.stage && !policy.releaseCandidate, 'M3B-8 stage chain drifted')
requireFact(policy.decision.selectedIncrement === 'bounded-semantic-minimap-and-viewport-navigation', 'M3B-8 selected increment drifted')

const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
for (const token of ['data-camera-pose', 'requestCameraPose', 'data-semantic-zoom-level', 'showCommunityOverview', 'activeCommunityId.value = communityId']) requireFact(graphView.includes(token), `M3B-8 prerequisite missing: ${token}`)
const minimapImplemented = graphView.includes('data-testid="graph-minimap"')
if (minimapImplemented) requireFact(graphView.includes('graphMinimapViewportRect') && graphView.includes('maximumPoints: 600'), 'M3B-9 successor minimap contract is incomplete')
for (const absent of ['data-testid="graph-fullscreen"', 'requestFullscreen()', 'data-testid="graph-cluster-collapse"']) requireFact(!graphView.includes(absent), `M3B-8 current capability fact drifted: ${absent}`)

const tiers = await Promise.all(policy.currentFacts.largeGraphBaselineTiers.map(tier => readJson(`docs/evidence/post-v115-m3-baseline/tier-${tier}.json`)))
requireFact(tiers.every(item => item.stage === 'M3-0' && item.actual.nodeCount === item.tier && item.actual.runtimeErrors === 0 && item.actual.sourceFilesUnchanged && item.actual.returnedToLibrary), 'real large-graph baseline safety drifted')
const tier100 = tiers.find(item => item.tier === 100).actual
const tier1000 = tiers.find(item => item.tier === 1000).actual
const tier5000 = tiers.find(item => item.tier === 5000).actual
requireFact(tier1000.layoutStableMs > tier100.layoutStableMs && tier5000.layoutStableMs > tier1000.layoutStableMs, 'large-graph layout scaling evidence drifted')
requireFact(tier5000.longestTaskMs > tier1000.longestTaskMs && tier5000.longestTaskMs >= 1000, '5000-node long-task evidence no longer supports bounded minimap rendering')

let desktop = null
try { desktop = await readJson('docs/evidence/post-v115-m3b8-remaining-navigation-selection/desktop.json') } catch {}
if (desktop) {
  const actual = desktop.actual
  const selection = actual.remainingNavigationSelection
  requireFact(desktop.stage === 'M3B-8' && actual.theme === 'dark' && actual.motion === 'reduced' && actual.runtimeErrors === 0, 'M3B-8 desktop identity or runtime safety drifted')
  requireFact(actual.sourceFilesUnchanged && actual.returnedToLibrary, 'M3B-8 changed source files or lost library return')
  requireFact(selection?.viewports?.length === 3 && selection.viewports.every(item => item.fits && item.canvasRect?.width > 0 && item.cameraPoseAvailable && !item.minimapVisible && !item.clusterCollapseExpandVisible && !item.fullscreenVisible), 'M3B-8 viewport capability evidence drifted')
  requireFact(!selection.viewports[0].cameraPoseInitiallyAvailable && selection.viewports[0].cameraPoseInitializedByFitAll && selection.viewports.slice(1).every(item => item.cameraPoseInitiallyAvailable), 'M3B-8 camera pose initialization evidence drifted')
  requireFact(selection.community.enteredCommunityCount > 1 && selection.community.enteredCommunityCount < 17 && selection.community.fullGraphStats !== selection.community.communityStats && selection.community.returned && selection.community.interactionKind === 'filtered-subgraph', 'M3B-8 community interaction evidence drifted')
  requireFact(selection.capabilities.cameraPose && selection.capabilities.semanticCommunityOverview && !selection.capabilities.minimap && !selection.capabilities.clusterCollapseExpand && !selection.capabilities.fullscreen, 'M3B-8 selection facts drifted')
}
console.log(`M3B-8 remaining navigation selection accepted: bounded semantic minimap selected from real 100/1000/5000-node evidence${desktop ? ' and real Tauri three-viewport evidence' : ''}; cluster collapse/expand, fullscreen and M3C remain deferred.`)
