import fs from 'node:fs'

// Approved consolidation minor release. Do not renumber historical evidence,
// third-party dependencies, or the real public predecessor.
const previous='1.3.9',current='1.3.10',changes=new Map()
const read=file=>fs.readFileSync(file,'utf8'),json=file=>JSON.parse(read(file))
const replace=(file,pattern,value,count)=>{
 const source=changes.get(file)??read(file)
 if([...source.matchAll(pattern)].length!==count)throw Error(`Unexpected baseline: ${file}`)
 changes.set(file,source.replace(pattern,value))
}
if(process.argv.slice(2).some(arg=>arg!=='--apply'))throw Error('Only --apply is supported')
const list=read('scripts/apply-post-v116-m5-5-v1017-atomic-version-transition.mjs').match(/const activeSharedFiles = \[([\s\S]*?)\]/)[1]
const contracts=[...list.matchAll(/'(shared\/[^']+)'/g)].map(match=>match[1])
if(contracts.length!==37||new Set(contracts).size!==37)throw Error('Canonical contract list changed')
replace('package.json',/"version": "1\.3\.9"/g,'"version": "1.3.10"',1)
const lock=json('package-lock.json')
if(lock.version!==previous||lock.packages[''].version!==previous)throw Error('Lockfile baseline changed')
lock.version=lock.packages[''].version=current
changes.set('package-lock.json',JSON.stringify(lock,null,2)+'\n')
replace('src-tauri/tauri.conf.json',/"version": "1\.3\.9"/g,'"version": "1.3.10"',1)
replace('src-tauri/Cargo.toml',/^version = "1\.3\.9"$/gm,'version = "1.3.10"',1)
replace('src-tauri/Cargo.lock',/(name = "tauri-app"\r?\nversion = ")1\.3\.9("\r?\n)/g,'$11.3.10$2',1)
for(const file of contracts){
 if(json(file).appVersion!==previous)throw Error(`Unexpected contract baseline: ${file}`)
 replace(file,/"appVersion": "1\.3\.9"/g,'"appVersion": "1.3.10"',1)
}
replace('shared/p1-final-capability-closure.json',/V1\.3\.9-UNSIGNED-PATCH-RELEASE/g,'V1.3.10-UNSIGNED-PATCH-RELEASE',1)
const development=json('shared/development-version-policy.json')
if(development.publicVersion!==previous||development.developmentTargetVersion!=='1.3.10')throw Error('Public baseline changed')
Object.assign(development,{
 developmentTargetVersion:current,runtimeBaseVersion:current,currentStage:'M8-216-v1.3.10-search-results-candidate',
 binaryVersionTransition:'v1.3.10-quality-gate-pending',displayLabel:'v1.3.10 查找结果定位候选 · 当前公开 v1.3.9',
 activeSlice:{id:'v1.3.10-search-results',status:'candidate-validation-pending',document:'docs/V1_3_10_Unsigned_Community_Release_Audit_2026-10-29.md'},
})
changes.set('shared/development-version-policy.json',JSON.stringify(development,null,2)+'\n')
const community=json('shared/v1-community-release-policy.json')
Object.assign(community,{
 appVersion:current,releaseCandidate:false,generatedAt:'2026-10-29',currentStatus:'v1.3.10-community-release-quality-gate-pending',
 gates:Object.fromEntries(Object.keys(community.gates).map(key=>[key,false])),
 patchValidation:{...community.patchValidation,previousPublicVersion:previous,previousEvidenceInheritedAsCurrent:false,fullInstalledLifecycleRerun:false,managedUpdaterUpgradePath:'1.3.9-to-1.3.10-pending',scope:'search-results'},
 targetRelease:{...community.targetRelease,tag:'v1.3.10',url:'https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.3.10'},candidate:null,release:null,
 releaseWarnings:[...new Set([...community.releaseWarnings,'v1.3.9-to-v1.3.10-managed-update-observation-pending'])],
 nextAction:'validate-and-build-v1.3.10-installers',
})
changes.set('shared/v1-community-release-policy.json',JSON.stringify(community,null,2)+'\n')
if(process.argv.includes('--apply'))for(const[file,content]of changes)fs.writeFileSync(file,content)
console.log(`${process.argv.includes('--apply')?'Applied':'Dry run'}: ${changes.size} current version files; historical evidence retained.`)
