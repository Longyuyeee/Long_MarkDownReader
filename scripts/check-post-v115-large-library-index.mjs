import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const readText = file => fs.readFileSync(path.join(root, file), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(`[large-library-index] ${message}`)
}

const policy = readJson('shared/post-v115-large-library-index-policy.json')
const baseline = readJson('docs/evidence/post-v115-large-library-index/baseline-evidence.json')
const current = readJson('docs/evidence/post-v115-large-library-index/current-evidence.json')
const restart = readJson('docs/evidence/post-v115-large-library-index/current-restart-evidence.json')
const indexSource = readText('src-tauri/src/commands/index.rs')
const serviceSource = readText('src-tauri/src/services/knowledge_index.rs')
const graphSource = readText('src-tauri/src/commands/graph.rs')
const librarySource = readText('src/views/LibraryMode.vue')
const audit = readText('docs/Post_v1.0.15_Large_Library_Index_Search_Audit_2026-08-26.md')

const expected = policy.expectedBudgetsMs
const actual = current.actual
assert(policy.fixture.fileCount === 10_000 && policy.fixture.requiresPhysicalFiles, 'fixture policy must require 10,000 physical files')
assert(baseline.actual.initialRebuildMs > expected.initialRebuild, 'before-fix rebuild must preserve the measured failure')
assert(baseline.actual.indexedQueryMs > expected.indexedQuery, 'before-fix indexed query must preserve the measured failure')
assert(baseline.actual.singleFileRefreshMs > expected.singleFileIncrementalRefresh, 'before-fix refresh must preserve the measured failure')
assert(actual.firstOperableMs <= expected.libraryFirstOperable, `first operable ${actual.firstOperableMs} ms exceeds ${expected.libraryFirstOperable} ms`)
assert(actual.initialRebuildMs <= expected.initialRebuild, `initial rebuild ${actual.initialRebuildMs} ms exceeds ${expected.initialRebuild} ms`)
assert(actual.indexedQueryMs <= expected.indexedQuery, `indexed query ${actual.indexedQueryMs} ms exceeds ${expected.indexedQuery} ms`)
assert(actual.staleDetectionMs <= expected.staleDetection && actual.staleState === 'stale', 'stale detection failed')
assert(actual.fallbackQueryMs <= expected.fallbackQuery && actual.fallbackResultCount === 1, 'stale overlay query failed')
assert(actual.singleFileRefreshMs <= expected.singleFileIncrementalRefresh && actual.refreshedResultCount === 1, 'single-file refresh failed')
assert(actual.cancelSupported && actual.cancelledBuildState === 'cancelled', 'active build cancellation is unavailable')
assert(actual.cancelAcknowledgementMs <= expected.cancelAcknowledgement, 'cancel acknowledgement exceeded budget')
assert(actual.initialStatus.state === 'ready' && actual.initialStatus.sourceCount >= policy.fixture.fileCount, 'ready snapshot does not cover the physical fixture')
assert(actual.manifestSha256Before === actual.manifestSha256After, 'index operations changed the source manifest')
assert(actual.runtimeErrors === 0 && actual.responsive720, 'desktop runtime or responsive evidence failed')
assert(restart.actual.status.state === 'ready', 'restart did not recover the ready index')
assert(restart.actual.restartReadyQueryMs <= expected.restartReadyQuery && restart.actual.restartResultCount === 1, 'restart query failed')
assert(restart.actual.manifestSha256Before === restart.actual.manifestSha256After && restart.actual.runtimeErrors === 0, 'restart changed source bytes or raised runtime errors')

for (const [name, source, marker] of [
  ['cancel command', indexSource, 'cancel_knowledge_index'],
  ['incremental refresh', serviceSource, 'refresh_snapshot_incremental_for_paths'],
  ['filesystem watcher', serviceSource, 'ensure_watcher'],
  ['one-pass graph files', graphSource, 'build_graph_paths'],
  ['stop action', librarySource, '停止准备'],
]) assert(source.includes(marker), `${name} marker is missing`)

for (const marker of ['修正前实际', '修正后实际', 'M1B2A', 'releaseCandidate=false']) {
  assert(audit.includes(marker), `audit is missing ${marker}`)
}

console.log(`Large-library index audit passed: build ${actual.initialRebuildMs} ms, query ${actual.indexedQueryMs} ms, refresh ${actual.singleFileRefreshMs} ms, restart ${restart.actual.restartReadyQueryMs} ms.`)
