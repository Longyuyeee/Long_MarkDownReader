import assert from 'node:assert/strict'
import fs from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'
import {releaseValidationProfile,assertReleaseValidationProfile} from './lib/release-validation-profile.mjs'
const profile=releaseValidationProfile('1.3.10')
const fixture=()=>({appVersion:'1.3.10',validationProfile:structuredClone(profile),runtimeSmoke:{reports:Object.fromEntries(profile.currentReportKeys.map(key=>[key,{path:'docs/evidence/v1-3-10-candidate-lifecycle/'+key+'.json'}]))}})
test('current checks and immutable published historical baseline are separate',()=>{
 assertReleaseValidationProfile(fixture())
 assert.equal(profile.baseline.tag,'v1.3.9');assert.equal(profile.historicalResultsCountedAsCurrent,false)
 assert.ok(profile.inheritedReportKeys.length>70);assert.ok(profile.currentReportKeys.length<25)
 assert.equal(releaseValidationProfile('1.3.9'),undefined)
})
test('missing affected checks, inherited reports masquerading as current, and drifted baselines are rejected',()=>{
 const missing=fixture();delete missing.runtimeSmoke.reports.sourceScope;assert.throws(()=>assertReleaseValidationProfile(missing))
 const inherited=fixture();inherited.runtimeSmoke.reports.pdfReading={path:'docs/evidence/v1-3-9-candidate-lifecycle/old.json'};assert.throws(()=>assertReleaseValidationProfile(inherited))
 const drift=fixture();drift.validationProfile.historicalResultsCountedAsCurrent=true;assert.throws(()=>assertReleaseValidationProfile(drift))
 assert.throws(()=>assertReleaseValidationProfile(fixture(),file=>file===profile.baseline.manifestPath?Buffer.from('{}'):fs.readFileSync(file)))
 const stale=fixture();stale.runtimeSmoke.reports.sourceSearch.path='docs/evidence/v1-3-9-candidate-lifecycle/old.json';assert.throws(()=>assertReleaseValidationProfile(stale))
})
test('the native driver selects core and affected workflows while retaining the old full suite',()=>{
 const lines=fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8').split('\n')
 const selected=version=>lines.flatMap((line,index)=>{
  const guard=line.match(/^\s*if\s*\((.*)\)\s*\{/),call=lines[index+1]?.match(/\b(runInstalledV\d+\w*)\s*}/)
  if(!guard||!call)return[]
  return new Function('appVersion','process','return '+guard[1])(version,{env:{LONGEDIT_INSTALLED_VERSION_SCENARIO:'1'}})?[call[1]]:[]
 })
 const current=selected('1.3.10'),old=selected('1.3.9')
 assert.equal(current.length,13,current.join(','));assert.ok(old.length>80)
 for(const id of ['110','111','112','113','118','1217','134','135','136','137','138','139','1310'])assert.ok(current.some(name=>new RegExp('V'+id+'(?![0-9])').test(name)),id)
 for(const id of ['1116','1117','1118','1232','1244'])assert.ok(!current.some(name=>new RegExp('V'+id+'(?![0-9])').test(name)),id)
})
test('imported primary reports match only the current core and affected selection',()=>{
 const source=fs.readFileSync('scripts/import-community-release-review.mjs','utf8')
 const start=source.indexOf('const reports = Object.fromEntries([')+'const reports = Object.fromEntries('.length
 const end=source.indexOf('].map(([key, file, count])',start)+1
 const expression=source.slice(start,end),names=[...new Set([...expression.matchAll(/\b(\w+Checks)\b/g)].map(m=>m[1]))]
 const supplemental=['routes','searchBaseline','searchUser','searchOffice']
 for(const version of ['1.3.10','1.3.11', '1.3.12', '1.3.13', '1.3.14', '1.3.15']){
  const rows=vm.runInNewContext(expression,{version,...Object.fromEntries(names.map(name=>[name,Array(9)]))})
  assert.deepEqual(Array.from(rows,r=>r[0]).sort(),[...releaseValidationProfile(version).currentReportKeys.filter(k=>!supplemental.includes(k)),'lifecycle','management'].sort())
 }
})
test('runtime validators require exactly the selected reports and keep historical groups outside current counts',()=>{
 const lines=fs.readFileSync('scripts/lib/installed-release-runtime.mjs','utf8').split('\n')
 for(const version of ['1.3.10','1.3.11', '1.3.12', '1.3.13', '1.3.14', '1.3.15']){
 const all=[],current=[]
 for(let i=0;i<lines.length;i++){
  const guard=lines[i].match(/^\s*if\s*\((.*)\)\s*\{/),target=lines[i+1]?.match(/validateInstalled\w+\(reports\.(\w+)/)
  if(!guard||!target||!guard[1].includes('manifest.appVersion'))continue
  all.push(target[1]);if(new Function('manifest','return '+guard[1])({appVersion:version}))current.push(target[1])
 }
 assert.ok(all.length>70)
 assert.deepEqual(current.sort(),releaseValidationProfile(version).currentReportKeys.filter(key=>all.includes(key)).sort())
 for(const key of ['sourceMatches','recentSearch','sourcePosition','sourceScope','replacementPreview','savepoint'])assert.ok(current.includes(key),key)
 }
})
test('selected search reports load all three supplemental proofs instead of depending on an old version list',()=>{
 const source=fs.readFileSync('scripts/import-community-release-review.mjs','utf8'),anchor=source.indexOf("  for (const [key, file] of [['searchBaseline'")
 assert.ok(anchor>0);const start=source.lastIndexOf('\nif (',anchor),end=source.indexOf('\nassert.equal(reports.lifecycle',anchor),fragment=source.slice(start,end)
 for(const selected of [true,false]){
  const reports=selected?{searchCompleteness:{file:'installed-v118-workflow.json'}}:{},context={version:'1.3.10',reports,directory:'owned',path:{join:(...parts)=>parts.join('/')},json:file=>({observed:file})}
  vm.runInNewContext(fragment,context)
  for(const[key,file]of [['searchBaseline','installed-v118-baseline.json'],['searchUser','installed-v118-user.json'],['searchOffice','installed-v118-office.json']]){
   if(selected){assert.equal(reports[key].file,file);assert.equal(reports[key].report.observed,'owned/'+file)}else assert.equal(reports[key],undefined)
  }
 }
})

test('1.3.11 selects previous affected tasks plus return navigation, while historical scope is unchanged',()=>{
 const current=releaseValidationProfile('1.3.11')
 assert.deepEqual(current.currentReportKeys,[...profile.currentReportKeys,'sourceReturn'])
 assert.deepEqual(current.inheritedReportKeys,profile.inheritedReportKeys)
 const manifest={appVersion:'1.3.11',validationProfile:current,runtimeSmoke:{reports:Object.fromEntries(current.currentReportKeys.map(key=>[key,{path:'docs/evidence/v1-3-11-candidate-lifecycle/'+key+'.json'}]))}}
 assertReleaseValidationProfile(manifest)
 for(const[file,variable,pattern,expected]of [
  ['scripts/capture-r5j-installed-artifact-smoke.mjs','appVersion',/runInstalledV\d+\w*/,14],
  ['scripts/lib/installed-release-runtime.mjs','manifest',/validateInstalled\w+\(reports\.(\w+)/,10],
 ]){
  const lines=fs.readFileSync(file,'utf8').split('\n');let actual=0
  for(let i=0;i<lines.length;i++){
   const guard=lines[i].match(/^\s*if\s*\((.*)\)\s*\{/)
   if(!guard||!pattern.test(lines[i+1]||''))continue
   if(variable==='appVersion'&&new Function('appVersion','process','return '+guard[1])('1.3.11',{env:{LONGEDIT_INSTALLED_VERSION_SCENARIO:'1'}}))actual++
   else if(variable==='manifest'&&guard[1].includes('manifest.appVersion')&&new Function('manifest','return '+guard[1])({appVersion:'1.3.11'}))actual++
  }
  assert.equal(actual,expected,file)
 }
})

test('1.3.12 adds the actual structure navigation workflow without rerunning inherited features',()=>{
 const previous=releaseValidationProfile('1.3.11'),current=releaseValidationProfile('1.3.12')
 assert.deepEqual(current.currentReportKeys,[...previous.currentReportKeys,'structureNavigation']);assert.deepEqual(current.inheritedReportKeys,previous.inheritedReportKeys)
 const lines=fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8').split('\n'),names=[]
 for(let i=0;i<lines.length;i++){
  const guard=lines[i].match(/^\s*if\s*\((.*)\)\s*\{/),call=lines[i+1]?.match(/\b(runInstalledV\d+\w*)\s*}/)
  if(guard&&call&&new Function('appVersion','process','return '+guard[1])('1.3.12',{env:{LONGEDIT_INSTALLED_VERSION_SCENARIO:'1'}}))names.push(call[1])
 }
 assert.equal(names.length,15);assert.ok(names.includes('runInstalledV1312StructureNavigationWorkflow'))
})

test('1.3.13 adds the actual structure navigation workflow without rerunning inherited features',()=>{
 const previous=releaseValidationProfile('1.3.12'),current=releaseValidationProfile('1.3.13')
 assert.deepEqual(current.currentReportKeys,[...previous.currentReportKeys,'navigationForward']);assert.deepEqual(current.inheritedReportKeys,previous.inheritedReportKeys)
 const lines=fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8').split('\n'),names=[]
 for(let i=0;i<lines.length;i++){
  const guard=lines[i].match(/^\s*if\s*\((.*)\)\s*\{/),call=lines[i+1]?.match(/\b(runInstalledV\d+\w*)\s*}/)
  if(guard&&call&&new Function('appVersion','process','return '+guard[1])('1.3.13',{env:{LONGEDIT_INSTALLED_VERSION_SCENARIO:'1'}}))names.push(call[1])
 }
 assert.equal(names.length,16);assert.ok(names.includes('runInstalledV1313NavigationForwardWorkflow'))
})

test('1.3.14 adds the actual structure navigation workflow without rerunning inherited features',()=>{
 const previous=releaseValidationProfile('1.3.13'),current=releaseValidationProfile('1.3.14')
 assert.deepEqual(current.currentReportKeys,[...previous.currentReportKeys,'linkSourceReturn']);assert.deepEqual(current.inheritedReportKeys,previous.inheritedReportKeys)
 const lines=fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8').split('\n'),names=[]
 for(let i=0;i<lines.length;i++){
  const guard=lines[i].match(/^\s*if\s*\((.*)\)\s*\{/),call=lines[i+1]?.match(/\b(runInstalledV\d+\w*)\s*}/)
  if(guard&&call&&new Function('appVersion','process','return '+guard[1])('1.3.14',{env:{LONGEDIT_INSTALLED_VERSION_SCENARIO:'1'}}))names.push(call[1])
 }
 assert.equal(names.length,17);assert.ok(names.includes('runInstalledV1314LinkSourceReturnWorkflow'))
})

test('1.3.15 adds the actual structure navigation workflow without rerunning inherited features',()=>{
 const previous=releaseValidationProfile('1.3.14'),current=releaseValidationProfile('1.3.15')
 assert.deepEqual(current.currentReportKeys,[...previous.currentReportKeys,'inlineLinkRepair']);assert.deepEqual(current.inheritedReportKeys,previous.inheritedReportKeys)
 const lines=fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8').split('\n'),names=[]
 for(let i=0;i<lines.length;i++){
  const guard=lines[i].match(/^\s*if\s*\((.*)\)\s*\{/),call=lines[i+1]?.match(/\b(runInstalledV\d+\w*)\s*}/)
  if(guard&&call&&new Function('appVersion','process','return '+guard[1])('1.3.15',{env:{LONGEDIT_INSTALLED_VERSION_SCENARIO:'1'}}))names.push(call[1])
 }
 assert.equal(names.length,18);assert.ok(names.includes('runInstalledV1315InlineLinkRepairWorkflow'))
})
