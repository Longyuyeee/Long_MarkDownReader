// Full device captures and read-only observations. The sole preparation mode
// creates one absent synthetic file through native IPC in a disposable AVD.
import assert from 'node:assert/strict'
import {mkdir,access,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {mobileAdb as adb,mobileTestPackage as app,connectMobileWebView} from './mobile-native-webview-cdp.mjs'
import {markdownV3Name,markdownV3Source} from './fixtures/mobile-markdown-v3.mjs'
const [mode,stage]=process.argv.slice(2),out=process.env.LONGEDIT_MARKDOWN_NATIVE_OUTPUT||'docs/evidence/mobile-0.1.0/markdown-v3-2026-11-05/native'
assert.ok(['baseline','observe','prepare','closeout'].includes(mode));assert.match(stage||'',/^[a-z0-9-]+$/)
await mkdir(out,{recursive:true});await assert.rejects(access(`${out}/${stage}.json`))
const sha=b=>createHash('sha256').update(b).digest('hex')
const hashes=(pkg,folders)=>Object.fromEntries(adb('exec-out','run-as',pkg,'find',...folders,'-type','f','-exec','sha256sum','{}',';').toString().trim().split(/\r?\n/).filter(Boolean).map(line=>{const m=/^([a-f0-9]{64})  (.+)$/.exec(line);assert.ok(m,line);return[m[2],m[1]]}))
const report={mode,stage,time:new Date().toISOString(),scope:'API29 / WebView124 x86_64 read-only AVD. Full raw screen; read-only CDP observations are not native AX or TalkBack acceptance. Fixture preparation is not UI evidence.',passed:false};let c
try{
 assert.equal(adb('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(adb('shell','getprop','sys.boot_completed').toString().trim(),'1')
 if(mode==='baseline'||mode==='closeout')adb('shell','am','force-stop',app)
 report.files=hashes(app,['files','shared_prefs']);report.provider=hashes('com.longyuye.mdreader.storagefixture',['files'])
 const apkPath=adb('shell','pm','path',app).toString().trim().replace(/^package:/,'');report.apkSha256=adb('shell','sha256sum',apkPath).toString().split(/\s/)[0]
 if(mode==='baseline'){
  await writeFile(out+'/'+stage+'-private.tar',adb('exec-out','run-as',app,'tar','-cf','-','files','shared_prefs','app_webview'))
  await writeFile(out+'/'+stage+'-provider.tar',adb('exec-out','run-as','com.longyuye.mdreader.storagefixture','tar','-cf','-','files'))
  assert.equal(report.apkSha256,'f7464ac527ba3328ee40c6119ec1d601ff55767cb482f45884c10f91f0ec639f')
 }else{
  const baseline=JSON.parse(await readFile(out+'/baseline.json','utf8')),build=JSON.parse((await readFile('release-artifacts/mobile-debug/x86_64/build-record.json','utf8')).replace(/^\uFEFF/,''));report.build=build;assert.equal(report.apkSha256,build.sha256)
  assert.deepEqual(report.provider,baseline.provider)
  for(const[name,hash]of Object.entries(baseline.files))if(name.startsWith('files/library/')||name.startsWith('files/drafts-v1/'))assert.equal(report.files[name],hash,'Existing source/draft bytes changed: '+name)
  report.existingSourcesAndDraftsUnchanged=true
 }
 if(mode==='prepare'){
  c=await connectMobileWebView();const entries=await c.invoke({op:'list',rootId:'local',relativePath:''});assert.equal(entries.truncated,false);assert.ok(!entries.entries.some(e=>e.relativePath===markdownV3Name),'Fixture path already exists')
  report.preparation=await c.invoke({op:'write',rootId:'local',relativePath:markdownV3Name,content:markdownV3Source,expectedSignature:null})
  assert.equal((await c.invoke({op:'read',rootId:'local',relativePath:markdownV3Name})).content,markdownV3Source)
  report.fixtureSha256=sha(Buffer.from(markdownV3Source));report.preparationOnly=true
 }
 if(mode==='observe'){
  await writeFile(out+'/'+stage+'.png',adb('exec-out','screencap','-p'))
  adb('shell','uiautomator','dump','/sdcard/longedit-markdown-v3.xml');await writeFile(out+'/'+stage+'.xml',adb('exec-out','cat','/sdcard/longedit-markdown-v3.xml'))
  const ime=adb('shell','dumpsys','input_method').toString();await writeFile(out+'/'+stage+'-ime.txt',ime);report.ime=ime.split(/\r?\n/).filter(l=>/mInputShown|mIsInputViewShown|mShowRequested|mCurMethodId/.test(l)).map(l=>l.trim())
  c=await connectMobileWebView();report.page=await c.evaluate(()=>({url:location.href,width:innerWidth,height:innerHeight,scale:devicePixelRatio,theme:document.querySelector('.mobile-app')?.className,text:document.body.innerText,overflow:document.documentElement.scrollWidth>innerWidth,geometry:Object.fromEntries(['.reader-header','.markdown-edit-fab','.editor-footer','.bottom-sheet','.cm-editor'].map(s=>[s,document.querySelector(s)?.getBoundingClientRect().toJSON()||null])),buttons:[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().height&&!e.closest('[inert]')).map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),rect:e.getBoundingClientRect().toJSON()}))}));assert.equal(report.page.overflow,false)
  const tree=await c.command('Page.getFrameTree',{}),child=tree.frameTree.childFrames?.find(f=>f.frame.url==='about:srcdoc')
  report.readerVisible=await c.evaluate(()=>!!document.querySelector('iframe.mobile-reader')?.getBoundingClientRect().height)
  if(child&&report.readerVisible){
   const world=await c.command('Page.createIsolatedWorld',{frameId:child.frame.id,worldName:'markdown-v3-read-only',grantUniveralAccess:false})
   const r=await c.command('Runtime.evaluate',{contextId:world.executionContextId,expression:`(${()=>({y:scrollY,viewport:innerHeight,height:document.documentElement.scrollHeight,fontReady:document.fonts.check('700 28px LongEditReadingSerif'),background:getComputedStyle(document.body).backgroundColor,bodyFont:getComputedStyle(document.body).fontFamily,title:document.querySelector('h1')?.textContent,table:!!document.querySelector('.reader-table-scroll'),syntax:document.querySelectorAll('[class^=reader-syntax-]').length,code:document.querySelector('pre code')?.textContent,copyStatus:document.querySelector('.reader-code-status')?.textContent,selection:getSelection()?.toString(),overflow:document.documentElement.scrollWidth>innerWidth,geometry:Object.fromEntries(['h1','blockquote','.reader-table-scroll','.reader-code-block','[data-longedit-copy-code]'].map(s=>[s,document.querySelector(s)?.getBoundingClientRect().toJSON()||null]))})})()`,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));report.reader=r.result.value;assert.equal(report.reader.overflow,false)
  }
  await writeFile(out+'/'+stage+'-window.txt',adb('shell','dumpsys','window','windows'))
 }
 report.passed=true
}catch(error){report.failure=String(error.stack||error);process.exitCode=1}finally{c?.close();await writeFile(out+'/'+stage+'.json',JSON.stringify(report,null,2))}
console.log(JSON.stringify({stage,passed:report.passed,files:Object.keys(report.files||{}).length,page:report.page?{theme:report.page.theme,width:report.page.width,height:report.page.height,text:report.page.text.slice(0,500)}:undefined,reader:report.reader,failure:report.failure},null,2))
