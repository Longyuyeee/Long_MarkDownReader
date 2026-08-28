import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = readJson('shared/development-version-policy.json')
const pkg = readJson('package.json')
const tauri = readJson('src-tauri/tauri.conf.json')
const matrix = readJson('shared/release-capability-matrix.json')
const community = readJson('shared/v1-community-release-policy.json')
const m1dc1Subtitle = readJson('shared/post-v115-m1dc1-subtitle-playback-policy.json')
const m1Closure = readJson('shared/post-v115-m1-closure-policy.json')
const m3Baseline = readJson('shared/post-v115-m3-baseline-policy.json')
const m3a1Semantics = readJson('shared/post-v115-m3a1-semantics-policy.json')
const m3a2NeighborFocus = readJson('shared/post-v115-m3a2-neighbor-focus-policy.json')
const m3a3ShortestPath = readJson('shared/post-v115-m3a3-shortest-path-policy.json')
const m3a4RelationEvidence = readJson('shared/post-v115-m3a4-relation-evidence-policy.json')
const m3a5Community = readJson('shared/post-v115-m3a5-community-policy.json')
const m3a6NodeComparison = readJson('shared/post-v115-m3a6-node-comparison-policy.json')
const m3a7NeighborPinningHistory = readJson('shared/post-v115-m3a7-neighbor-pinning-history-policy.json')
const m3a8SemanticExplorationExit = readJson('shared/post-v115-m3a8-semantic-exploration-exit-policy.json')
const m3b0ProfessionalVisualBaseline = readJson('shared/post-v115-m3b0-professional-visual-baseline-policy.json')
const m3b1SemanticZoomCommunityOverview = readJson('shared/post-v115-m3b1-semantic-zoom-community-overview-policy.json')
const m3b2CommunityContoursSemanticHierarchy = readJson('shared/post-v115-m3b2-community-contours-semantic-hierarchy-policy.json')
const m3b3PathRelationshipVisualSelection = readJson('shared/post-v115-m3b3-path-relationship-visual-selection-policy.json')
const m3b4CurvedParallelRelations = readJson('shared/post-v115-m3b4-curved-parallel-relations-static-path-labels-policy.json')
const m3b5SelectedPathMotion = readJson('shared/post-v115-m3b5-selected-path-direction-motion-reduced-motion-policy.json')
const m3b6NavigationCameraSelection = readJson('shared/post-v115-m3b6-navigation-camera-selection-policy.json')
const m3b7FitSelectionFocus = readJson('shared/post-v115-m3b7-fit-selection-reduced-motion-focus-policy.json')
const m3b8RemainingNavigationSelection = readJson('shared/post-v115-m3b8-remaining-navigation-selection-policy.json')
const m3b9BoundedSemanticMinimap = readJson('shared/post-v115-m3b9-bounded-semantic-minimap-policy.json')
const m3b10RemainingProfessionalVisualSelection = readJson('shared/post-v115-m3b10-remaining-professional-visual-selection-policy.json')
const m3b11RestrainedNodeStatusRings = readJson('shared/post-v115-m3b11-restrained-node-status-rings-policy.json')
const m3b12ProfessionalVisualSystemExit = readJson('shared/post-v115-m3b12-professional-visual-system-exit-policy.json')
const m3c0LargeGraphPerformanceBaseline = readJson('shared/post-v115-m3c0-large-graph-performance-baseline-selection-policy.json')
const m3c1SettledDirtyFrameLoop = readJson('shared/post-v115-m3c1-settled-dirty-frame-and-lifecycle-loop-policy.json')
const m3c2LargeGraphPhaseProfiling = readJson('shared/post-v115-m3c2-large-graph-main-thread-phase-profiling-selection-policy.json')
const m3c3WorkerBoundedLayout = readJson('shared/post-v115-m3c3-worker-backed-bounded-force-layout-kernel-policy.json')
const m3c4LargeGraphPerformanceExit = readJson('shared/post-v115-m3c4-large-graph-performance-exit-audit-policy.json')
const m4a1UnifiedObjectNavigation = readJson('shared/post-v115-m4a1-unified-object-navigation-policy.json')
const m4a2ObjectGraphSelection = readJson('shared/post-v115-m4a2-m1-object-graph-coverage-selection-policy.json')
const config = fs.readFileSync('src/config/releaseCapabilities.ts', 'utf8')
const library = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const capabilities = fs.readFileSync('src/views/ReleaseCapabilitiesView.vue', 'utf8')
const audit = fs.readFileSync('docs/Development_Alignment_and_Closure_Plan_2026-08-02.md', 'utf8')
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const [publicMajor, publicMinor, publicPatch] = policy.publicVersion.split('.').map(Number)
const expectedTarget = `${publicMajor}.${publicMinor}.${publicPatch + 1}`
const tagCommit = git('rev-list', '-n', '1', policy.publicTag)
const headCommit = git('rev-parse', 'HEAD')
const commitsAhead = Number(git('rev-list', '--count', `${policy.publicTag}..HEAD`))
let tagIsAncestor = true
try { execFileSync('git', ['merge-base', '--is-ancestor', policy.publicTag, 'HEAD']) } catch { tagIsAncestor = false }

const checks = {
  policySchema: policy.schemaVersion === 1 && policy.channel === 'main-development',
  nextPatchTarget: policy.developmentTargetVersion === expectedTarget,
  runtimeFactsFrozen: pkg.version === policy.runtimeBaseVersion
    && tauri.version === policy.runtimeBaseVersion
    && matrix.appVersion === policy.runtimeBaseVersion,
  publicFactsFrozen: community.appVersion === policy.publicVersion
    && community.gates?.githubReleasePublished === true
    && policy.publicTag === `v${policy.publicVersion}`,
  publicTagImmutable: tagCommit === policy.publicTagCommit,
  developmentAhead: !policy.requiresHeadAheadOfPublicTag || (tagIsAncestor && commitsAhead > 0),
  notReleaseCandidate: policy.releaseCandidate === false && matrix.releaseCandidate === false,
  binaryTransitionDeferred: policy.binaryVersionTransition === 'M4-release-freeze',
  currentStageAligned: m1dc1Subtitle.selectedNextStage === m1Closure.stage
    && m1Closure.selectedNextStage === 'M3-knowledge-graph-2.0-selection-audit'
    && m3Baseline.selectedNextStage.id === m3a1Semantics.stage
    && m3Baseline.selectedNextStage.name === 'stable-object-relation-semantics-and-legend'
    && m3a1Semantics.selectedNextStage.id === m3a2NeighborFocus.stage
    && m3a2NeighborFocus.selectedNextStage.id === m3a3ShortestPath.stage
    && m3a3ShortestPath.selectedNextStage.id === m3a4RelationEvidence.stage
    && m3a4RelationEvidence.selectedNextStage.id === m3a5Community.stage
    && m3a5Community.selectedNextStage.id === m3a6NodeComparison.stage
    && m3a6NodeComparison.selectedNextStage.id === m3a7NeighborPinningHistory.stage
    && m3a7NeighborPinningHistory.selectedNextStage.id === m3a8SemanticExplorationExit.stage
    && m3a8SemanticExplorationExit.selectedNextStage.id === m3b0ProfessionalVisualBaseline.stage
    && m3b0ProfessionalVisualBaseline.selectedNextStage.id === m3b1SemanticZoomCommunityOverview.stage
    && m3b1SemanticZoomCommunityOverview.selectedNextStage.id === m3b2CommunityContoursSemanticHierarchy.stage
    && m3b2CommunityContoursSemanticHierarchy.selectedNextStage.id === m3b3PathRelationshipVisualSelection.stage
    && m3b3PathRelationshipVisualSelection.selectedNextStage.id === m3b4CurvedParallelRelations.stage
    && m3b4CurvedParallelRelations.selectedNextStage.id === m3b5SelectedPathMotion.stage
    && m3b5SelectedPathMotion.selectedNextStage.id === m3b6NavigationCameraSelection.stage
    && m3b6NavigationCameraSelection.selectedNextStage.id === m3b7FitSelectionFocus.stage
    && m3b7FitSelectionFocus.selectedNextStage.id === m3b8RemainingNavigationSelection.stage
    && m3b8RemainingNavigationSelection.selectedNextStage.id === m3b9BoundedSemanticMinimap.stage
    && m3b9BoundedSemanticMinimap.selectedNextStage.id === m3b10RemainingProfessionalVisualSelection.stage
    && m3b10RemainingProfessionalVisualSelection.selectedNextStage.id === m3b11RestrainedNodeStatusRings.stage
    && m3b11RestrainedNodeStatusRings.selectedNextStage.id === m3b12ProfessionalVisualSystemExit.stage
    && m3b12ProfessionalVisualSystemExit.selectedNextStage.id === m3c0LargeGraphPerformanceBaseline.stage
    && m3c0LargeGraphPerformanceBaseline.selectedNextStage.id === m3c1SettledDirtyFrameLoop.stage
    && m3c1SettledDirtyFrameLoop.selectedNextStage.id === m3c2LargeGraphPhaseProfiling.stage
    && m3c2LargeGraphPhaseProfiling.selectedNextStage.id === m3c3WorkerBoundedLayout.stage
    && m3c3WorkerBoundedLayout.selectedNextStage.id === m3c4LargeGraphPerformanceExit.stage
    && m3c4LargeGraphPerformanceExit.selectedNextStage.id === 'M4-0'
    && m4a1UnifiedObjectNavigation.predecessor === 'M4-0'
    && m4a1UnifiedObjectNavigation.selectedNextStage.id === m4a2ObjectGraphSelection.stage
    && m4a2ObjectGraphSelection.predecessor === m4a1UnifiedObjectNavigation.stage
    && policy.currentStage === `${m4a2ObjectGraphSelection.selectedNextStage.id}-${m4a2ObjectGraphSelection.selectedNextStage.name}`,
  configConsumesPolicy: config.includes("development-version-policy.json")
    && config.includes('DEVELOPMENT_TARGET_VERSION')
    && config.includes('DEVELOPMENT_VERSION_LABEL'),
  mainUiIdentifiesDevelopment: library.includes('v{{ displayedAppVersion }}')
    && library.includes('class="version-channel"')
    && library.includes('运行时与当前公开版本'),
  capabilityUiIdentifiesDevelopment: capabilities.includes('DEVELOPMENT_TARGET_VERSION')
    && capabilities.includes('开发线 · 运行时'),
  auditDocumentsIdentity: audit.includes(`当前开发目标：\`${policy.developmentTargetVersion}\``)
    && audit.includes(`运行时与当前公开版本：\`${policy.runtimeBaseVersion}\``),
}

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
const evidence = {
  expected: {
    developmentTargetVersion: expectedTarget,
    runtimeBaseVersion: policy.publicVersion,
    publicTag: policy.publicTag,
    headAheadOfPublicTag: true,
    binaryVersionTransition: 'M4-release-freeze',
  },
  actual: { headCommit, tagCommit, commitsAhead, tagIsAncestor, checks },
}
if (failed.length) {
  console.error(JSON.stringify(evidence, null, 2))
  throw new Error(`Development version identity failed: ${failed.join(', ')}`)
}
console.log(JSON.stringify(evidence, null, 2))
