import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { expectedDevelopmentTarget } from './lib/development-target.mjs'

test('approved 1.2.0 transition retains 1.1.37 and preserves patch defaults', () => {
  assert.equal(expectedDevelopmentTarget('1.1.37', '1.2.0'), '1.2.0')
  assert.equal(expectedDevelopmentTarget('1.1.37', '1.1.38'), '1.1.38')
  assert.equal(expectedDevelopmentTarget('1.1.36', '1.2.0'), '1.1.37')
  assert.equal(expectedDevelopmentTarget('1.2.0', '1.2.1'), '1.2.1')
  assert.equal(expectedDevelopmentTarget('1.2.45', '1.3.0'), '1.3.0')
  assert.equal(expectedDevelopmentTarget('1.2.44', '1.3.0'), '1.2.45')
  assert.equal(expectedDevelopmentTarget('1.0.26', '1.1.0'), '1.1.0')
})
test('minor release keeps inherited installer workflows and current PDF resume checks enabled', () => {
  for (const file of ['.github/workflows/community-release-publish.yml', '.github/workflows/v1-1-0-installer-review.yml', 'scripts/capture-r5j-installed-artifact-smoke.mjs']) {
    const source = fs.readFileSync(file, 'utf8')
    assert.ok(source.includes('1.2.0'), file)
    assert.ok(source.includes('installed-v1137') || source.includes('runInstalledV1137') || (file.endsWith('installer-review.yml') && source.includes('capture-r5j-installed-artifact-smoke.mjs')), file)
  }
  const policy = JSON.parse(fs.readFileSync('shared/v1-community-release-policy.json', 'utf8'))
  const current = JSON.parse(fs.readFileSync('package.json','utf8')).version
  assert.equal(policy.patchValidation.previousPublicVersion, current === '1.3.0' ? '1.2.45' : current === '1.3.1' ? '1.3.0' : current === '1.3.13' ? '1.3.12' : current === '1.3.12' ? '1.3.11' : current === '1.3.11' ? '1.3.10' : current === '1.3.10' ? '1.3.9' : current === '1.3.9' ? '1.3.8' : current === '1.3.8' ? '1.3.7' : current === '1.3.7' ? '1.3.6' : current === '1.3.6' ? '1.3.5' : current === '1.3.5' ? '1.3.4' : current === '1.3.4' ? '1.3.3' : current === '1.3.3' ? '1.3.2' : current === '1.3.2' ? '1.3.1' : current === '1.2.0' ? '1.1.37' : `1.2.${Number(current.split('.')[2])-1}`)
})

test('actual-process restart accepts the approved minor release without admitting unreviewed versions', () => {
  const source = fs.readFileSync('scripts/capture-v119-installed-restart.mjs', 'utf8')
  const literal = source.match(/assert\.ok\((\[[^\]]+\])\.includes\(process\.env\.LONGEDIT_R5J_APP_VERSION\)\)/)?.[1]
  assert.ok(literal, 'Restart driver retains its explicit version boundary')
  const accepted = JSON.parse(literal.replaceAll("'", '"'))
  for (const version of ['1.1.9', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10', '1.3.11', '1.3.12', '1.3.13']) assert.ok(accepted.includes(version), version)
  for (const version of ['1.1.8', '1.2.46', '1.3.14', '2.0.0', '']) assert.ok(!accepted.includes(version), version)
  assert.ok(source.includes("assert.equal(version,process.env.LONGEDIT_R5J_APP_VERSION)"))
  assert.ok(source.includes('validateInstalledWorkSession(report,'))
  const lifecycle=fs.readFileSync('scripts/run-r5i-isolated-install-lifecycle.ps1','utf8')
  const guards=[...lifecycle.matchAll(/\$CurrentVersion -in @\(([^)]+)\)/g)].map(m=>m[1])
  assert.equal(guards.length,2,'both actual-process restart phases retain explicit approved versions')
  for(const guard of guards){assert.ok(guard.includes("'1.2.2'"));assert.ok(guard.includes("'1.2.3'"));assert.ok(guard.includes("'1.2.4'"));assert.ok(guard.includes("'1.2.5'"));assert.ok(guard.includes("'1.2.6'"));assert.ok(guard.includes("'1.2.7'"));assert.ok(guard.includes("'1.2.8'"));assert.ok(guard.includes("'1.2.9'"));assert.ok(guard.includes("'1.2.10'"));assert.ok(guard.includes("'1.2.11'"));assert.ok(guard.includes("'1.2.12'"));assert.ok(guard.includes("'1.2.13'"));assert.ok(guard.includes("'1.2.14'"));assert.ok(guard.includes("'1.2.15'"));assert.ok(guard.includes("'1.2.16'"));assert.ok(guard.includes("'1.2.17'"));assert.ok(guard.includes("'1.2.18'"));assert.ok(guard.includes("'1.2.19'"));assert.ok(guard.includes("'1.2.20'"));assert.ok(guard.includes("'1.2.21'"));assert.ok(guard.includes("'1.2.22'"));assert.ok(guard.includes("'1.2.23'"));assert.ok(guard.includes("'1.2.24'"));assert.ok(guard.includes("'1.2.25'"));assert.ok(guard.includes("'1.2.26'"));assert.ok(guard.includes("'1.2.27'"));assert.ok(guard.includes("'1.2.28'"));assert.ok(guard.includes("'1.2.29'"));assert.ok(guard.includes("'1.2.30'"));assert.ok(guard.includes("'1.2.31'"));assert.ok(guard.includes("'1.2.32'"));assert.ok(guard.includes("'1.2.34'"));assert.ok(guard.includes("'1.2.35'"));assert.ok(guard.includes("'1.2.36'"));assert.ok(guard.includes("'1.2.37'"));assert.ok(guard.includes("'1.2.38'"));assert.ok(guard.includes("'1.2.39'"));assert.ok(guard.includes("'1.2.40'"));assert.ok(guard.includes("'1.2.41'"));assert.ok(guard.includes("'1.2.42'"));assert.ok(guard.includes("'1.2.43'"));assert.ok(guard.includes("'1.2.44'"));assert.ok(guard.includes("'1.2.45'"));assert.ok(!guard.includes("'1.2.46'"))}
  assert.ok(lifecycle.includes('Installed workflow is incomplete:'))
  assert.ok(lifecycle.includes('Installed process restart proof is missing:'))
})
