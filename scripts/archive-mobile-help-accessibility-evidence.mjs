import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,readdir,copyFile,access,stat} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {parse} from '@vue/compiler-sfc'
const raw='docs/evidence/mobile-0.1.0/native-accessibility-followup-2026-10-30',out=process.argv[2]||'docs/evidence/mobile-native-help-accessibility-2026-10-30',design='docs/design/mobile-native-accessibility-v1/prototype'
const sha=b=>createHash('sha256').update(b).digest('hex'),read=async f=>JSON.parse((await readFile(f,'utf8')).replace(/^\uFEFF/,''))
await assert.rejects(access(out));await mkdir(out);const manifest=[]
try{
 await writeFile(out+'/.gitattributes','*.png -text -diff\n*.json -text -diff\n*.log -text -diff\n*.xml -text -diff\n*.txt -text -diff\n')
 await writeFile(out+'/.gitignore','!*.log\n')
 async function copy(source,name,kind){await copyFile(source,out+'/'+name);const bytes=await readFile(out+'/'+name);assert.equal(sha(bytes),sha(await readFile(source)));manifest.push({file:name,source,kind,bytes:bytes.length,sha256:sha(bytes)})}
 const baseline=await read(raw+'/baseline.json'),closeout=await read(raw+'/closeout-final.json'),basic=await read(raw+'/talkback-basic.json'),library=await read(raw+'/talkback-library.json'),short=await read(raw+'/native-short-settled.json'),control=await read(raw+'/control-help-prototypes-recreated.json'),freeze=await read(design+'/freeze.json')
 assert.equal(closeout.passed,true);assert.equal(library.passed,true);assert.equal(short.passed,true);assert.equal(control.passed,true);assert.equal((await read(raw+'/emulator-closeout.json')).stopped,true)
 assert.equal(basic.passed,false);assert.equal(basic.checks.length,2);assert.match(basic.failure,/Unique visible native button required: 资料/)
 for(const name of await readdir(raw)){
  const path=raw+'/'+name
  if((await stat(path)).isFile()&&/\.(json|png|xml|txt|log)$/.test(name)&&(await stat(path)).size<1024*1024)await copy(path,name,name.endsWith('.png')?'android':'record')
 }
 const browsers=[
  ['help',raw+'/browser-help-body-final','production-and-component'],
  ['appearance',raw+'/browser-appearance','production'],
  ['source',raw+'/browser-source','production'],
  ['settings','docs/evidence/mobile-0.1.0/settings-pages-candidate-1793326804647','production'],
  ['help-first',raw+'/browser-help-body','failed-timing'],
  ['help-second',raw+'/browser-help-body-settled','failed-fixture-title']
 ],reports=[]
 for(const [label,path,scope]of browsers){
  const r=await read(path+'/report.json');if(!scope.startsWith('failed'))assert.equal(r.passed,true,label)
  reports.push({label,path,scope,passed:r.passed,groups:r.checks.length,componentTopics:r.componentTopics??[],scans:r.scans??[],failure:r.failure??null})
  for(const name of await readdir(path))if(/\.(png|json)$/.test(name))await copy(path+'/'+name,label+'-'+name,name.endsWith('.png')?'browser-'+label:'record')
 }
 const good=reports.filter(r=>r.passed),scans=good.flatMap(r=>r.scans.map(s=>({...s,report:r.label})))
 const browser={productionGroups:good.reduce((n,r)=>n+r.groups,0),componentTopics:good.flatMap(r=>r.componentTopics),automaticScans:scans.length,automaticViolations:scans.reduce((n,s)=>n+s.violations.length,0),incompleteCollected:scans.filter(s=>Object.hasOwn(s,'incomplete')).length,incompleteNonEmpty:scans.filter(s=>s.incomplete?.length),reports}
 assert.equal(browser.productionGroups,31);assert.equal(browser.componentTopics.length,46);assert.equal(browser.automaticViolations,0)
 await writeFile(out+'/browser-summary.json',JSON.stringify(browser,null,2))
 const previous=parse(await readFile(design+'/before.vue','utf8')).descriptor,current=parse(await readFile('src/mobile/MobileHelpHost.vue','utf8')).descriptor
 assert.equal(previous.scriptSetup.content.replaceAll('../../../../src/mobile/','./'),current.scriptSetup.content)
 assert.deepEqual(previous.styles.map(s=>s.content),current.styles.map(s=>s.content))
 const old=await read(raw+'/axf-tb-help-old-2.native.json'),next=await read(raw+'/axf-new-basic-appearance-text-1.native.json')
 const oldBody=old.nodes.find(n=>n.text==='外观说明内容'),newBody=next.nodes.find(n=>n.text.startsWith('跟随系统会随系统深浅色变化'))
 assert.ok(oldBody?.accessibilityFocused&&newBody?.accessibilityFocused);assert.equal(oldBody.bounds,newBody.bounds)
 const dialog=tree=>tree.nodes.find(n=>n.class==='android.app.Dialog'&&n.text==='外观说明'),close=tree=>tree.nodes.find(n=>n.text==='关闭说明')
 assert.equal(dialog(old).bounds,dialog(next).bounds);assert.equal(close(old).bounds,close(next).bounds)
 const python=spawnSync('python',['-c',`import json,sys
from pathlib import Path
from PIL import Image
r=Path(sys.argv[1]);d=Path(sys.argv[2])
def compare(a,b,rect=None):
 a=Image.open(a).convert('RGBA');b=Image.open(b).convert('RGBA')
 assert a.size==b.size
 left,top,right,bottom=rect or (0,0,a.width,a.height);right=min(right,a.width);bottom=min(bottom,a.height)
 av,bv=a.load(),b.load();count=0;bounds=None
 for y in range(top,bottom):
  for x in range(left,right):
   if av[x,y]!=bv[x,y]:
    count+=1
    bounds=[x,y,x+1,y+1] if bounds is None else [min(bounds[0],x),min(bounds[1],y),max(bounds[2],x+1),max(bounds[3],y+1)]
 return {'differentPixels':count,'comparedPixels':(right-left)*(bottom-top),'differentBounds':bounds,'region':[left,top,right,bottom]}
result={'method':'Read-only full original PNGs. Fixed rectangle counts only; no cropped, masked or redrawn image files are generated.','prototype':[]}
for topic,width,scale in [('appearance',390,1),('library',390,1),('library',320,2)]:
 result['prototype'].append({'topic':topic,'width':width,'scale':scale,**compare(d/f'before-{topic}-{width}-{scale}.png',d/f'candidate-{topic}-{width}-{scale}.png')})
result['nativeDialog']=compare(r/'axf-tb-help-old-2.png',r/'axf-new-basic-appearance-text-1.png',[0,1669,1080,2148])
print(json.dumps(result))
`,raw,design],{maxBuffer:1024*1024});assert.equal(python.status,0,python.stderr?.toString())
 const pixels=JSON.parse(python.stdout)
 const actual=await read(raw+'/browser-help-body-final/report.json')
 await writeFile(out+'/alignment.json',JSON.stringify({stylesUnchanged:true,focusLogicUnchanged:true,prototype:freeze.screens,production:actual.alignment,native:{oldBody:oldBody.bounds,newBody:newBody.bounds,dialog:dialog(next).bounds,close:close(next).bounds,oldAccessibleText:oldBody.text,newAccessibleText:newBody.text},pixels,note:'Prototype background is illustrative. Normal prototype PNGs are identical; the 200% short prototype keeps equal rectangles but has a small top/background edge difference, retained explicitly. Native images preserve system bars and real TalkBack green focus. No whole-screen cross-platform pixel identity is claimed.'},null,2))
 const native={scope:'Verified help-text and Back tasks, not complete native accessibility acceptance.',beforeTextAssertion:(await read(raw+'/axf-help-body-before.json')).assertionsPassed,oldTalkBack:await read(raw+'/tb-old-help-traversal.json'),independentControl:control,basic:{passed:basic.passed,completedChecks:basic.checks,laterFailure:basic.failure},library,short,knownRemaining:'The service misses remounted header/footer nodes even when a real TalkBack green frame reaches Settings. Its snapshot has no accessibilityFocused node at that moment. This cache/provider discrepancy remains unresolved.',data:{beforeFiles:Object.keys(baseline.files).length,afterFiles:Object.keys(closeout.files).length,providerBefore:Object.keys(baseline.provider).length,providerAfter:Object.keys(closeout.provider).length,newSnapshotFiles:closeout.newProviderFiles.length},settings:await read(raw+'/settings-closeout.json')}
 assert.equal(native.beforeTextAssertion,false);assert.equal(native.data.newSnapshotFiles,65)
 await writeFile(out+'/native-summary.json',JSON.stringify(native,null,2))
 const source=[]
 for(const file of ['src/mobile/MobileHelpHost.vue','src/mobile/mobileHelp.ts','src/mobile/accessibility.ts','src/mobile/MobileApp.vue','src-tauri/gen/android/app/src/main/java/com/longyuye/mdreader/mobile/dev/MainActivity.kt','src-tauri/tauri.android.conf.json','dist/mobile.html',...(await readdir('dist/assets')).filter(n=>/^mobile-.*\.(js|css)$/.test(n)).map(n=>'dist/assets/'+n)]){const bytes=await readFile(file);source.push({file,bytes:bytes.length,sha256:sha(bytes)})}
 await writeFile(out+'/candidate-source.json',JSON.stringify({note:'Actual source and built assets after final APK builds; app source stayed unchanged during acceptance.',source},null,2))
 for(const abi of ['x86_64','aarch64']){
  for(const name of ['build-record.json','tauri-build.log','gradle-build.log'])await copy('release-artifacts/mobile-debug/'+abi+'/'+name,abi+'-'+name,'build')
  await copy('release-artifacts/mobile-debug/archive/1002049-before-help-accessibility/'+abi+'/build-record.json',abi+'-previous-build-record.json','build')
  const build=await read('release-artifacts/mobile-debug/'+abi+'/build-record.json');assert.equal(sha(await readFile('release-artifacts/mobile-debug/'+abi+'/'+(abi==='x86_64'?'app-x86_64-debug.apk':'app-arm64-debug.apk'))),build.sha256)
 }
 for(const record of await read(raw+'/previous-artifact-archive.json'))assert.equal(sha(await readFile('release-artifacts/mobile-debug/archive/1002049-before-help-accessibility/'+record.abi+'/'+record.file)),record.sha256)
 await copy(raw+'/packaging/verification.json','packaging.json','record')
 const rawFiles=[]
 async function inventory(path,prefix=''){for(const item of await readdir(path,{withFileTypes:true})){if(item.isDirectory())await inventory(path+'/'+item.name,prefix+item.name+'/');else{const bytes=await readFile(path+'/'+item.name);rawFiles.push({file:prefix+item.name,bytes:bytes.length,sha256:sha(bytes)})}}}
 await inventory(raw);await writeFile(out+'/raw-manifest.json',JSON.stringify({root:raw,note:'Private TARs, APKs, helper binary and complete original observations remain in the ignored local evidence directory.',files:rawFiles},null,2))
 await writeFile(out+'/manifest.json',JSON.stringify(manifest,null,2))
 const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),figure=(file,label)=>`<figure><a href="${encodeURI(file)}"><img loading="lazy" src="${encodeURI(file)}" alt="${esc(label)}"></a><figcaption>${esc(label)}</figcaption></figure>`
 const images=[
  ['原生改前／改后：同一外形，焦点文本恢复',[['axf-tb-help-old-2.png','改前：焦点节点只有“外观说明内容”'],['axf-new-basic-appearance-text-1.png','改后：焦点节点包含完整说明段落']]],
  ['多段说明与逐层返回',[['axf-new-library-library-text-1.png','资料库说明：原生TalkBack正文焦点'],['axf-new-basic-theme-return.png','Back关闭说明后回问号'],['axf-new-basic-appearance-return.png','再Back回主题入口']]],
  ['实际横屏、系统两倍字号',[['settled-short-scroll-before.png','Tab进入可滚动正文，关闭按钮保持可见'],['settled-short-scroll-after.png','PageDown继续阅读，正文／关闭位置保持']]],
  ['浏览器实际页面',[['help-library-normal.png','普通说明：与冻结组件尺寸一致'],['help-library-short-end.png','320×372／200%：键盘滚动到末尾'],['help-appearance-nested.png','主题选择中的说明']]],
  ['仍存在的节点采集差异',[['axf-new-settings-walk-6.png','真实TalkBack绿框到设置导航，辅助服务树仍缺该节点']]]
 ]
 for(const [,items]of images)for(const [file]of items)await access(out+'/'+file)
 await writeFile(out+'/review.html',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>问号说明 · 原生读屏与实页核对</title><style>*{box-sizing:border-box}body{font:16px/1.65 system-ui;margin:24px;background:#fcfcf8;color:#263a30}h1{font-size:24px}a{color:#245d43}nav,.grid{display:flex;gap:20px;flex-wrap:wrap}p{max-width:1000px}figure{margin:0;width:min(390px,100%)}img{width:100%;height:auto;border:1px solid #d5ddd1}figcaption{overflow-wrap:anywhere}</style><h1>问号说明 · 正文恢复到原生读屏</h1><p>修复通用说明区以自定义名称替代正文的问题。保持问号入口、原有说明、滚动、焦点与外形；正文不移到常驻页面。原生旧包、独立WebView对照和新包TalkBack焦点分别留证。</p><nav><a href="alignment.json">设计／像素对照</a><a href="native-summary.json">原生任务与限制</a><a href="browser-summary.json">31组实页＋46主题</a><a href="closeout-final.json">175文件／302原提供器保护</a><a href="settings-closeout.json">系统设置恢复</a><a href="raw-manifest.json">完整证据索引</a></nav><h2>冻结的组件设计</h2><div class="grid">${figure('../../design/mobile-native-accessibility-v1/prototype/before-appearance-390-1.png','改前组件原型')}${figure('../../design/mobile-native-accessibility-v1/prototype/candidate-appearance-390-1.png','接入前候选，正常图稿PNG一致')}</div><p>CSS与焦点脚本没有变化。两组常规原型PNG一致，短屏原型仍有141个上沿／背景边缘像素差异，矩形相同，原图保留。实际浏览器有28px预览条，组件纵向偏移单列；Android完整截图保留真实系统栏和绿色读屏焦点。</p>${images.map(([title,items])=>`<h2>${title}</h2><div class="grid">${items.map(([file,label])=>figure(file,label)).join('')}</div>`).join('')}<h2>范围与失败记录</h2><p>原生初轮完成正文／返回检查后，脚本因找不到重挂载的资料导航节点而停止；后续资料库和横屏任务独立通过，不修改原失败。完整通用节点树、语音质量、真手指和ARM/OEM仍需验收。控制WebView的data URL被拦截、复用旧上下文、首轮字号恢复、浏览器滚动等待和组件页标题遗漏均保留原报告。临时TalkBack已卸载，设置恢复、sync并停止专用模拟器；应用无root依赖，只有测试按键使用模拟器已有su，adbd保持shell。</p></html>`)
 console.log(JSON.stringify({out,files:manifest.length,productionGroups:browser.productionGroups,componentTopics:browser.componentTopics.length,scans:browser.automaticScans,incompleteCollected:browser.incompleteCollected,provider:closeout.newProviderFiles.length,nativeDialogPixels:pixels.nativeDialog.differentPixels}))
}catch(error){await writeFile(out+'/archive-failure.json',JSON.stringify({time:new Date().toISOString(),error:String(error.stack||error),partialPreserved:true},null,2));throw error}
