import assert from 'node:assert/strict'
import fs from 'node:fs'
import {test} from 'node:test'
import path from 'node:path'
import {releaseValidationProfile} from './lib/release-validation-profile.mjs'

test('publisher validates each installed report once using a registered filename',()=>{
 // The publisher uses the runner's Node runtime without installing dependencies.
 const workflow=fs.readFileSync('.github/workflows/community-release-publish.yml','utf8')
 const step=workflow.split('      - name: Verify source, successful review and exact installer bytes')[1]?.split(/\r?\n      - /)[0]
 const run=step?.split('        run: |')[1]
 assert.ok(run,'Publisher verification step is missing')
 const version=JSON.parse(fs.readFileSync('package.json','utf8')).version
 const registry=fs.readFileSync('scripts/import-community-release-review.mjs','utf8')
 const known=new Set([...registry.matchAll(/['"](installed-v[\w.-]+-workflow\.json)['"]/g)].map(m=>m[1]))
 const reports=[]
 const allPrimary=[]
 for(const block of run.matchAll(/if \(\$env:RELEASE_VERSION -in @\(([^)]*)\)\) \{\s*@'([\s\S]*?)'@ \| node --input-type=module/g)){
  const primary=block[2].match(/\breport\s*=\s*read\('verified-review\/([^']+)'\)/)
  if(!primary)continue
  allPrimary.push(primary[1])
  if(![...block[1].matchAll(/'([^']+)'/g)].some(m=>m[1]===version))continue
  assert.ok(known.has(primary[1]),`Unregistered installed report: ${primary[1]}`)
  assert.ok(!reports.includes(primary[1]),`Repeated validation block: ${primary[1]}`)
  reports.push(primary[1])
 }
 assert.ok(reports.length>=(releaseValidationProfile(version)?8:30),`Expected current and historical installed validation blocks; found ${reports.length}`)
 const profile=releaseValidationProfile(version)
 if(profile){
  const baseline=JSON.parse(fs.readFileSync(profile.baseline.manifestPath,'utf8'))
  const expected=profile.currentReportKeys.map(key=>key==='structureNavigation'?'installed-v1312-navigation-workflow.json':key==='sourceReturn'?'installed-v1311-return-workflow.json':key==='sourceMatches'?'installed-v1310-matches-workflow.json':path.basename(baseline.runtimeSmoke.reports[key].path)).filter(file=>allPrimary.includes(file))
  assert.deepEqual(reports.sort(),expected.sort(),'Publisher requirements must match current reruns; omitted features require only their historical reference')
 }
 // The 1.3.0 audit extends the existing history workflow and retains the
 // latest 1.2 feature workflow instead of inventing a duplicate report.
 const aggregateReports=version==='1.3.0'
  ?['installed-v1126-workflow.json','installed-v1245-block-field-delete-workflow.json']
  :null
 if(aggregateReports){
  for(const file of aggregateReports)assert.ok(reports.includes(file),`Current version ${version} is missing publisher validation: ${file}`)
 }else{
  const current=`installed-v${version.replaceAll('.','')}`
  assert.ok(reports.some(file=>file.startsWith(current+'-')),`Current version ${version} has no publisher validation`)
 }
})
