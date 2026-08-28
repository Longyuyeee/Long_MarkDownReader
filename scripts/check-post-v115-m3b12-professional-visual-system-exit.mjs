import fs from 'node:fs/promises'

const requireFact = (condition, message) => { if (!condition) throw new Error(message) }
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const policy = await readJson('shared/post-v115-m3b12-professional-visual-system-exit-policy.json')
const predecessor = await readJson('shared/post-v115-m3b11-restrained-node-status-rings-policy.json')
requireFact(policy.stage === 'M3B-12' && predecessor.selectedNextStage.id === policy.stage && !policy.releaseCandidate, 'M3B-12 stage chain drifted')
requireFact(policy.requiredStages.join(',') === 'M3B-1,M3B-2,M3B-3,M3B-4,M3B-5,M3B-6,M3B-7,M3B-8,M3B-9,M3B-10,M3B-11', 'M3B exit coverage drifted')
requireFact(policy.exitDecision.m3bComplete && policy.exitDecision.m3cRemainsIndependent && policy.selectedNextStage.id === 'M3C-0', 'M3B exit decision drifted')

const stageEvidence = [
  ['M3B-1', 'docs/evidence/post-v115-m3b1-semantic-zoom-community-overview/desktop-dark.json'],
  ['M3B-2', 'docs/evidence/post-v115-m3b2-community-contours-semantic-hierarchy/desktop-dark.json'],
  ['M3B-4', 'docs/evidence/post-v115-m3b4-curved-parallel-relations-static-path-labels/desktop-dark.json'],
  ['M3B-5', 'docs/evidence/post-v115-m3b5-selected-path-direction-motion-reduced-motion/desktop-dark-reduced.json'],
  ['M3B-6', 'docs/evidence/post-v115-m3b6-navigation-camera-selection/desktop.json'],
  ['M3B-7', 'docs/evidence/post-v115-m3b7-fit-selection-reduced-motion-focus/desktop-dark-reduced.json'],
  ['M3B-8', 'docs/evidence/post-v115-m3b8-remaining-navigation-selection/desktop.json'],
  ['M3B-9', 'docs/evidence/post-v115-m3b9-bounded-semantic-minimap/desktop-dark-reduced.json'],
  ['M3B-10', 'docs/evidence/post-v115-m3b10-remaining-professional-visual-selection/desktop.json'],
  ['M3B-11', 'docs/evidence/post-v115-m3b11-restrained-node-status-rings/desktop-dark-reduced.json'],
]
for (const [stage, file] of stageEvidence) {
  const evidence = await readJson(file)
  requireFact(evidence.stage === stage, `${stage} evidence identity drifted`)
  requireFact(evidence.actual?.runtimeErrors === 0 && evidence.actual?.sourceFilesUnchanged && evidence.actual?.returnedToLibrary, `${stage} desktop safety evidence failed`)
}

let evidenceCount = 0
for (const session of policy.requiredSessions) {
  const file = `docs/evidence/post-v115-m3b12-professional-visual-system-exit/desktop-${session.theme}-${session.motion}.json`
  let desktop
  try { desktop = await readJson(file) } catch { continue }
  evidenceCount += 1
  const actual = desktop.actual
  const flow = actual.visualSystemExit
  requireFact(desktop.stage === 'M3B-12' && actual.theme === session.theme && actual.motion === session.motion, `M3B-12 session identity drifted: ${session.theme}/${session.motion}`)
  requireFact(actual.runtimeErrors === 0 && actual.sourceFilesUnchanged && actual.returnedToLibrary, `M3B-12 runtime or source safety drifted: ${session.theme}/${session.motion}`)
  requireFact(flow.legend.objectTypeCount === 11 && flow.legend.relationTypeCount === 6 && flow.legend.detailsClosed, `M3B-12 semantic legend drifted: ${session.theme}/${session.motion}`)
  requireFact(flow.viewports.length === 3 && flow.viewports.every(item => item.fits && item.canvasVisible && item.legendVisible && item.minimapVisible && item.controlsReachable && !item.overlayOverlap), `M3B-12 responsive overlay system drifted: ${session.theme}/${session.motion}`)
  requireFact(flow.hierarchy.near.ringCount > 0 && flow.hierarchy.near.parallelRouteCount >= 2 && flow.hierarchy.middle.contourCount > 0 && flow.hierarchy.middle.ringCount > 0 && flow.hierarchy.far.overviewCount > 0 && flow.hierarchy.far.ringCount === 0 && !flow.hierarchy.far.minimapOverlap, `M3B-12 semantic hierarchy drifted: ${session.theme}/${session.motion}`)
  requireFact(flow.community.enteredNodeCount > 0 && flow.community.returned, `M3B-12 community round trip drifted: ${session.theme}/${session.motion}`)
  requireFact(flow.path.evidenceEdgeCount === 3 && flow.path.labelCount === 3 && flow.path.parallelRouteCount === 0 && flow.path.ringCount === 0 && flow.path.viewports.every(item => item.fits && item.cameraSafe && item.panelInBounds && !item.minimapOverlap), `M3B-12 path visual system drifted: ${session.theme}/${session.motion}`)
  const expectReduced = session.motion === 'reduced'
  requireFact(flow.path.motion.reduced === expectReduced && (expectReduced ? !flow.path.motion.phaseChanged && !flow.path.motion.framesAdvanced : flow.path.motion.phaseChanged && flow.path.motion.framesAdvanced), `M3B-12 motion contract drifted: ${session.theme}/${session.motion}`)
  requireFact(['completed', 'reduced'].includes(flow.focus.state) && flow.focus.reason === 'node-focus' && flow.focus.selectedCount === 1 && flow.focus.inSafeViewport, `M3B-12 bounded focus drifted: ${session.theme}/${session.motion}`)
  requireFact(['completed', 'reduced'].includes(flow.minimap.state) && flow.minimap.reason === 'minimap-keyboard' && flow.minimap.poseChanged && flow.minimap.viewportInBounds, `M3B-12 minimap integration drifted: ${session.theme}/${session.motion}`)
  requireFact(!flow.deferred.clusterCollapseExpandVisible && !flow.deferred.fullscreenVisible && !flow.deferred.governanceRingVisible, `M3B-12 deferred capability boundary drifted: ${session.theme}/${session.motion}`)
}
requireFact(evidenceCount === 0 || evidenceCount === policy.requiredSessions.length, 'M3B-12 desktop evidence is partial')
console.log(`M3B professional visual system exit accepted: M3B-1 through M3B-11 remain safe and the combined semantic hierarchy, path, camera, minimap, status and responsive flow passes${evidenceCount ? ` in ${evidenceCount} real Tauri sessions` : ''}; cluster collapse, fullscreen and M3C remain outside M3B.`)
