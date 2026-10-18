// Copy generated hosted evidence byte-for-byte, with a no-overwrite manifest.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
const [input,folder]=process.argv.slice(2),source=path.resolve(input||''),target=path.resolve(folder||'')
assert.ok(source.toLowerCase().includes('longedit-v1118-'));assert.equal(path.dirname(target),path.resolve('docs/evidence'));assert.match(path.basename(target),/^v1118-[a-z0-9-]+$/)
const raw=path.join(target,'raw');assert.equal(fs.existsSync(raw),false)
const walk=(root,prefix='')=>fs.readdirSync(root,{withFileTypes:true}).flatMap(entry=>{assert.ok(!entry.isSymbolicLink());const relative=path.join(prefix,entry.name),file=path.join(root,entry.name);return entry.isDirectory()?walk(file,relative):[{relative,file,size:fs.statSync(file).size}]})
const files=walk(source);assert.ok(files.length&&files.length<512);assert.ok(files.reduce((sum,file)=>sum+file.size,0)<128*1024*1024)
for(const file of files){assert.ok(file.size<64*1024*1024);assert.match(file.relative,/\.(json|jpg|png|pdf|html|csv|xlsx|docx|pptx|txt|log|zip)$/i)}
fs.mkdirSync(raw,{recursive:true});const entries=[]
for(const file of files){const destination=path.join(raw,file.relative);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(file.file,destination,fs.constants.COPYFILE_EXCL);const bytes=fs.readFileSync(destination);entries.push({path:'raw/'+file.relative.replaceAll('\\','/'),sizeBytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})}
fs.writeFileSync(path.join(target,'raw-import-manifest.json'),JSON.stringify({status:'retained-original-evidence-not-acceptance',sourceUserContentIncluded:false,files:entries},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({folder,files:entries.length,bytes:entries.reduce((sum,file)=>sum+file.sizeBytes,0)}))
