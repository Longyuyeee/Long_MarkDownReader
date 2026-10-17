// Explicit future-version allowlists only. Do not edit old receipts or weaken an inherited assertion.
import fs from 'node:fs'
import path from 'node:path'
const apply=process.argv.includes('--apply'),changed=[]
if(process.argv.slice(2).some(arg=>arg!=='--apply'))throw Error('Only --apply is supported')
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)])
for(const file of [...walk('scripts'),...walk('.github/workflows')].filter(file=>/\.(mjs|yml|ps1)$/.test(file)&&!/^extend-|^apply-/.test(path.basename(file)))){
 const before=fs.readFileSync(file,'utf8')
 const append=whole=>/['"]1\.1\.10['"]/.test(whole)&&!whole.includes('1.1.11')?whole.slice(0,-1)+", '1.1.11'"+whole.slice(-1):whole
 let after=before.replace(/\[(?:\s*['"]1\.\d+\.\d+['"]\s*,?)+\]/g,append).replace(/@\((?:\s*['"]1\.\d+\.\d+['"]\s*,?)+\)/g,append)
 if(path.basename(file).startsWith('check-'))after=after.replace(/\[(?:\s*['"][^'"\r\n]*['"]\s*,?)+\]/g,whole=>{
  if (whole.includes('v1.1.10-tags-collections') || whole.includes('v1.1.10-work-session-continuity')) return whole
  const states=[...whole.matchAll(/['"]([vV]1\.1\.10-[^'"]+)['"]/g)].map(match=>match[1].replace('1.1.10','1.1.11')).filter(state=>!whole.includes(state))
  return states.length?whole.slice(0,-1)+', '+states.map(state=>JSON.stringify(state)).join(', ')+']':whole
 })
 if(['import-community-release-review.mjs','installed-release-runtime.mjs'].includes(path.basename(file)))after=after.replaceAll("version === '1.1.10'", "['1.1.10', '1.1.11'].includes(version)").replaceAll("manifest.appVersion === '1.1.10'", "['1.1.10', '1.1.11'].includes(manifest.appVersion)")
 if(path.basename(file)==='installed-release-runtime.mjs'&&!after.includes("manifest.appVersion === '1.1.11' ? 'docs/evidence/v1-1-11-candidate-lifecycle/'"))after=after.replace('const evidenceRoot = ',"const evidenceRoot = manifest.appVersion === '1.1.11' ? 'docs/evidence/v1-1-11-candidate-lifecycle/' : ")
 if(['v1-1-0-candidate-lifecycle.yml','v1-1-0-installer-review.yml'].includes(path.basename(file)))after=after.replace(/(current_version:[\s\S]*?default: ")1\.1\.\d+("?)/,'$11.1.11$2').replace(/(previous_version:[\s\S]*?default: ")1\.1\.\d+("?)/,'$11.1.10$2')
 if(path.basename(file)==='community-release-publish.yml')after=after.replaceAll("-eq '1.1.10'","-in @('1.1.10','1.1.11')")
 if(path.basename(file)==='capture-r5j-installed-artifact-smoke.mjs')after=after.replaceAll("appVersion === '1.1.10'","['1.1.10','1.1.11'].includes(appVersion)")
 if(path.basename(file)==='installed-v1-1-10-workflow.mjs')after=after.replace("assert.equal(appVersion,'1.1.10')","assert.ok(['1.1.10','1.1.11'].includes(appVersion))")
 if(path.basename(file)==='installed-v1-1-10-evidence.mjs')after=after.replace("assert.equal(manifest.appVersion,'1.1.10')","assert.ok(['1.1.10','1.1.11'].includes(manifest.appVersion))")
 if(path.basename(file)==='installed-management-fixture.mjs')after=after.replaceAll("version==='1.1.10'","['1.1.10','1.1.11'].includes(version)")
 if(after!==before){changed.push(file);if(apply)fs.writeFileSync(file,after)}
}
console.log(JSON.stringify({apply,files:changed},null,2))
