import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasPendingTableSave, tableSaveKey, tryAcquireTableSave, waitForTableSave } from '../src/utils/tableSaveOwnership.ts'

test('table save ownership blocks another instance and readers until released', async () => {
  const key = tableSaveKey('library', 'tasks.csv', false)
  const release = tryAcquireTableSave(key)
  assert.ok(release); assert.equal(tryAcquireTableSave(key), undefined)
  let read = false
  const waiting = waitForTableSave(key).then(() => { read = true })
  await Promise.resolve(); assert.equal(read, false); assert.equal(hasPendingTableSave(key), true)
  release(); await waiting
  assert.equal(read, true); assert.equal(hasPendingTableSave(key), false)
})
test('old release cannot unlock a later owner and wait observes reacquisition', async () => {
  const key = tableSaveKey('library', 'reacquire.csv', false)
  const first = tryAcquireTableSave(key)
  let read = false
  const waiting = waitForTableSave(key).then(() => { read = true })
  first(); const second = tryAcquireTableSave(key); first()
  await Promise.resolve(); assert.equal(read, false); assert.equal(hasPendingTableSave(key), true)
  second(); await waiting; assert.equal(read, true)
})
test('managed roots are distinct while external identity does not depend on active library', () => {
  assert.notEqual(tableSaveKey('a', 'tasks.csv', false), tableSaveKey('b', 'tasks.csv', false))
  assert.equal(tableSaveKey('a', '/external/tasks.csv', true), tableSaveKey('b', '/external/tasks.csv', true))
  assert.notEqual(tableSaveKey('a', 'tasks.csv', false), tableSaveKey('a', 'tasks.csv', true))
})
