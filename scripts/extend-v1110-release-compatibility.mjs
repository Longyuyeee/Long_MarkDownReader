// Mechanical extension of explicit later-version allowlists only. No historical
// receipt, assertion count, source identity or fixed native fixture is rewritten.
import fs from 'node:fs'
import path from 'node:path'
const apply=process.argv.includes('--apply'),changed=[]
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)])
for(const file of [...walk('scripts'),...walk('.github/workflows')].filter(file=>/\.(mjs|yml|ps1)$/.test(file)&&!file.endsWith('extend-v1110-release-compatibility.mjs'))){
 const before=fs.readFileSync(file,'utf8')
 const append=whole=>whole.includes("'1.1.9'")||whole.includes('"1.1.9"')?whole.includes('1.1.10')?whole:whole.slice(0,-1)+", '1.1.10'"+whole.slice(-1):whole
 let after=before.replace(/\[(?:\s*['"]1\.\d+\.\d+['"]\s*,?)+\]/g,append).replace(/@\((?:\s*['"]1\.\d+\.\d+['"]\s*,?)+\)/g,append)
 if(path.basename(file).startsWith('check-'))after=after.replace(/\[(?:\s*['"][^'"\r\n]*['"]\s*,?)+\]/g,whole=>{
  const states=[...whole.matchAll(/['"]v1\.1\.9-([^'"]+)['"]/g)].map(match=>'v1.1.10-'+match[1]).filter(state=>!whole.includes(state))
  return states.length?whole.slice(0,-1)+', '+states.map(state=>JSON.stringify(state)).join(', ')+']':whole
 })
 if(['import-community-release-review.mjs','installed-release-runtime.mjs'].includes(path.basename(file)))after=after.replaceAll("version === '1.1.9'", "['1.1.9', '1.1.10'].includes(version)").replaceAll("manifest.appVersion === '1.1.9'", "['1.1.9', '1.1.10'].includes(manifest.appVersion)")
 if(path.basename(file)==='installed-release-runtime.mjs')after=after.replace("const evidenceRoot = ['1.1.9', '1.1.10'].includes(manifest.appVersion) ?", "const evidenceRoot = manifest.appVersion === '1.1.10' ? 'docs/evidence/v1-1-10-candidate-lifecycle/' : manifest.appVersion === '1.1.9' ?")
 if(['v1-1-0-candidate-lifecycle.yml','v1-1-0-installer-review.yml'].includes(path.basename(file)))after=after.replace(/(current_version:[\s\S]*?default: ")1\.1\.\d+("?)/,'$11.1.10$2').replace(/(previous_version:[\s\S]*?default: ")1\.1\.\d+("?)/,'$11.1.9$2')
 if(['run-r5i-isolated-install-lifecycle.ps1','community-release-publish.yml'].includes(path.basename(file)))after=after.replaceAll("-eq '1.1.9'","-in @('1.1.9','1.1.10')")
 if(after!==before){changed.push(file);if(apply)fs.writeFileSync(file,after)}
}
console.log(JSON.stringify({apply,files:changed},null,2))
