// Read-only observations on the dedicated development emulator. UI actions are
// performed separately from fresh observations; no app data or CSS is injected.
import assert from 'node:assert/strict'
import {mkdir,access,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {mobileAdb as adb,mobileTestPackage as app,connectMobileWebView} from './mobile-native-webview-cdp.mjs'
const [mode,stage,...expected]=process.argv.slice(2);assert.ok(['baseline','observe','closeout'].includes(mode));assert.match(stage||'',/^[a-z0-9-]+$/)
const out='docs/evidence/mobile-0.1.0/roots-v3-2026-11-05/native';await mkdir(out,{recursive:true});await assert.rejects(access(`${out}/${stage}.json`))
if(mode==='baseline'){assert.equal(stage,'baseline');for(const file of ['baseline-private.tar','baseline-provider.tar','baseline.apk','runtime-metadata-baseline.json'])await assert.rejects(access(out+'/'+file))}
assert.equal(adb('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(adb('shell','getprop','ro.build.version.sdk').toString().trim(),'29');assert.equal(adb('shell','getprop','sys.boot_completed').toString().trim(),'1')
const provider='com.longyuye.mdreader.storagefixture',sha=b=>createHash('sha256').update(b).digest('hex')
const hashes=(pkg,folders)=>Object.fromEntries(adb('exec-out','run-as',pkg,'find',...folders,'-type','f','-exec','sha256sum','{}',';').toString().trim().split(/\r?\n/).filter(Boolean).map(line=>{const m=/^([a-f0-9]{64})  (.+)$/.exec(line);assert.ok(m,line);return[m[2],m[1]]}))
const report={mode,stage,time:new Date().toISOString(),nativeAndroidTest:true,api:29,serial:'emulator-5558',scope:'Dedicated x86_64 emulator. Physical ARM device and TalkBack are not covered.',passed:false};let cdp
try{
 if(mode!=='observe')adb('shell','am','force-stop',app)
 report.files=hashes(app,['files','shared_prefs']);report.provider=hashes(provider,['files']);report.settings={}
 for(const[ns,key]of [['secure','enabled_accessibility_services'],['secure','accessibility_enabled'],['secure','touch_exploration_enabled'],['secure','default_input_method'],['secure','show_ime_with_hard_keyboard'],['secure','ui_night_mode'],['system','font_scale'],['system','accelerometer_rotation'],['system','user_rotation'],['global','wifi_on'],['global','mobile_data'],['global','webview_provider']])report.settings[ns+'/'+key]=adb('shell','settings','get',ns,key).toString().trim()
 report.night=adb('shell','cmd','uimode','night').toString().trim();report.recent=JSON.parse(adb('exec-out','run-as',app,'cat','files/recent-v1.json'));report.preferences=JSON.parse(adb('exec-out','run-as',app,'cat','files/preferences-v1.json'))
 const apkPath=adb('shell','pm','path',app).toString().trim().replace(/^package:/,'');report.apkSha256=adb('shell','sha256sum',apkPath).toString().split(/\s/)[0];report.package=adb('shell','dumpsys','package',app).toString().match(/versionCode=\d+[^\r\n]*/)?.[0]
 if(mode==='baseline'){
  await writeFile(out+'/baseline-private.tar',adb('exec-out','run-as',app,'tar','-cf','-','files','shared_prefs','app_webview'))
  await writeFile(out+'/baseline-provider.tar',adb('exec-out','run-as',provider,'tar','-cf','-','files'))
  await writeFile(out+'/baseline.apk',adb('exec-out','cat',apkPath))
  const xml=adb('exec-out','run-as',app,'cat','shared_prefs/AwOriginVisitLoggerPrefs.xml').toString(),normalized=xml.replace(/(<long name="sites_visited_weekly_time" value=")\d+/,'$1TIMESTAMP').replace(/(<string name="origins_visited_date">)[^<]+/,'$1DATE')
  await writeFile(out+'/runtime-metadata-baseline.json',JSON.stringify({tarSha256:sha(await readFile(out+'/baseline-private.tar')),normalizedAwOriginVisitLoggerPrefsSha256:sha(normalized)},null,2))
 }else{
  const before=JSON.parse(await readFile(out+'/baseline.json','utf8')),build=JSON.parse((await readFile('release-artifacts/mobile-debug/x86_64/build-record.json','utf8')).replace(/^\uFEFF/,''));report.build=build;assert.equal(report.apkSha256,build.sha256);report.changed=[]
  assert.deepEqual(Object.keys(report.files).sort(),Object.keys(before.files).sort())
  for(const[name,hash]of Object.entries(before.files))if(report.files[name]!==hash){
   report.changed.push(name)
   if(name==='files/profileInstalled'){
    const bytes=adb('exec-out','run-as',app,'cat',name);assert.equal(bytes.length,24);assert.equal(bytes.readUInt32BE(0),1)
    const stamp=new Date(Number(bytes.readBigInt64BE(8))).toISOString().slice(0,19).replace('T',' '),installed=/lastUpdateTime=(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(adb('shell','dumpsys','package',app).toString())?.[1];assert.equal(stamp,installed)
   }else if(name==='shared_prefs/AwOriginVisitLoggerPrefs.xml'){
    // WebView records its last visited day/week. Preserve the origin sets;
    // only the calendar fields may change when opening it on a later date.
    const runtime=JSON.parse(await readFile(out+'/runtime-metadata-baseline.json','utf8'));assert.equal(sha(await readFile(out+'/baseline-private.tar')),runtime.tarSha256)
    const xml=adb('exec-out','run-as',app,'cat',name).toString(),normalized=xml.replace(/(<long name="sites_visited_weekly_time" value=")\d+/, '$1TIMESTAMP').replace(/(<string name="origins_visited_date">)[^<]+/,'$1DATE')
    assert.equal(sha(normalized),runtime.normalizedAwOriginVisitLoggerPrefsSha256);report.webViewRuntimeCalendarChanged=true
   }else assert.fail('Prior app bytes changed: '+name)
  }
  assert.deepEqual(report.provider,before.provider);assert.deepEqual(report.settings,before.settings);assert.equal(report.night,before.night);assert.deepEqual(report.recent,before.recent);assert.deepEqual(report.preferences,before.preferences)
  if(mode==='closeout'){await writeFile(out+'/'+stage+'-private.tar',adb('exec-out','run-as',app,'tar','-cf','-','files','shared_prefs','app_webview'));await writeFile(out+'/'+stage+'-provider.tar',adb('exec-out','run-as',provider,'tar','-cf','-','files'))}
 }
 if(mode==='observe'){
  adb('shell','uiautomator','dump','/sdcard/longedit-roots-v3.xml');const xml=adb('exec-out','cat','/sdcard/longedit-roots-v3.xml').toString();await writeFile(out+'/'+stage+'.xml',xml);await writeFile(out+'/'+stage+'.png',adb('exec-out','screencap','-p'))
  report.nativeAccessibilityTextMatches=Object.fromEntries(expected.map(text=>[text,xml.includes(text)]))
  const ime=adb('shell','dumpsys','input_method').toString();await writeFile(out+'/'+stage+'-ime.txt',ime);report.ime=ime.split(/\r?\n/).filter(line=>/mInputShown|mIsInputViewShown|mShowRequested|mCurMethodId/.test(line)).map(line=>line.trim())
  cdp=await connectMobileWebView();report.page=await cdp.evaluate(()=>({url:location.href,width:innerWidth,height:innerHeight,scale:devicePixelRatio,font:getComputedStyle(document.body).fontFamily,text:([...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(e=>e.getBoundingClientRect().height&&!e.closest('[inert]')).at(-1)||document.querySelector('.mobile-main'))?.innerText,focus:{text:document.activeElement?.textContent?.slice(0,160),label:document.activeElement?.getAttribute('aria-label'),tag:document.activeElement?.tagName},geometry:Object.fromEntries(['.library-page-header','.file-row','.search-field','.search-result','.phone-page-header','.setting-row','.bottom-navigation','.bottom-sheet'].map(s=>[s,document.querySelector(s)?.getBoundingClientRect().toJSON()||null])),inputs:[...document.querySelectorAll('input')].filter(e=>e.getBoundingClientRect().height).map(e=>({label:e.getAttribute('aria-label'),value:e.value,focused:e===document.activeElement})),overflow:document.documentElement.scrollWidth>innerWidth}));assert.equal(report.page.overflow,false);for(const text of expected)assert.ok(report.page.text?.includes(text),'Actual WebView task text missing: '+text);report.textAssertionSource='Read-only DOM of the installed Android WebView; Android UIAutomator tree is saved separately and is not a TalkBack acceptance oracle';await writeFile(out+'/'+stage+'-webview.txt',adb('shell','dumpsys','webviewupdate'))
 }
 report.passed=true
}catch(error){report.failure=String(error.stack||error);process.exitCode=1}finally{cdp?.close();await writeFile(out+'/'+stage+'.json',JSON.stringify(report,null,2))}
console.log(JSON.stringify({stage,passed:report.passed,files:Object.keys(report.files||{}).length,provider:Object.keys(report.provider||{}).length,changed:report.changed,ime:report.ime,page:report.page?{...report.page,text:report.page.text?.slice(0,300)}:undefined,failure:report.failure},null,2))
