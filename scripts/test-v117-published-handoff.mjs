import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { expectedDevelopmentTarget } from './lib/development-target.mjs'

// Synthetic historical handoff only, not installation evidence. Freeze its
// identity so later product versions do not change the scenario being checked.
const development = {
  currentStage: 'M8-43-v1.1.7-published',
  binaryVersionTransition: 'v1.1.7-public-release-published',
  publicVersion: '1.1.7', runtimeBaseVersion: '1.1.7',
  developmentTargetVersion: '1.1.8', releaseCandidate: false,
}
const checkers = [
  'scripts/check-post-v117-m6-0-v1018-scope-selection.mjs',
  'scripts/check-post-v117-m6-1-graph-fullscreen.mjs',
  'scripts/check-post-v117-m6-2-v1018-next-slice-selection.mjs',
  'scripts/check-post-v117-m6-3-v1018-release-readiness.mjs',
]
function run(file, changes = {}) {
  const errors = [], policy = { ...development, ...changes }
  const source = fs.readFileSync(file, 'utf8').replace(/^import[^\n]*\n/gm, '')
  vm.runInNewContext(source, {
    Buffer, crypto, path, execFileSync, expectedDevelopmentTarget,
    fs: { ...fs, readFileSync: (file, ...args) => file === 'shared/development-version-policy.json'
      ? JSON.stringify(policy) : fs.readFileSync(file, ...args) },
    console: { log() {}, error: message => errors.push(String(message)) },
    process: { exit: code => { throw new Error(`exit ${code}: ${errors.join('\n')}`) } },
  }, { filename: file })
}
for (const file of checkers) {
  test(`${path.basename(file)} retains historical facts and accepts only the real next target`, () => {
    assert.doesNotThrow(() => run(file, { publicVersion: '1.1.7', runtimeBaseVersion: '1.1.7', developmentTargetVersion: '1.1.8' }))
    assert.doesNotThrow(() => run(file, { publicVersion: '1.1.6', runtimeBaseVersion: '1.1.7', developmentTargetVersion: '1.1.7' }))
    for (const changes of [
      { developmentTargetVersion: '1.1.9' },
      { developmentTargetVersion: '1.1.7' },
      { releaseCandidate: true },
    ]) assert.throws(() => run(file, { publicVersion: '1.1.7', runtimeBaseVersion: '1.1.7', developmentTargetVersion: '1.1.8', ...changes }), /handoff drift/)
  })
}
