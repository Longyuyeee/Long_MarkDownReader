import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { expectedDevelopmentTarget } from './lib/development-target.mjs'

test('approved 1.2.0 transition retains 1.1.37 and preserves patch defaults', () => {
  assert.equal(expectedDevelopmentTarget('1.1.37', '1.2.0'), '1.2.0')
  assert.equal(expectedDevelopmentTarget('1.1.37', '1.1.38'), '1.1.38')
  assert.equal(expectedDevelopmentTarget('1.1.36', '1.2.0'), '1.1.37')
  assert.equal(expectedDevelopmentTarget('1.2.0', '1.2.1'), '1.2.1')
  assert.equal(expectedDevelopmentTarget('1.0.26', '1.1.0'), '1.1.0')
})
test('minor release keeps inherited installer workflows and current PDF resume checks enabled', () => {
  for (const file of ['.github/workflows/community-release-publish.yml', '.github/workflows/v1-1-0-installer-review.yml', 'scripts/capture-r5j-installed-artifact-smoke.mjs']) {
    const source = fs.readFileSync(file, 'utf8')
    assert.ok(source.includes('1.2.0'), file)
    assert.ok(source.includes('installed-v1137') || source.includes('runInstalledV1137') || (file.endsWith('installer-review.yml') && source.includes('capture-r5j-installed-artifact-smoke.mjs')), file)
  }
  const policy = JSON.parse(fs.readFileSync('shared/v1-community-release-policy.json', 'utf8'))
  assert.equal(policy.patchValidation.previousPublicVersion, JSON.parse(fs.readFileSync('package.json','utf8')).version === '1.2.0' ? '1.1.37' : JSON.parse(fs.readFileSync('package.json','utf8')).version === '1.2.1' ? '1.2.0' : JSON.parse(fs.readFileSync('package.json','utf8')).version === '1.2.2' ? '1.2.1' : '1.2.2')
})

test('actual-process restart accepts the approved minor release without admitting unreviewed versions', () => {
  const source = fs.readFileSync('scripts/capture-v119-installed-restart.mjs', 'utf8')
  const literal = source.match(/assert\.ok\((\[[^\]]+\])\.includes\(process\.env\.LONGEDIT_R5J_APP_VERSION\)\)/)?.[1]
  assert.ok(literal, 'Restart driver retains its explicit version boundary')
  const accepted = JSON.parse(literal.replaceAll("'", '"'))
  for (const version of ['1.1.9', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3']) assert.ok(accepted.includes(version), version)
  for (const version of ['1.1.8', '1.2.4', '2.0.0', '']) assert.ok(!accepted.includes(version), version)
  assert.ok(source.includes("assert.equal(version,process.env.LONGEDIT_R5J_APP_VERSION)"))
  assert.ok(source.includes('validateInstalledWorkSession(report,'))
  const lifecycle=fs.readFileSync('scripts/run-r5i-isolated-install-lifecycle.ps1','utf8')
  const guards=[...lifecycle.matchAll(/\$CurrentVersion -in @\(([^)]+)\)/g)].map(m=>m[1])
  assert.equal(guards.length,2,'both actual-process restart phases retain explicit approved versions')
  for(const guard of guards){assert.ok(guard.includes("'1.2.2'"));assert.ok(guard.includes("'1.2.3'"));assert.ok(!guard.includes("'1.2.4'"))}
  assert.ok(lifecycle.includes('Installed workflow is incomplete:'))
  assert.ok(lifecycle.includes('Installed process restart proof is missing:'))
})
