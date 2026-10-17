import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { sameDiskDirectory } from './installed-v1-1-0-workflow.mjs'

// Windows TEMP may contain an 8.3 alias. Resolve it through the filesystem,
// never guess an account name or weaken an exact document-path assertion.
export async function installedSearchTemporaryParent(input, {
  realpath = fs.realpath, sameDirectory = sameDiskDirectory,
} = {}) {
  assert.equal(typeof input, 'string'); assert.ok(input.length)
  const canonical = await realpath(input)
  assert.equal(typeof canonical, 'string'); assert.ok(canonical.length)
  assert.equal(await sameDirectory(input, canonical), true, 'canonical temporary parent must be the same physical directory')
  return { input, canonical, samePhysicalDirectory: true }
}
