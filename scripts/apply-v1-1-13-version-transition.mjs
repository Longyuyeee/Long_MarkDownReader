// Guarded atomic migration: current identities only, never public downloads/old receipts.
import fs from 'node:fs'
import assert from 'node:assert/strict'
const from='1.1.12',to='1.1.13',read=f=>fs.readFileSync(f,'utf8'),json=f=>JSON.parse(read(f)),changes=new Map(),escaped=from.replaceAll('.','\\.')
if(process.argv.slice(2).some(a=>a!=='--apply'))throw Error('Only --apply is supported')
const replace=(file,pattern,value,count)=>{const source=changes.get(file)??read(file);assert.equal([...source.matchAll(pattern)].length,count,file);changes.set(file,source.replace(pattern,value))}
const list=read('scripts/apply-post-v116-m5-5-v1017-atomic-version-transition.mjs').match(/const activeSharedFiles = \[([\s\S]*?)\]/)[1],contracts=[...list.matchAll(/'(shared\/[^']+)'/g)].map(m=>m[1]);assert.equal(contracts.length,37);assert.equal(new Set(contracts).size,37)
replace('package.json',new RegExp('"version": "'+escaped+'"','g'),'"version": "'+to+'"',1)
const lock=json('package-lock.json');assert.equal(lock.version,from);assert.equal(lock.packages[''].version,from);lock.version=lock.packages[''].version=to;changes.set('package-lock.json',JSON.stringify(lock,null,2)+'\n')
replace('src-tauri/tauri.conf.json',new RegExp('"version": "'+escaped+'"','g'),'"version": "'+to+'"',1)
replace('src-tauri/Cargo.toml',new RegExp('^version = "'+escaped+'"$','gm'),'version = "'+to+'"',1)
replace('src-tauri/Cargo.lock',new RegExp('(name = "tauri-app"\\r?\\nversion = ")'+escaped+'("\\r?\\n)','g'),'$1'+to+'$2',1)
for(const file of contracts){assert.equal(json(file).appVersion,from);replace(file,new RegExp('"appVersion": "'+escaped+'"','g'),'"appVersion": "'+to+'"',1)}
replace('shared/p1-final-capability-closure.json',/V1\.1\.12-UNSIGNED-PATCH-RELEASE/g,'V1.1.13-UNSIGNED-PATCH-RELEASE',1)
const development=json('shared/development-version-policy.json');assert.equal(development.publicVersion,from);assert.equal(development.developmentTargetVersion,to)
Object.assign(development,{runtimeBaseVersion:to,currentStage:'M8-54-v1.1.13-version-candidate',binaryVersionTransition:'v1.1.13-quality-gate-pending',displayLabel:'v1.1.13 PDF 阅读笔记候选 · 当前公开 v1.1.12',activeSlice:{id:'v1.1.13-pdf-reading-notes',status:'candidate-validation-pending',document:'docs/V1_1_13_PDF_Reading_Development_2026-10-18.md'}});changes.set('shared/development-version-policy.json',JSON.stringify(development,null,2)+'\n')
const community=json('shared/v1-community-release-policy.json');assert.equal(community.appVersion,from);assert.equal(community.gates.githubReleasePublished,true)
Object.assign(community,{appVersion:to,releaseCandidate:false,generatedAt:'2026-10-18',currentStatus:'v1.1.13-community-release-quality-gate-pending',gates:Object.fromEntries(Object.keys(community.gates).map(k=>[k,false])),patchValidation:{...community.patchValidation,previousPublicVersion:from,previousEvidenceInheritedAsCurrent:false,fullInstalledLifecycleRerun:false,managedUpdaterUpgradePath:from+'-to-'+to+'-pending',scope:'pdf-reading-notes-draft-safety-and-content-verified-sources'},targetRelease:{...community.targetRelease,tag:'v'+to,url:'https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v'+to},candidate:null,release:null,releaseWarnings:[...new Set([...community.releaseWarnings,from+'-to-'+to+'-managed-update-observation-pending'])],nextAction:'validate-and-build-v1.1.13-installers'});changes.set('shared/v1-community-release-policy.json',JSON.stringify(community,null,2)+'\n')
if(process.argv.includes('--apply'))for(const [file,content]of changes)fs.writeFileSync(file,content)
console.log(`${process.argv.includes('--apply')?'Applied':'Dry run'}: ${changes.size} identity files; public downloads/historical evidence unchanged.`)
