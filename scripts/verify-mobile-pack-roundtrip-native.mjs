import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
const stage=process.argv[2],output=process.argv[3];assert.ok(['exported','imported'].includes(stage)&&output)
const app='com.longyuye.mdreader.mobile.dev',serial='emulator-5558',run=(...args)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',serial,...args],{maxBuffer:24*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout},sha=bytes=>createHash('sha256').update(bytes).digest('hex'),json=bytes=>JSON.parse(bytes.toString().replace(/^\ufeff/,'')),read=file=>run('exec-out','run-as',app,'cat',file)
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29')
const source=json(await readFile(path.join(output,'same-imported.json'))),sourceBytes=read('files/library/'+source.notePath)
assert.equal(sha(sourceBytes),source.noteSha256,'Round trip must preserve the original imported note')
const sourceFolder=source.notePath.split('/').slice(0,-1).join('/'),fixture=json(await readFile('E:/Android/BuildCache/LongEdit-PackImport-Valid-20261024/manifest.json'))
for(const[name,expected]of Object.entries(fixture.expected.assets))assert.equal(sha(read(`files/library/${sourceFolder}/${name}`)),expected.sha256)
const archive=run('exec-out','cat','/sdcard/Download/携带-附件包.textpack'),archiveSha256=sha(archive)
const python=spawnSync('python',['-c','import sys,zipfile,io,json,base64;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));assert z.testzip() is None;print(json.dumps({n:base64.b64encode(z.read(n)).decode() for n in z.namelist() if not n.endswith("/")}))'],{input:archive});assert.equal(python.status,0,python.stderr.toString());const members=json(python.stdout)
const content=Buffer.from(members['note.textbundle/text.markdown'],'base64').toString(),expected=sourceBytes.toString().replace('](assets/%E5%9B%BE%20%23.png)','](<assets/001-%E5%9B%BE%20%23.png>)').replace('](assets/a.pdf#page=2)','](<assets/002-a.pdf#page=2>)').replace('](assets/empty.pdf)','](<assets/003-empty.pdf>)')
assert.equal(content,expected);assert.equal(members['note.textbundle/assets/001-图 #.png'],fixture.expected.assets['assets/图 #.png'].base64);assert.equal(members['note.textbundle/assets/002-a.pdf'],fixture.expected.assets['assets/a.pdf'].base64);assert.equal(members['note.textbundle/assets/003-empty.pdf'],'')
const result={kind:'native-pack-roundtrip',stage,archiveSha256,archiveBytes:archive.length,sourceNotePath:source.notePath,sourceNoteSha256:sha(sourceBytes),contentSha256:sha(Buffer.from(content)),passed:true}
if(stage==='exported'){await writeFile(path.join(output,'native-roundtrip.textpack'),archive)}
else{
 const records=run('exec-out','run-as',app,'find','files/pack-imports-v1','-type','f').toString().trim().split(/\r?\n/).filter(file=>/\/[a-f0-9-]{36}\.json$/.test(file)).map(file=>json(read(file)))
 const record=records.find(record=>record.archiveDigest===archiveSha256&&record.status==='imported');assert.ok(record);assert.notEqual(record.localPath,source.notePath);assert.equal(read('files/library/'+record.localPath).toString(),content)
 const folder=record.localPath.split('/').slice(0,-1).join('/');assert.equal(json(read(`files/library/${folder}/.longedit-pack-import.json`)).id,record.id)
 for(const asset of record.assets)assert.equal(read(`files/library/${folder}/${asset.path}`).toString('base64'),members['note.textbundle/'+asset.path]);result.importedNotePath=record.localPath;result.assets=record.assets.length
}
const build=json(await readFile('release-artifacts/mobile-debug/x86_64/build-record.json')),apk=run('shell','pm','path',app).toString().trim().replace(/^package:/,'');result.installedApkSha256=run('shell','sha256sum',apk).toString().trim().split(/\s+/)[0];assert.equal(result.installedApkSha256,build.sha256)
await writeFile(path.join(output,'roundtrip-'+stage+'.json'),JSON.stringify(result,null,2)+'\n');console.log(`Native ${stage}: actual product export ZIP, text and all assets verified byte-for-byte`)
