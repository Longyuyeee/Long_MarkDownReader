import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { parse } from 'yaml'
import { validateInstalledVersionObservations } from './lib/installed-version-identity.mjs'

const source = fs.readFileSync('.github/workflows/v123-candidate-lifecycle.yml', 'utf8')
const workflow = parse(source)
const policy = JSON.parse(fs.readFileSync('shared/v123-candidate-lifecycle-policy.json'))
const job = workflow.jobs['candidate-lifecycle']
test('fixed product, official predecessor and disposable install boundaries', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.equal(job['runs-on'], 'windows-latest')
  assert.equal(job.env.LONGEDIT_R5I_DISPOSABLE, '1')
  assert.equal(job.env.LONGEDIT_INSTALLED_VERSION_SCENARIO, '1')
  assert.equal(JSON.parse(execFileSync('git', ['show', `${policy.candidateCommit}:package.json`])).version, '1.0.23')
  assert.equal(policy.releaseCandidate, false)
  assert.equal(policy.sourceUserContentIncluded, false)
  const receipt = JSON.parse(fs.readFileSync(policy.previousReleaseReceipt))
  assert.equal(receipt.release.taggedCommit, policy.previousTagCommit)
  assert.equal(receipt.release.tag, 'v1.0.22')
  for (const token of ['$env:CANDIDATE_COMMIT -cne $policy.candidateCommit', '$previous -ne $policy.previousTagCommit', 'gh release download v1.0.22', '$installer.Length -ne $asset[0].sizeBytes', '-ne $asset[0].sha256', '-ConfirmDisposableMachine', '-ExpectedSourceCommit $env:PRODUCT_SOURCE_COMMIT']) assert.ok(source.includes(token), token)
  assert.equal(job.steps.filter(s => (s.run ?? '').includes('tauri -- build')).length, 1)
  assert.ok(job.steps.findIndex(s=>s.run==='npm run ci:patch-release') < job.steps.findIndex(s=>(s.run??'').includes('tauri -- build')))
  for (const step of job.steps) assert.ok(!(step.run ?? '').includes('${{ inputs.'))
  const upload = job.steps.find(s => (s.uses ?? '').startsWith('actions/upload-artifact@'))
  assert.equal(upload.if, 'always()')
  assert.equal(upload.with['if-no-files-found'], 'error')
})
const fixture = () => ({ nativeVersion: '1.0.23', badge: 'v1.0.23', badgeLabel: '当前软件版本 v1.0.23', settingsRoute: '#/settings?category=system&focus=software-update', settings: '当前版本 v1.0.23', checkedSettings: '当前已是最新版本 v1.0.23。', capabilities: '格式能力 v1.0.23 社区版 · 未签名' })
test('installed observations validate the actual three version surfaces', () => validateInstalledVersionObservations(fixture(), '1.0.23'))
for (const [key, value] of Object.entries({ nativeVersion: '1.0.22', badge: 'v1.0.23dev', badgeLabel: '下一目标 v1.0.23', settingsRoute: '#/library', settings: '当前版本 v1.0.22', checkedSettings: '更新失败', capabilities: 'v1.0.23 开发模式' })) {
  test(`reject wrong installed observation: ${key}`, () => assert.throws(() => validateInstalledVersionObservations({ ...fixture(), [key]: value }, '1.0.23')))
}
test('PowerShell steps parse without installing locally', { skip: process.platform !== 'win32' }, () => {
  for (const step of job.steps.filter(s=>s.shell==='powershell')) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', '$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$tokens,[ref]$errors) > $null; if ($errors.Count) { $errors | Out-String | Write-Error; exit 1 }'], { input: step.run, encoding: 'utf8' })
    assert.equal(result.status, 0, `${step.name}: ${result.stderr}`)
  }
})
