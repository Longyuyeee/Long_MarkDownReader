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
    && policy.currentStage === `${m3a6NodeComparison.selectedNextStage.id}-${m3a6NodeComparison.selectedNextStage.name}`,
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
