import assert from 'node:assert/strict'
import { test } from 'node:test'
import { effectScope, ref, watch } from 'vue'
import { useWindowDraft, windowDraftCount, windowDraftActivity, recordWindowDraftActivity, beginWindowSave } from '../src/services/windowDrafts.ts'

function editor(initial = false) {
  const dirty = ref(initial)
  const scope = effectScope()
  scope.run(() => useWindowDraft(() => dirty.value))
  return { dirty, stop: () => scope.stop() }
}

test('clean registration, dirty transitions and disposal advance activity synchronously', () => {
  const before = windowDraftActivity.value
  const e = editor()
  try {
    assert.equal(windowDraftActivity.value, before + 1)
    assert.equal(windowDraftCount.value, 0)
    e.dirty.value = true
    assert.equal(windowDraftCount.value, 1)
    assert.equal(windowDraftActivity.value, before + 2)
    e.dirty.value = false
    assert.equal(windowDraftCount.value, 0)
    assert.equal(windowDraftActivity.value, before + 3)
  } finally { e.stop() }
  assert.equal(windowDraftActivity.value, before + 4)
})

test('second editor transitions remain observable while aggregate stays dirty', () => {
  const a = editor(true), b = editor()
  const reports = []
  const stop = watch([() => windowDraftCount.value > 0, windowDraftActivity], ([dirty]) => reports.push(dirty), { flush: 'sync' })
  try {
    b.dirty.value = true
    b.dirty.value = false
    assert.deepEqual(reports, [true, true])
    assert.equal(windowDraftCount.value, 1)
  } finally { stop(); b.stop(); a.stop() }
  assert.equal(windowDraftCount.value, 0)
})

test('unrelated activity does not retrigger subscriptions or form a feedback loop', () => {
  const a = editor(), b = editor(true)
  try {
    const before = windowDraftActivity.value
    recordWindowDraftActivity()
    assert.equal(windowDraftActivity.value, before + 1)
    a.dirty.value = false
    b.dirty.value = true
    assert.equal(windowDraftActivity.value, before + 1)
  } finally { b.stop(); a.stop() }
})

test('disposed editor cannot update registry and repeated disposal is inert', () => {
  const e = editor(true)
  e.stop()
  const before = windowDraftActivity.value
  e.dirty.value = false
  e.dirty.value = true
  e.stop()
  assert.equal(windowDraftCount.value, 0)
  assert.equal(windowDraftActivity.value, before)
})

test('disposing draft never releases an independent pending save', () => {
  const e = editor(true)
  const finish = beginWindowSave()
  try {
    assert.equal(windowDraftCount.value, 2)
    e.stop()
    assert.equal(windowDraftCount.value, 1)
  } finally { e.stop(); finish() }
  assert.equal(windowDraftCount.value, 0)
})
