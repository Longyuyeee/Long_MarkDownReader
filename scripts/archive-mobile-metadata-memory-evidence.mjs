import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,readdir,copyFile,access,stat} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
const raw='docs/evidence/mobile-0.1.0/native-metadata-memory-2026-10-30',out=process.argv[2]||'docs/evidence/mobile-native-metadata-memory-2026-10-30'
const sha=b=>createHash('sha256').update(b).digest('hex'),read=async f=>JSON.parse((await readFile(f,'utf8')).replace(/^\uFEFF/,''))
await assert.rejects(access(out));await mkdir(out);const manifest=[]
try {
await writeFile(out+'/.gitattributes','*.png -text -diff\n*.json -text -diff\n*.txt -text -diff\n*.xml -text -diff\n*.log -text -diff\n')
await writeFile(out+'/.gitignore','!*.log\n')
async function copy(source,name,kind){await copyFile(source,out+'/'+name);const bytes=await readFile(out+'/'+name);assert.equal(sha(bytes),sha(await readFile(source)));manifest.push({file:name,source,kind,bytes:bytes.length,sha256:sha(bytes)})}
const before=await read(raw+'/baseline.json'),after=await read(raw+'/closeout-final.json'),initial=await read(raw+'/initial-native.json'),cold=await read(raw+'/cold-resume-native.json')
assert.equal(before.passed,true);assert.equal(after.passed,true);assert.equal(initial.passed,true);assert.equal(cold.passed,true);assert.equal((await read(raw+'/emulator-closeout.json')).stopped,true)
for(const name of await readdir(raw)){
 const path=raw+'/'+name
 if((await stat(path)).isFile()&&!name.startsWith('preview-server-')&&/\.(json|png|xml|txt|log)$/.test(name)&&(await stat(path)).size<1024*1024)await copy(path,name,name.endsWith('.png')?(name.startsWith('cold-resume-')?'android-final':'android-initial'):'record')
}
const browser=[
 ['source',raw+'/browser-source-served','production'],
 ['text',raw+'/browser-text-served','production'],
 ['pdf-settings',raw+'/browser-pdf-settings','production'],
 ['pdf-navigation',raw+'/browser-pdf-navigation-task','production'],
 ['pdf-bookmarks',raw+'/browser-pdf-bookmarks','production'],
 ['pdf-recovery-replies','docs/evidence/mobile-0.1.0/pdf-recovery-replies-1793323005782','component'],
 ['source-server-down',raw+'/browser-source','failed-environment'],
 ['text-server-down',raw+'/browser-text','failed-environment'],
 ['pdf-old-flow','docs/evidence/mobile-0.1.0/pdf-navigation-browser-1793322633145','failed-outdated-flow']
]
const reports=[]
for(const [label,path,scope]of browser){
 const report=await read(path+'/report.json')
 if(scope==='production'||scope==='component')assert.equal(report.passed,true,label)
 reports.push({label,path,scope,passed:report.passed===true,groups:report.checks.length,scans:report.scans??[],failure:report.failure??null})
 for(const name of await readdir(path))if(/\.(png|json)$/.test(name))await copy(path+'/'+name,label+'-'+name,name.endsWith('.png')?label:'record')
}
const production=reports.filter(r=>r.scope==='production'),components=reports.filter(r=>r.scope==='component')
const scans=reports.filter(r=>r.passed).flatMap(r=>r.scans.map(s=>({...s,report:r.label})))
const summary={productionGroups:production.reduce((n,r)=>n+r.groups,0),componentGroups:components.reduce((n,r)=>n+r.groups,0),automaticScans:scans.length,automaticViolations:scans.reduce((n,s)=>n+(s.violations?.length??0),0),incompleteCollected:scans.filter(s=>Object.hasOwn(s,'incomplete')).length,incompleteNonEmpty:scans.filter(s=>s.incomplete?.length).map(s=>({report:s.report,name:s.name,incomplete:s.incomplete})),reports}
assert.equal(summary.productionGroups,41);assert.equal(summary.componentGroups,8);assert.equal(summary.automaticViolations,0)
await writeFile(out+'/browser-summary.json',JSON.stringify(summary,null,2))
const design=await read('docs/design/mobile-native-source-position-v1/revision-root/freeze.json'),actual=await read(raw+'/browser-source-served/report.json')
const pager=actual.screens.find(s=>s.name==='restored-reading'),jump=actual.screens.find(s=>s.name==='jump-dark'),dp=design.shots.find(s=>s.state==='reading').pager,dj=design.shots.find(s=>s.state==='jump').dialog
assert.equal(pager.pager.y-pager.clip.top,dp.y);assert.equal(pager.pager.width,dp.width);assert.equal(pager.pager.height,dp.height);assert.equal(jump.dialog.width,dj.width);assert.equal(jump.dialog.height,dj.height);assert.equal(jump.dialog.x,dj.x);assert.equal(jump.dialog.y-dj.y,14)
for(const c of design.components)assert.equal(sha(await readFile('src/mobile/'+c.name)),c.sha256)
await writeFile(out+'/alignment.json',JSON.stringify({reference:'../../design/mobile-native-source-position-v1/revision-root/freeze.json',pager:{design:dp,actual:pager.pager,previewRibbon:pager.clip.top,appCoordinatesMatch:true},dialog:{design:dj,actual:jump.dialog,viewportHeightDifference:28,centeringDifference:14,sizeAndMarginsMatch:true},short:actual.shortDetails,native:cold.screens.map(s=>({file:s.file,viewport:s.ui.viewport,pager:s.ui.pager,dialog:s.ui.dialog,error:s.ui.error})),note:'The frozen reference covers common pager/dialog components, not the document content or Android system bars. Browser app coordinates and component hashes match. Native raw screenshots use a different CSS viewport and are preserved in full; no whole-screen pixel identity is claimed.'},null,2))
const samples=initial.samples.map(s=>{const values=s.dalvikHeapLine?.trim().split(/\s+/).slice(2).map(Number);assert.equal(values?.length,7);return{...s,dalvikHeapSizeKiB:values[4],dalvikAllocatedKiB:values[5],dalvikFreeKiB:values[6]}})
const memory={scope:'Debug x86_64 main process, sampled with adb dumpsys meminfo during instrumented maximum-size write-plus-read. Sampling is not an absolute peak or whole-app budget; renderer/other devices and release performance are separate.',previous:(await read(raw+'/old-protocol-probe.json')).result,large:initial.large,maxObservedPayloadCharacters:Math.max(...initial.large.map(r=>r.maxPayload)),sampleCount:samples.length,maxSampledDalvikAllocatedKiB:Math.max(...samples.map(s=>s.dalvikAllocatedKiB)),samples,initialUIReview:'Initial UI actions began after a fixed 1.5 s render wait and before large-record restoration finished. Those images do not prove restoration. The separate cold-resume run explicitly waits for the restored query/anchor; expected and actual scroll are equal.',coldResume:cold.coldResume,groups:{initial:initial.checks.length,coldResume:cold.checks.length},remaining:['No full process/renderer or ARM/OEM memory acceptance','No physical power-loss/full-disk injection','Abrupt process termination during temp-file commit can leave a random uncommitted temp file; no auto-cleanup is performed','TalkBack and native accessibility gap remain separate']}
assert.ok(memory.maxObservedPayloadCharacters<23000);assert.equal(memory.coldResume.actual.scroll,memory.coldResume.expected.scroll)
await writeFile(out+'/memory-summary.json',JSON.stringify(memory,null,2))
const source=[]
for(const file of ['src/mobile/metadataTransport.ts','src/mobile/storage.ts','src/mobile/SourceReader.vue','src/mobile/SourcePager.vue','src/mobile/MobileSourcePageDialog.vue','src-tauri/plugins/mobile-storage/src/lib.rs','src-tauri/plugins/mobile-storage/src/metadata.rs','src-tauri/plugins/mobile-storage/Cargo.toml','src-tauri/plugins/mobile-storage/android/src/main/java/StoragePlugin.kt','src-tauri/gen/android/app/src/main/java/com/longyuye/mdreader/mobile/dev/MainActivity.kt','src-tauri/Cargo.lock','src-tauri/tauri.android.conf.json','dist/mobile.html',...(await readdir('dist/assets')).filter(n=>/^mobile-.*\.(js|css)$/.test(n)).map(n=>'dist/assets/'+n)]){
 const bytes=await readFile(file);source.push({file,bytes:bytes.length,sha256:sha(bytes)})
}
await writeFile(out+'/candidate-source.json',JSON.stringify({note:'Recorded after final builds; app source was unchanged during browser/native verification. Build records retain the actual base commit and dirty state.',source},null,2))
for(const abi of ['x86_64','aarch64']){
 for(const name of ['build-record.json','tauri-build.log','gradle-build.log'])await copy('release-artifacts/mobile-debug/'+abi+'/'+name,abi+'-'+name,'build')
 const build=await read('release-artifacts/mobile-debug/'+abi+'/build-record.json'),apk='release-artifacts/mobile-debug/'+abi+'/'+(abi==='x86_64'?'app-x86_64-debug.apk':'app-arm64-debug.apk')
 assert.equal(sha(await readFile(apk)),build.sha256);await copy('release-artifacts/mobile-debug/archive/1002049-before-metadata-chunks/'+abi+'/build-record.json',abi+'-previous-build-record.json','build')
}
for(const record of await read(raw+'/previous-artifact-archive.json'))assert.equal(sha(await readFile('release-artifacts/mobile-debug/archive/1002049-before-metadata-chunks/'+record.abi+'/'+record.file)),record.sha256)
await copy(raw+'/packaging/verification.json','packaging.json','record')
const python=spawnSync('python',['-c',`import hashlib,json,sys,tarfile
from pathlib import Path
r=Path(sys.argv[1]);before=json.loads((r/'baseline.json').read_text(encoding='utf-8'))
with tarfile.open(r/'closeout-private.tar') as t:
 actual={m.name:hashlib.sha256(t.extractfile(m).read()).hexdigest() for m in t.getmembers() if m.isfile() and m.name.startswith(('files/','shared_prefs/'))}
assert set(actual)==set(before['files'])
changes=[{'file':p,'before':h,'after':actual[p]} for p,h in before['files'].items() if actual[p]!=h]
assert {c['file'] for c in changes}=={'files/profileInstalled','shared_prefs/AwOriginVisitLoggerPrefs.xml'}
print(json.dumps({'scope':'Preserved first failed closeout TAR, before verified daily-cache restoration','files':len(actual),'changes':changes}))
`,raw],{maxBuffer:1024*1024});assert.equal(python.status,0,python.stderr?.toString())
await writeFile(out+'/first-closeout-diff.json',JSON.stringify(JSON.parse(python.stdout),null,2))
const rawFiles=[]
async function inventory(path,prefix=''){for(const item of await readdir(path,{withFileTypes:true})){const name=prefix+item.name;if(!prefix&&name.startsWith('preview-server-'))continue;if(item.isDirectory())await inventory(path+'/'+item.name,name+'/');else{const bytes=await readFile(path+'/'+item.name);rawFiles.push({file:name,bytes:bytes.length,sha256:sha(bytes)})}}}
await inventory(raw);await writeFile(out+'/raw-manifest.json',JSON.stringify({root:raw,note:'Complete raw evidence including private TARs and large probes stays in the ignored directory. Live preview-server logs are excluded from the frozen manifest. Selected reports, logs and original PNGs are copied here without pixel changes.',files:rawFiles},null,2))
await writeFile(out+'/manifest.json',JSON.stringify(manifest,null,2))
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
const figure=(file,label)=>`<figure><a href="${encodeURI(file)}"><img loading="lazy" src="${encodeURI(file)}" alt="${esc(label)}"></a><figcaption>${esc(label)}</figcaption></figure>`
const groups=[['Android最终：明确等待位置恢复','android-final'],['浏览器：正常、失败重试、短屏与大字','source'],['PDF阅读设置','pdf-settings'],['PDF书签','pdf-bookmarks'],['首轮：渲染后提前操作，不能作为恢复确认','android-initial']]
await writeFile(out+'/review.html',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>元数据分块 · 实页与内存核对</title><style>body{font:16px/1.65 system-ui;margin:24px;background:#fcfcf8;color:#263a30}h1{font-size:24px}a{color:#245d43}nav,.grid{display:flex;gap:20px;flex-wrap:wrap}figure{margin:0;width:min(390px,100%)}img{width:100%;height:auto;border:1px solid #d5ddd1}figcaption{overflow-wrap:anywhere}p{max-width:1000px}pre{white-space:pre-wrap}</style><h1>本机元数据分块 · 实页核对</h1><p>保持原有阅读页与按需操作层。五类记录在原预算上限完整写入、读回；发送块最大${memory.maxObservedPayloadCharacters}字符。原Java堆错误及失败记录保留。原生冷启动明确恢复第10段、第三个命中和滚动${cold.coldResume.actual.scroll}，然后验证失败重试和逐层Back。极限往返约6–8秒来自带采样的开发模拟器，不是发行性能指标。</p><nav><a href="memory-summary.json">内存与范围</a><a href="browser-summary.json">41组实页＋8组组件</a><a href="alignment.json">设计几何对照</a><a href="closeout-final.json">175文件／302提供器保护</a><a href="closeout-origin-cache.json">日期缓存核对</a><a href="raw-manifest.json">完整原始证据索引</a></nav><h2>冻结稿与同尺寸实页</h2><p>冻结稿只覆盖共用分页／定位组件；正文是示意内容。浏览器分页坐标、组件摘要和定位层尺寸匹配；28px预览条造成的弹窗居中差异单列。Android使用不同CSS视口，保留整屏原图。</p><div class="grid">${figure('../../design/mobile-native-source-position-v1/revision-root/design-jump.png','接入前冻结的定位组件')}${figure('source-jump-dark.png','实际浏览器定位层，深色状态差异保留')}</div>${groups.map(([title,kind])=>`<h2>${title}</h2><div class="grid">${manifest.filter(i=>i.kind===kind&&i.file.endsWith('.png')).map(i=>figure(i.file,i.file)).join('')}</div>`).join('')}<h2>保留的失败与未验收项</h2><p>首轮浏览器预览服务未启动；旧PDF脚本仍查找旧入口，后使用现有新版任务脚本；第一次严格收尾发现WebView日期缓存更新，逐XML节点核对后从基线TAR恢复。相关报告、原图和日志保留。原生无障碍、TalkBack、ARM实体机、完整进程／渲染器内存、低空间与掉电仍需验收；原生程序崩溃可能留下随机未提交临时文件，未自动清理。</p></html>`)
console.log(JSON.stringify({out,copied:manifest.length,productionGroups:summary.productionGroups,componentGroups:summary.componentGroups,scans:summary.automaticScans,memorySamples:memory.sampleCount,maxSampledDalvikAllocatedKiB:memory.maxSampledDalvikAllocatedKiB}))
} catch(error) {
 await writeFile(out+'/archive-failure.json',JSON.stringify({time:new Date().toISOString(),raw,out,error:String(error.stack||error),partialPreserved:true},null,2))
 throw error
}
