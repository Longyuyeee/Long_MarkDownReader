import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

const configuration = () => JSON.parse(fs.readFileSync(new URL('../../shared/release-validation-profiles.json', import.meta.url), 'utf8'))
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
export function releaseValidationProfile(version) {
  return configuration().versions[version]
}
export function assertCurrentReviewProfile(version, sourceCommit, harnessCommit, directory) {
  const profile=releaseValidationProfile(version)
  if(!profile)return
  const baseline=JSON.parse(fs.readFileSync(profile.baseline.manifestPath,'utf8'))
  const reports=Object.fromEntries(profile.currentReportKeys.map(key=>{
    const file=key==='structureNavigation'?'installed-v1312-navigation-workflow.json':key==='sourceReturn'?'installed-v1311-return-workflow.json':key==='sourceMatches'?'installed-v1310-matches-workflow.json':path.basename(baseline.runtimeSmoke.reports[key].path)
    const bytes=fs.readFileSync(path.join(directory,file)),report=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''))
    if(key!=='routes')assert.equal(report.status,'passed',key)
    if(report.appVersion)assert.equal(report.appVersion,version,key)
    if(report.sourceCommit)assert.equal(report.sourceCommit,sourceCommit,key)
    if(report.harnessSourceCommit)assert.equal(report.harnessSourceCommit,harnessCommit,key)
    return [key,{path:`docs/evidence/v${version.replaceAll('.','-')}-candidate-lifecycle/`+file}]
  }))
  assertReleaseValidationProfile({appVersion:version,validationProfile:profile,runtimeSmoke:{reports}})
  return {currentReportTypes:Object.keys(reports).length,historicalReportTypes:profile.inheritedReportKeys.length,historicalResultsCountedAsCurrent:false}
}
export function assertReleaseValidationProfile(manifest, read = file => fs.readFileSync(file)) {
  const expected = releaseValidationProfile(manifest.appVersion)
  if (!expected) { assert.equal(manifest.validationProfile, undefined); return }
  assert.deepEqual(manifest.validationProfile, expected, 'Current report selection must match the declared release scope')
  const baselineBytes = read(expected.baseline.manifestPath)
  assert.equal(digest(baselineBytes), expected.baseline.manifestSha256, 'Historical baseline changed')
  const baseline = JSON.parse(baselineBytes)
  assert.equal(baseline.appVersion, expected.baseline.version)
  assert.equal(baseline.sourceCommit, expected.baseline.sourceCommit)
  assert.equal(baseline.releasePublished, true)
  assert.equal(baseline.runtimeSmoke.status, 'passed-installed-tauri-webview2')
  const receipt = JSON.parse(read(expected.baseline.releaseReceiptPath))
  assert.equal(receipt.release.tag, expected.baseline.tag)
  assert.equal(receipt.release.taggedCommit, baseline.sourceCommit)
  assert.equal(receipt.status, 'published-and-remote-assets-verified')
  assert.deepEqual(Object.keys(manifest.runtimeSmoke.reports).sort(), [...expected.currentReportKeys].sort(), 'Only actually rerun reports belong to this version')
  assert.equal(new Set(expected.currentReportKeys).size, expected.currentReportKeys.length)
  assert.deepEqual(expected.inheritedReportKeys, Object.keys(baseline.runtimeSmoke.reports).filter(key => !expected.currentReportKeys.includes(key)), 'Omitted groups are historical references, never current passes')
  for (const key of expected.currentReportKeys) assert.ok(!expected.inheritedReportKeys.includes(key))
  for (const [key, report] of Object.entries(manifest.runtimeSmoke.reports)) {
    assert.ok(report.path.startsWith(`docs/evidence/v${manifest.appVersion.replaceAll('.', '-')}-candidate-lifecycle/`), key)
  }
}
