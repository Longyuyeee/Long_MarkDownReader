import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import path from 'node:path'
import {compileMobileVuePrototype} from './compile-mobile-vue-prototype.mjs'
const folder='docs/design/mobile-native-accessibility-v1/prototype'
await assert.rejects(access(folder));await mkdir(folder,{recursive:true})
const original=await readFile('src/mobile/MobileHelpHost.vue','utf8')
const attribute=" role=\"region\" :aria-label=\"topic?.title + '内容'\""
assert.equal(original.split(attribute).length,2)
const candidate=original.replace(attribute,'')
const imports=path.relative(path.resolve(folder),path.resolve('src/mobile')).replaceAll('\\','/')
const cssFile=/href="([^"]+\.css)"/.exec(await readFile('dist/mobile.html','utf8'))[1].replace(/^\.\//,'dist/')
const css=await readFile(cssFile,'utf8'),sha=b=>createHash('sha256').update(b).digest('hex')
const record={time:new Date().toISOString(),scope:'Pre-integration code-native help component. The outer page is illustrative. Only scroll-body semantics change; styles, paragraphs and focus code are identical.',original:{file:'src/mobile/MobileHelpHost.vue',sha256:sha(original)},css:{file:cssFile,sha256:sha(css)},variants:[],screens:[]}
for(const [name,source]of [['before',original],['candidate',candidate]]){
 const sourceFile=folder+'/'+name+'.vue'
 await writeFile(sourceFile,source.replaceAll("from './","from '"+imports+"/"))
 const entry="import{createApp,h}from'vue';import Host from "+JSON.stringify('./'+sourceFile)+";import{mobileHelpState,openMobileHelp,dismissMobileHelp,mobileHelpTopics}from'./src/mobile/mobileHelp.ts';window.__topics=mobileHelpTopics;window.__open=topic=>openMobileHelp(topic,document.querySelector('#help-trigger'));window.__back=()=>dismissMobileHelp();createApp({render:()=>h('main',{class:'mobile-app'},[h('section',{class:'mobile-workspace',inert:!!mobileHelpState.value},[h('h1','我的资料'),h('button',{id:'help-trigger',onClick:()=>window.__open('appearance')},'资料库说明')]),h(Host)])}).mount('#app');window.__open('appearance');"
 const bundle=await compileMobileVuePrototype(entry)
 const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LongEdit help '+name+'</title><style>'+css+'\nhtml,body,#app{height:100%;margin:0}</style><div id="app"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script></html>'
 await writeFile(folder+'/'+name+'.html',html)
 record.variants.push({name,source:sourceFile,sourceSha256:sha(await readFile(sourceFile)),htmlSha256:sha(html),bundleSha256:sha(bundle)})
}
const require=createRequire(import.meta.url),{chromium}=require(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),browser=await chromium.launch({channel:'chrome',headless:true})
try{
 for(const variant of ['before','candidate']){
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'})
  await page.goto('file:///'+path.resolve(folder+'/'+variant+'.html').replaceAll('\\','/'));await page.locator('.mobile-help-dialog').waitFor()
  for(const [topic,width,height,scale]of [['appearance',390,844,1],['library',390,844,1],['library',320,372,2]]){
   await page.setViewportSize({width,height});await page.evaluate(({topic,scale})=>{document.documentElement.style.fontSize=16*scale+'px';window.__open(topic)},{topic,scale});await page.waitForTimeout(150)
   const name=variant+'-'+topic+'-'+width+'-'+scale+'.png';await page.screenshot({path:folder+'/'+name})
   record.screens.push({variant,topic,name,width,height,scale,sha256:sha(await readFile(folder+'/'+name)),dialog:await page.locator('.mobile-help-dialog').boundingBox(),body:await page.locator('.mobile-help-content').boundingBox()})
  }await page.close()
 }
}finally{await browser.close()}
await writeFile(folder+'/freeze.json',JSON.stringify(record,null,2));console.log(JSON.stringify({folder,variants:record.variants.length,screens:record.screens.length,appSourceUnmodified:sha(await readFile('src/mobile/MobileHelpHost.vue'))===record.original.sha256}))
