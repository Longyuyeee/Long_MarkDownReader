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
const m4a3WorkbookOdpGraphCoverage = readJson('shared/post-v115-m4a3-workbook-odp-graph-location-coverage-policy.json')
const m4a4DocxOdsGraphSelection = readJson('shared/post-v115-m4a4-docx-ods-graph-granularity-selection-policy.json')
const m4a5DocxHeadingOdsSheetGraphCoverage = readJson('shared/post-v115-m4a5-docx-heading-ods-sheet-graph-location-coverage-policy.json')
const m4a6M1ObjectLocationExit = readJson('shared/post-v115-m4a6-m1-object-location-coverage-exit-policy.json')
const m4b0WorkspaceObjectActionSelection = readJson('shared/post-v115-m4b0-workspace-object-action-selection-policy.json')
const m4b1InternalTableTaskAction = readJson('shared/post-v115-m4b1-internal-table-boolean-task-workspace-action-policy.json')
const m4b2WorkspaceObjectActionExit = readJson('shared/post-v115-m4b2-workspace-object-action-exit-audit-policy.json')
const m4c0ControlledConversionSelection = readJson('shared/post-v115-m4c0-controlled-conversion-workflow-selection-policy.json')
const m4c1CsvTsvTableConversion = readJson('shared/post-v115-m4c1-csv-tsv-table-disclosure-and-auto-open-policy.json')
const m4c2OpmlCanvasProjection = readJson('shared/post-v115-m4c2-opml-canvas-projection-disclosure-policy.json')
const m4c3GraphOutputSelection = readJson('shared/post-v115-m4c3-graph-derived-output-disclosure-selection-policy.json')
const m4c4GraphProjectNote = readJson('shared/post-v115-m4c4-graph-project-note-disclosure-policy.json')
const m4c5GraphCanvas = readJson('shared/post-v115-m4c5-graph-canvas-eligibility-and-snapshot-disclosure-policy.json')
const m4c6ControlledConversionExit = readJson('shared/post-v115-m4c6-controlled-conversion-exit-audit-policy.json')
const m4d0CleanupSelection = readJson('shared/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection-policy.json')
const m4d1BoundedCleanup = readJson('shared/post-v115-m4d1-bounded-generated-graph-export-artifact-cleanup-policy.json')
const m4d2CleanupExit = readJson('shared/post-v115-m4d2-temporary-artifact-and-evidence-cleanup-exit-audit-policy.json')
const m4e0CapabilityDecision = readJson('shared/post-v115-m4e0-capability-facts-residual-risks-and-version-decision-audit-policy.json')
const m4f0ReleaseFreezeEntry = readJson('shared/post-v115-m4f0-v1016-release-freeze-entry-audit-policy.json')
const m4f1AtomicVersionTransition = readJson('shared/post-v115-m4f1-v1016-atomic-version-transition-policy.json')
const m4f2CandidateQualityGate = readJson('shared/post-v115-m4f2-v1016-candidate-quality-gate-and-runtime-smoke-policy.json')
const m4f3HostedLifecycle = readJson('shared/post-v115-m4f3a-v1016-hosted-installer-lifecycle-handoff-policy.json')
const m4f4ReleaseReadiness = readJson('shared/post-v115-m4f4-v1016-final-artifact-manifest-release-readiness-policy.json')
const m4f5PublishedRelease = readJson('shared/post-v115-m4f5-v1016-published-release-policy.json')
const m4f6ManagedUpdater = readJson('shared/v116-managed-updater-lifecycle-policy.json')
const m5ScopeSelection = readJson('shared/post-v116-m5-0-v1017-scope-selection-policy.json')
const m5OdpProducerSelection = readJson('shared/post-v116-m5-1-odp-producer-selection-policy.json')
const m5OdpReliableCopy = readJson('shared/post-v116-m5-2-odp-simple-slide-copy-policy.json')
const m5OdpWorkspace = readJson('shared/post-v116-m5-3-odp-workspace-policy.json')
const m5ReleaseReadiness = readJson('shared/post-v116-m5-4-v1017-release-readiness-policy.json')
const m5CandidatePackaging = readJson('shared/post-v116-m5-5-v1017-candidate-packaging-policy.json')
const m5HostedLifecycle = readJson('shared/post-v116-m5-6-v1017-hosted-installer-lifecycle-policy.json')
const m5FinalReadiness = readJson('shared/post-v116-m5-7-v1017-final-artifact-manifest-release-readiness-policy.json')
const m5PublishedRelease = readJson('shared/post-v116-m5-8-v1017-published-release-policy.json')
const m5ManagedUpdater = readJson('shared/v117-managed-updater-lifecycle-policy.json')
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
const candidateRuntime = policy.runtimeBaseVersion !== policy.publicVersion
let tagIsAncestor = true
try { execFileSync('git', ['merge-base', '--is-ancestor', policy.publicTag, 'HEAD']) } catch { tagIsAncestor = false }

const checks = {
  policySchema: policy.schemaVersion === 1 && policy.channel === 'main-development',
  nextPatchTarget: policy.developmentTargetVersion === expectedTarget,
  runtimeFactsFrozen: pkg.version === policy.runtimeBaseVersion
    && tauri.version === policy.runtimeBaseVersion
    && matrix.appVersion === policy.runtimeBaseVersion,
  candidateMetadataFacts: community.appVersion === policy.runtimeBaseVersion
    && (candidateRuntime
      ? community.currentStatus.startsWith(`v${policy.runtimeBaseVersion}-community-release-`)
        && community.releaseCandidate === (community.currentStatus === `v${policy.runtimeBaseVersion}-community-release-ready-to-publish`)
        && community.gates?.githubReleasePublished === false
        && community.patchValidation?.previousPublicVersion === policy.publicVersion
        && community.release === null
      : community.currentStatus === `v${policy.runtimeBaseVersion}-community-release-published`
        && community.releaseCandidate === true
        && community.gates?.qualityGatePassed === true
        && community.gates?.localRuntimeSmokePassed === true
        && community.gates?.githubReleasePublished === true
        && community.release?.taggedCommit === policy.publicTagCommit),
  publicFactsFrozen: policy.publicTag === `v${policy.publicVersion}`
    && ['1.0.16', '1.0.17', '1.0.18', '1.0.19', '1.0.20', '1.0.21'].includes(policy.publicVersion),
  publicTagImmutable: tagCommit === policy.publicTagCommit,
  developmentAhead: !policy.requiresHeadAheadOfPublicTag || (tagIsAncestor && commitsAhead > 0),
  enterpriseNotReleaseCandidate: policy.releaseCandidate === false && matrix.releaseCandidate === false,
  binaryTransitionComplete: (candidateRuntime
    ? [`v${policy.runtimeBaseVersion}-quality-gate-pending`, `v${policy.runtimeBaseVersion}-candidate-packaged`, `v${policy.runtimeBaseVersion}-hosted-lifecycle-passed`, `v${policy.runtimeBaseVersion}-hosted-installer-lifecycle-passed`, `v${policy.runtimeBaseVersion}-release-ready`].includes(policy.binaryVersionTransition)
      && policy.runtimeBaseVersion === expectedTarget
    : [`v${policy.runtimeBaseVersion}-public-release-published`, `v${policy.runtimeBaseVersion}-release-and-managed-updater-closed`].includes(policy.binaryVersionTransition)
      && policy.runtimeBaseVersion === policy.publicVersion)
    && policy.developmentTargetVersion === expectedTarget,
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
    && m4a2ObjectGraphSelection.selectedNextStage.id === m4a3WorkbookOdpGraphCoverage.stage
    && m4a3WorkbookOdpGraphCoverage.predecessor === m4a2ObjectGraphSelection.stage
    && m4a3WorkbookOdpGraphCoverage.selectedNextStage.id === m4a4DocxOdsGraphSelection.stage
    && m4a4DocxOdsGraphSelection.predecessor === m4a3WorkbookOdpGraphCoverage.stage
    && m4a4DocxOdsGraphSelection.selectedNextStage.id === m4a5DocxHeadingOdsSheetGraphCoverage.stage
    && m4a5DocxHeadingOdsSheetGraphCoverage.predecessor === m4a4DocxOdsGraphSelection.stage
    && m4a5DocxHeadingOdsSheetGraphCoverage.selectedNextStage.id === m4a6M1ObjectLocationExit.stage
    && m4a6M1ObjectLocationExit.predecessor === m4a5DocxHeadingOdsSheetGraphCoverage.stage
    && m4a6M1ObjectLocationExit.selectedNextStage.id === m4b0WorkspaceObjectActionSelection.stage
    && m4b0WorkspaceObjectActionSelection.predecessor === m4a6M1ObjectLocationExit.stage
    && m4b0WorkspaceObjectActionSelection.selectedNextStage.id === m4b1InternalTableTaskAction.stage
    && m4b1InternalTableTaskAction.predecessor === m4b0WorkspaceObjectActionSelection.stage
    && m4b1InternalTableTaskAction.selectedNextStage.id === m4b2WorkspaceObjectActionExit.stage
    && m4b2WorkspaceObjectActionExit.predecessor === m4b1InternalTableTaskAction.stage
    && m4b2WorkspaceObjectActionExit.selectedNextStage.id === m4c0ControlledConversionSelection.stage
    && m4c0ControlledConversionSelection.predecessor === m4b2WorkspaceObjectActionExit.stage
    && m4c0ControlledConversionSelection.selectedNextStage.id === m4c1CsvTsvTableConversion.stage
    && m4c1CsvTsvTableConversion.predecessor === m4c0ControlledConversionSelection.stage
    && m4c1CsvTsvTableConversion.selectedNextStage.id === m4c2OpmlCanvasProjection.stage
    && m4c2OpmlCanvasProjection.predecessor === m4c1CsvTsvTableConversion.stage
    && m4c2OpmlCanvasProjection.selectedNextStage.id === m4c3GraphOutputSelection.stage
    && m4c3GraphOutputSelection.predecessor === m4c2OpmlCanvasProjection.stage
    && m4c3GraphOutputSelection.selection.id === m4c4GraphProjectNote.stage
    && m4c4GraphProjectNote.predecessor === m4c3GraphOutputSelection.stage
    && m4c4GraphProjectNote.selectedNextStage.id === m4c5GraphCanvas.stage
    && m4c5GraphCanvas.predecessor === m4c4GraphProjectNote.stage
    && m4c5GraphCanvas.selectedNextStage.id === m4c6ControlledConversionExit.stage
    && m4c6ControlledConversionExit.predecessor === m4c5GraphCanvas.stage
    && m4c6ControlledConversionExit.selectedNextStage.id === m4d0CleanupSelection.stage
    && m4d0CleanupSelection.predecessor === m4c6ControlledConversionExit.stage
    && m4d0CleanupSelection.selectedNextStage.id === m4d1BoundedCleanup.stage
    && m4d1BoundedCleanup.predecessor === m4d0CleanupSelection.stage
    && m4d1BoundedCleanup.selectedNextStage.id === m4d2CleanupExit.stage
    && m4d2CleanupExit.predecessor === m4d1BoundedCleanup.stage
    && m4d2CleanupExit.selectedNextStage.id === m4e0CapabilityDecision.stage
    && m4e0CapabilityDecision.predecessor === m4d2CleanupExit.stage
    && m4e0CapabilityDecision.selectedNextStage.id === m4f0ReleaseFreezeEntry.stage
    && m4f0ReleaseFreezeEntry.predecessor === m4e0CapabilityDecision.stage
    && m4f0ReleaseFreezeEntry.selectedNextStage.id === m4f1AtomicVersionTransition.stage
    && m4f1AtomicVersionTransition.predecessor === m4f0ReleaseFreezeEntry.stage
    && m4f1AtomicVersionTransition.selectedNextStage.id === m4f2CandidateQualityGate.stage
    && m4f2CandidateQualityGate.predecessor === m4f1AtomicVersionTransition.stage
    && m4f3HostedLifecycle.predecessor === m4f2CandidateQualityGate.stage
    && m4f4ReleaseReadiness.predecessor === m4f3HostedLifecycle.stage
    && m4f4ReleaseReadiness.selectedNextStage.id === m4f5PublishedRelease.stage
    && m4f5PublishedRelease.predecessor === m4f4ReleaseReadiness.stage
    && m4f5PublishedRelease.selectedNextStage.id === 'M4F-6'
    && m4f6ManagedUpdater.stage === 'V1.0.16-U1'
    && m4f6ManagedUpdater.status === 'hosted-managed-update-passed'
    && m4f6ManagedUpdater.nextAction === 'v1.0.16-release-and-managed-updater-closure-complete'
    && m5ScopeSelection.predecessor === m4f6ManagedUpdater.stage
    && m5ScopeSelection.status === 'scope-selected'
    && m5OdpProducerSelection.predecessor === m5ScopeSelection.stage
    && m5OdpProducerSelection.status === 'accepted'
    && m5OdpReliableCopy.predecessor === m5OdpProducerSelection.stage
    && m5OdpReliableCopy.status === 'accepted'
    && m5OdpWorkspace.predecessor === m5OdpReliableCopy.stage
    && m5OdpWorkspace.status === 'accepted'
    && m5ReleaseReadiness.predecessor === m5OdpWorkspace.stage
    && m5ReleaseReadiness.status === 'accepted'
    && (m5ManagedUpdater.status === 'hosted-managed-update-passed'
      ? /^M[678]-[0-9]+-/.test(policy.currentStage)
      : m5PublishedRelease.status === 'published-and-remote-assets-verified'
      ? policy.currentStage === `${m5PublishedRelease.selectedNextStage.id}-${m5PublishedRelease.selectedNextStage.name}`
      : m5FinalReadiness.status === 'accepted-ready-to-publish'
      ? policy.currentStage === `${m5FinalReadiness.selectedNextStage.id}-${m5FinalReadiness.selectedNextStage.name}`
      : m5HostedLifecycle.status === 'hosted-installer-lifecycle-passed-release-readiness-pending'
      ? policy.currentStage === 'M5-7-v1.0.17-final-artifact-manifest-and-release-readiness-audit'
      : m5CandidatePackaging.status === 'accepted'
        ? policy.currentStage === `${m5CandidatePackaging.selectedNextStage.id}-${m5CandidatePackaging.selectedNextStage.name}`
      : policy.currentStage === `${m5ReleaseReadiness.selectedNextStage.id}-${m5ReleaseReadiness.selectedNextStage.name}`),
  configConsumesPolicy: config.includes("development-version-policy.json")
    && config.includes('DEVELOPMENT_TARGET_VERSION')
    && config.includes('DEVELOPMENT_VERSION_LABEL'),
  mainUiIdentifiesDevelopment: library.includes('v{{ displayedAppVersion }}')
    && library.includes('class="version-channel"')
    && library.includes('候选准备线')
    && library.includes('当前公开版本')
    && library.includes('PUBLIC_RELEASE_VERSION'),
  capabilityUiIdentifiesDevelopment: capabilities.includes('DEVELOPMENT_TARGET_VERSION')
    && capabilities.includes('候选准备')
    && capabilities.includes('PUBLIC_RELEASE_VERSION'),
  auditDocumentsIdentity: audit.includes(`当前开发目标：\`${policy.developmentTargetVersion}\``)
    && audit.includes(`当前运行时版本：\`${policy.runtimeBaseVersion}\``)
    && audit.includes(`当前公开版本：\`${policy.publicVersion}\``),
}

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
const evidence = {
  expected: {
    developmentTargetVersion: expectedTarget,
    runtimeBaseVersion: policy.runtimeBaseVersion,
    publicTag: policy.publicTag,
    headAheadOfPublicTag: true,
    binaryVersionTransition: policy.binaryVersionTransition,
  },
  actual: { headCommit, tagCommit, commitsAhead, tagIsAncestor, checks },
}
if (failed.length) {
  console.error(JSON.stringify(evidence, null, 2))
  throw new Error(`Development version identity failed: ${failed.join(', ')}`)
}
console.log(JSON.stringify(evidence, null, 2))
