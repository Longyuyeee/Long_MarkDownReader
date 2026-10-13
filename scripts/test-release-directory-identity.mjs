import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { test } from 'node:test'
import { sameDiskDirectory } from './lib/installed-v1-1-0-workflow.mjs'

test('extended Windows spelling still addresses the exact same physical directory', async () => {
  assert.equal(await sameDiskDirectory(process.cwd(), path.toNamespacedPath(process.cwd())), true)
})
test('a different existing directory never qualifies as the chosen destination', async () => {
  assert.equal(await sameDiskDirectory(process.cwd(), os.tmpdir()), false)
})
test('files and missing directories cannot pass a destination check', async () => {
  assert.equal(await sameDiskDirectory('package.json', 'package.json'), false)
  await assert.rejects(sameDiskDirectory(process.cwd(), 'nonexistent-release-directory-identity-fixture'))
})
