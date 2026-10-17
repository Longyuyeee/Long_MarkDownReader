import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { installedSearchTemporaryParent } from './lib/installed-search-fixture-path.mjs'

test('8.3 spelling is resolved through the filesystem before making any search fixture path', async () => {
  const short = String.raw`C:\Users\RUNNER~1\AppData\Local\Temp`, long = String.raw`C:\Users\runneradmin\AppData\Local\Temp`, calls = []
  const resolved = await installedSearchTemporaryParent(short, {
    realpath: async input => { calls.push(['resolve', input]); return long },
    sameDirectory: async (a, b) => { calls.push(['identity', a, b]); return true },
  })
  assert.deepEqual(resolved, { input: short, canonical: long, samePhysicalDirectory: true })
  assert.deepEqual(calls, [['resolve', short], ['identity', short, long]])
  assert.notEqual(resolved.canonical, resolved.input)
})

test('unknown or different physical parents fail closed without a string fallback', async () => {
  await assert.rejects(() => installedSearchTemporaryParent('missing', { realpath: async () => { throw Error('missing path') } }), /missing path/)
  await assert.rejects(() => installedSearchTemporaryParent('first', { realpath: async () => 'second', sameDirectory: async () => false }), /same physical directory/)
})

test('a real owned directory alias resolves correctly and all original bytes remain unchanged', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'longedit-v118-path-')), target = path.join(parent, '真实临时目录'), alias = path.join(parent, 'alias')
  try {
    await fs.mkdir(target); await fs.writeFile(path.join(target, 'marker.txt'), 'keep the exact fixture identity', { flag: 'wx' })
    await fs.symlink(target, alias, 'junction')
    const actual = await installedSearchTemporaryParent(alias)
    assert.equal(actual.canonical, await fs.realpath(target)); assert.equal(actual.samePhysicalDirectory, true)
    assert.equal(await fs.readFile(path.join(actual.canonical, 'marker.txt'), 'utf8'), 'keep the exact fixture identity')
  } finally {
    const resolvedParent = await fs.realpath(parent), resolvedTemp = await fs.realpath(os.tmpdir())
    assert.ok(resolvedParent.startsWith(resolvedTemp + path.sep) && path.basename(resolvedParent).startsWith('longedit-v118-path-'))
    await fs.rm(resolvedParent, { recursive: true })
  }
})
