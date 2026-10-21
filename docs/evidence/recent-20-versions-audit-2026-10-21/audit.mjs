import fs from 'node:fs'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {assertInstalledReleaseRuntime} from '../../../scripts/lib/installed-release-runtime.mjs'
const root='docs/evidence/recent-20-versions-audit-2026-10-21',json=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),sha=b=>crypto.createHash('sha256').update(b).digest('hex')
const releases=json(root+'/recent20.json'),tags=json(root+'/tags.json'),results=[]
const featureKeys=['workflow','experience','fileManagement','foundation','foundationExtended','foundationHardening','moveContinuity','saveHistory','searchCompleteness','workSession','tagCollections','graphExploration','contentBackup','pdfReading','writingDelivery','tableEditing','workbookEditing','docxEditing','pptxEditing','organizing','structuredEditing','crossLibraryCopy','fileOperationHistory','attachments','chapters','findReplace','structuredHistory','collectionReuse','referenceRepair','pdfContinuity']
for(const release of releases){
 const version=release.tag_name.slice(1),m=json(`docs/evidence/v${version}-release/artifact-manifest.json`),errors=[],expected=[...m.artifacts,m.checksumFile]
 const check=(condition,message)=>{if(!condition)errors.push(message)}
 check(m.releasePublished===true,'local publication flag');check(release.assets.length===3,'three public assets')
 const tag=tags.find(t=>t.ref==='refs/tags/'+release.tag_name);const localRef=execFileSync('git',['rev-parse',release.tag_name],{encoding:'utf8'}).trim(),resolved=execFileSync('git',['rev-parse',release.tag_name+'^{commit}'],{encoding:'utf8'}).trim();check(tag?.object?.sha===localRef&&resolved===m.sourceCommit,'immutable source tag')
 for(const file of expected){const a=release.assets.find(a=>a.name===file.fileName);check(a&&a.size===file.sizeBytes&&a.digest==='sha256:'+file.sha256,'public asset digest '+file.fileName)}
 try{assertInstalledReleaseRuntime(m)}catch(e){errors.push('runtime receipt: '+e.message)}
 const imported=json(`docs/evidence/v${version}-release/import-manifest.json`);let hashed=0
 const proofRoot=m.hostedInstalledLifecycle.evidenceRoot
 for(const item of imported.files){const file=proofRoot+'/'+item.path;try{const bytes=fs.readFileSync(file);check(bytes.length===item.sizeBytes&&sha(bytes)===item.sha256,'imported byte drift '+file);hashed++}catch(e){errors.push('unreadable evidence '+file)}}
 const reports=Object.fromEntries(Object.entries(m.runtimeSmoke.reports).map(([key,info])=>[key,json(info.path)]))
 const counts=Object.fromEntries(featureKeys.filter(k=>Array.isArray(reports[k]?.checks)).map(k=>[k,reports[k].checks.length]))
 const notes=fs.readFileSync(`docs/RELEASE_NOTES_v${version}.md`,'utf8'),normalize=s=>s.replace(/\r\n/g,'\n').trim()
 results.push({version,publishedAt:release.published_at,url:release.html_url,sourceCommit:m.sourceCommit,buildRunId:m.artifactBuildRunId||m.qualityGate.runId,reviewRunId:m.hostedRunId,publicAssets:release.assets.length,rawFilesRehashed:hashed,functionTaskTotal:Object.values(counts).reduce((a,b)=>a+b,0),functionCounts:counts,releaseNotesMatch:normalize(release.body||'')===normalize(notes),status:errors.length?'issues':'verified',errors})
 console.log(version+': '+(errors.length?JSON.stringify(errors):'verified')+'; '+hashed+' original files hashed')
}
const output={checkedAt:new Date().toISOString(),timezone:'Asia/Hong_Kong',scope:'v1.1.10-v1.1.29',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),method:'Current GitHub release API and immutable tag refs, public asset digest/size, existing runtime receipt validators, independent rehash of every imported output; no reinstall or full CI rerun',results}
fs.writeFileSync(root+'/result.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({versions:results.length,verified:results.filter(r=>r.status==='verified').length,rawFiles:results.reduce((n,r)=>n+r.rawFilesRehashed,0),notesDiffer:results.filter(r=>!r.releaseNotesMatch).map(r=>r.version)}))
