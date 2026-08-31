import fs from 'node:fs/promises'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const policy = await readJson('shared/post-v115-m3b6-navigation-camera-selection-policy.json')
const predecessor = await readJson('shared/post-v115-m3b5-selected-path-direction-motion-reduced-motion-policy.json')
requireFact(policy.stage === 'M3B-6' && predecessor.selectedNextStage.id === policy.stage && !policy.releaseCandidate, 'M3B-6 stage chain drifted')

const graphView = await fs.readFile('src/components/GraphView.vue', 'utf8')
for (const token of ['title="适合窗口"', 'const fitGraph = () =>', 'const nodes = visibleNodes.value', 'const centerOnNode = (node: GraphNode)', 'selectAndCenter', 'data-horizontal-wheel="always"']) requireFact(graphView.includes(token), `navigation baseline missing: ${token}`)
const successorImplemented = graphView.includes('data-testid="graph-fit-selection"')
if (successorImplemented) requireFact(graphView.includes('requestCameraPose') && graphView.includes('cameraMotionReduced'), 'M3B-7 successor camera contract is incomplete')
else requireFact(graphView.includes('viewX = width / 2') && graphView.includes('viewY = height / 2'), 'M3B-6 immediate focus baseline drifted')
const minimapImplemented = graphView.includes('data-testid="graph-minimap"')
if (minimapImplemented) requireFact(graphView.includes('graphMinimapViewportRect') && graphView.includes("requestCameraPose(target, 'minimap-click')"), 'M3B-9 successor minimap contract is incomplete')
const fullscreenImplemented = graphView.includes('data-testid="graph-fullscreen"')
if (fullscreenImplemented) requireFact(graphView.includes('container.requestFullscreen()') && graphView.includes("document.addEventListener('fullscreenchange'"), 'M6-1 successor fullscreen contract is incomplete')
else for (const absent of ['data-testid="graph-fullscreen"', 'requestFullscreen()']) requireFact(!graphView.includes(absent), `M3B-6 deferred-feature fact drifted: ${absent}`)
requireFact(graphView.includes("data-testid=\"graph-community-card\"") && graphView.includes('activeCommunityId.value = communityId') && graphView.includes('activeCommunityId.value = \'\''), 'community filter enter/return baseline drifted')

let evidence = null
try { evidence = await readJson('docs/evidence/post-v115-m3b6-navigation-camera-selection/desktop.json') } catch {}
if (evidence) {
  const actual = evidence.actual
  const baseline = actual.navigationBaseline
  requireFact(evidence.stage === 'M3B-6' && actual.runtimeErrors === 0 && actual.sourceFilesUnchanged && actual.returnedToLibrary, 'M3B-6 real desktop identity or safety drifted')
  requireFact(baseline?.viewports?.length === 3 && baseline.viewports.every(item => item.fits && item.controlsMaxScroll >= 0 && item.fitRect?.width > 0 && !item.minimapVisible && !item.fitSelectionVisible && !item.fullscreenVisible), 'M3B-6 viewport navigation facts drifted')
  const wide = baseline.viewports.find(item => item.width === 1280)
  const compact = baseline.viewports.find(item => item.width === 1000)
  const narrow = baseline.viewports.find(item => item.width === 720)
  requireFact(wide?.fitReachable && compact?.fitReachable && narrow?.controlsScrollable && !narrow.fitReachable && narrow.controlsScrollLeft < narrow.controlsMaxScroll, 'M3B-6 measured command reachability facts drifted')
  requireFact(baseline.nodeFocus.canvasChangedImmediately && !baseline.nodeFocus.stableAfterImmediateFocus, 'M3B-6 unbounded search focus baseline drifted')
  requireFact(baseline.community.enteredCommunityCount > 0 && baseline.community.enteredCommunityCount < 17 && baseline.community.fullGraphStats !== baseline.community.communityStats && baseline.community.returned && baseline.community.interactionKind === 'filtered-subgraph', 'M3B-6 community filter baseline drifted')
  requireFact(baseline.capabilities.fitAll && !baseline.capabilities.fitSelection && !baseline.capabilities.smoothFocus && !baseline.capabilities.minimap && !baseline.capabilities.clusterCollapseExpand && !baseline.capabilities.fullscreen, 'M3B-6 capability selection facts drifted')
}
console.log(`M3B-6 navigation selection accepted: fit-all and community filtering remain reliable, and the selected fit-selection/bounded-focus successor is ${successorImplemented ? 'implemented' : 'still pending'}${evidence ? ' with historical real Tauri three-viewport evidence' : ''}.`)
