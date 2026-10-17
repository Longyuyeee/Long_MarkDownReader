// Validate historical immutable fixtures in memory; do not rewrite them.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { validateCommunityPublication } from './import-community-publication.mjs'
const root = 'docs/evidence/v1.1.7-release/', read = file => JSON.parse(fs.readFileSync(root + file, 'utf8').replace(/^\uFEFF/, ''))
function example() { return [read('artifact-manifest.json'), read('publication/workflow-run.json'), read('publication/published-api.json'), read('publication/public-download-verification.json'), read('publication/installer-build-receipt.json'), read('publication/expected-assets.json'), read('release-receipt.json').release.taggedCommit] }
test('publication intake accepts the exact successful remote download and installer receipts', () => {
  const receipt = validateCommunityPublication(...example())
  assert.equal(receipt.release.tag, 'v1.1.7'); assert.equal(receipt.assets.length, 3)
  assert.equal(receipt.managedUpdaterObservation, '1.1.6-to-1.1.7-pending')
})
test('publication intake rejects unfinished runs, wrong tags, sources, installer bytes and missing assets', () => {
  for (const change of [a => a[1].status = 'in_progress', a => a[1].conclusion = 'failure', a => a[2].draft = true,
    a => a[2].tag_name = 'v1.1.8', a => a[3].sourceCommit = '0'.repeat(40), a => a[3].runId = '1',
    a => a[3].assets[0].remoteDownloadVerified = false, a => a[2].assets[0].size++, a => a[4].artifacts[0].sha256 = '0'.repeat(64),
    a => a[5].pop(), a => a[6] = '0'.repeat(40)]) { const a = example(); change(a); assert.throws(() => validateCommunityPublication(...a)) }
})
