import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = resolve(process.env.FULL_WINDOW_OUTPUT || `.release-secrets/ui-global-review/${process.argv.includes('--variants') ? 'variants' : 'final'}`)
await mkdir(output, { recursive: true })
const cases = [
  ['workspace','工作台','workflow-redesign','.workspace-content','page'],
  ['inbox','收集箱','workflow-redesign','.inbox-browser','page','inbox=1'],
  ['library','资料库与 Markdown','library-shell','.vditor-content','page'],
  ['temp','独立 Markdown','temp-redesign','.vditor-content','external'],
  ['text','文本编辑','text-redesign','.editor-stage','embedded'],
  ['json','JSON','json-redesign','.json-main','embedded'],
  ['yaml','YAML','yaml-redesign','.yaml-stage','embedded'],
  ['xml','XML 与 SVG','xml-redesign','.stage','embedded'],
  ['toml','TOML','toml-redesign','.toml-workspace main','embedded'],
  ['log','日志','log-redesign','.log-stage','embedded'],
  ['drawio','draw.io','drawio-redesign','.stage','embedded'],
  ['docx','DOCX','docx-redesign','.docx-stage','embedded'],
  ['odt','ODT','odt-redesign','.odt-stage','embedded'],
  ['odf','开放文档阅读','odf-redesign','.sheet-stage,.slide-stage','embedded'],
  ['pptx','PPTX','pptx-redesign','.slide-stage','embedded'],
  ['external-office','外部应用打开','office-handoff','main','page'],
  ['legacy-office','旧格式转换','office-handoff','main','page','legacy=1'],
  ['quick-note','快速笔记','quick-note-direct','textarea','page'],
  ['graph','知识图谱','graph-redesign','.graph-container > canvas','page'],
  ['canvas','Canvas','canvas-redesign','.canvas-viewport','embedded'],
  ['pdf','PDF','pdf-redesign','.pdf-workspace','embedded'],
  ['table','Table','table-redesign','.table-workspace','embedded'],
  ['workbook','XLSX','workbook-save','.workbook-main','embedded'],
  ['diagram','Mermaid','diagram-redesign','.studio-workspace','embedded'],
  ['mindmap','思维导图','mindmap-redesign','.map-panel,.outline-panel','embedded'],
  ['media','图片与音视频','media-redesign','.media-stage','embedded'],
  ['settings','设置','settings-redesign','.settings-content','page'],
  ['capabilities','格式能力','capabilities-redesign','.release-content','page'],
]
const variants = [
  ...[['outline','大纲'],['quick','最近与收藏'],['collections','智能集合'],['tags','文内标签'],['links','文档关系'],['history','历史与差异']].map(([key,label])=>['sidebar-'+key,label,'library-shell','#panel-'+key,'page','sidebar='+key]),
  ...[['看板','board'],['图表','chart'],['仪表盘','dashboard']].map(([label,key])=>['table-'+key,'Table '+label,'table-redesign','.table-workspace','embedded','tableView='+encodeURIComponent(label)]),
  ...Array.from({length:7},(_,i)=>['settings-'+(i+1),'设置分类 '+(i+2),'settings-redesign','.settings-content','page','categoryIndex='+(i+1)]),
]
if (process.argv.includes('--variants')) cases.splice(0,cases.length,...variants)
const sizes = [{ id:'large',width:1920,height:1080 }, { id:'normal',width:1000,height:700 }, { id:'small',width:800,height:600 }, { id:'compact',width:640,height:480 }]
const only = process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',')
const selected = cases.filter(([id])=>!only || only.includes(id))
const styles = process.argv.includes('--styles') ? ['soft','neo','glass','airy','minimal','sharp'] : ['minimal']
const browser = await chromium.launch({ headless:true,channel:process.env.LONGEDIT_BROWSER_CHANNEL || undefined,args:['--no-proxy-server'] })
const report = []
try {
  for (const [id,label,fixture,primary,surface,query=''] of selected) {
    const page = await browser.newPage({viewport:sizes[0]})
    const errors=[]; page.on('pageerror',error=>errors.push(error.message))
    await page.route('**/scripts/fixtures/vditor/**',route=>route.continue({url:route.request().url().replace('/scripts/fixtures/vditor/','/vditor/')}))
    console.log(`Full window: ${id}`)
    await page.goto(`http://127.0.0.1:15941/scripts/fixtures/full-window-review-browser.html?fixture=${fixture}&surface=${surface}&${query}`,{waitUntil:'domcontentloaded',timeout:90000})
    await page.waitForFunction(()=>window.fullWindowAudit?.ready,undefined,{timeout:60000})
    if (id==='library'||id==='temp') await page.locator('.vditor-wysiwyg [contenteditable="true"]').first().waitFor({timeout:30000})
    await page.waitForTimeout(500)
    const variantParams = new URLSearchParams(query)
    const sidebar = variantParams.get('sidebar')
    if (sidebar) await page.locator('#tab-'+sidebar).click()
    if (variantParams.has('tableView')) await page.locator('.view-tab-main').filter({hasText:variantParams.get('tableView')}).click()
    if (variantParams.has('categoryIndex')) await page.locator('.settings-navigation button').nth(Number(variantParams.get('categoryIndex'))).click()
    const layouts=[]
    for (const size of sizes) for (const style of styles) {
      await page.setViewportSize(size)
      await page.evaluate(async style=>{const store=window.fullWindowAudit.store;store.visualStyle=style;store.theme=style==='neo'?'dark':'white';await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)},style)
      await page.waitForTimeout(style===styles[0]?460:80)
      if (sidebar && await page.getByRole('button',{name:'导航',exact:true}).getAttribute('aria-expanded')==='false') {
        await page.getByRole('button',{name:'导航',exact:true}).click(); await page.waitForTimeout(460)
      }
      const metrics = await page.evaluate(selector=>{
        const visible=el=>{if(!el.getClientRects().length || getComputedStyle(el).visibility==='hidden')return false;for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope > summary')?.contains(el))return false;return true}
        const root=document.querySelector('.app-route-content')
        const region=[...document.querySelectorAll(selector)].find(visible)||[...document.querySelectorAll('main,.editor-viewport,.workspace-management-content')].find(visible)
        const compact=rect=>rect?{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)}:null
        const clipControls=[];const covered=[]
        for(const el of document.querySelectorAll('button,a[href],input,select,[role="tab"]')){
          if(!visible(el)||el.closest('[inert],[aria-hidden="true"],.map-canvas,.canvas-world')||el.disabled)continue
          const r=el.getBoundingClientRect();if(r.width<8||r.height<8)continue
          let clip={left:0,top:0,right:innerWidth,bottom:innerHeight},scrollable=false
          for(let parent=el.parentElement;parent;parent=parent.parentElement){
            const s=getComputedStyle(parent),p=parent.getBoundingClientRect()
            if((['auto','scroll'].includes(s.overflowX)&&parent.scrollWidth>parent.clientWidth+2)||(['auto','scroll'].includes(s.overflowY)&&parent.scrollHeight>parent.clientHeight+2))scrollable=true
            if(['hidden','clip','auto','scroll'].includes(s.overflowX)){clip.left=Math.max(clip.left,p.left);clip.right=Math.min(clip.right,p.right)}
            if(['hidden','clip','auto','scroll'].includes(s.overflowY)){clip.top=Math.max(clip.top,p.top);clip.bottom=Math.min(clip.bottom,p.bottom)}
          }
          const name=el.getAttribute('aria-label')||el.textContent.trim().slice(0,35)||el.getAttribute('placeholder')||el.tagName
          if(!scrollable && ((Math.min(r.right,clip.right)-Math.max(r.left,clip.left))<r.width*.65 || (Math.min(r.bottom,clip.bottom)-Math.max(r.top,clip.top))<r.height*.65))clipControls.push({name,box:compact(r)})
          if(!scrollable&&r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight){const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(top&&!el.contains(top)&&!top.contains(el)&&!el.closest('main,.vditor-content,.tree-viewport,.settings-panel,.workspace-management-content'))covered.push({name,by:top.className})}
        }
        return {route:compact(root?.getBoundingClientRect()),primary:compact(region?.getBoundingClientRect()),overflow:document.documentElement.scrollWidth-innerWidth,clipControls,covered,alerts:[...document.querySelectorAll('[role="alert"]')].filter(visible).map(el=>el.textContent.trim().slice(0,200)),renderErrors:window.fullWindowAudit.errors,appTitle:document.querySelector('.titlebar-title')?.textContent,navCount:document.querySelectorAll('.app-navigation').length,tabBars:document.querySelectorAll('.workspace-tabs').length,headerHeights:[...document.querySelectorAll('.document-toolbar,.workspace-document-header')].filter(visible).map(el=>Math.round(el.getBoundingClientRect().height))}
      },primary)
      if (id==='mindmap') assert.ok(await page.locator('.map-node').evaluateAll(els=>els.some(el=>{const r=el.getBoundingClientRect(),p=el.closest('.map-panel').getBoundingClientRect();return r.right>p.left && r.left<p.right && r.bottom>p.top && r.top<p.bottom})),`mindmap/${size.id}/${style}: blank after resize`)
      if (id==='temp') assert.ok((await page.locator('.vditor-wysiwyg').innerText()).includes('外部项目记录'),'external Markdown fixture must contain a document')
      layouts.push({size:size.id,style,...metrics})
      if(style==='minimal' && (size.id==='large'||size.id==='small'||size.id==='compact')) await page.screenshot({path:resolve(output,`${id}-${size.id}.png`)})
    }
    report.push({id,label,fixture,surface,layouts,errors})
    await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2))
    console.log(`${id}: errors=${errors.length}; alerts=${layouts[0].alerts.length}; clipped=${layouts.map(row=>row.clipControls.length).join(',')}`)
    await page.close()
  }
  for (const page of report) {
    assert.deepEqual(page.errors, [], `${page.id}: unhandled browser error`)
    for (const layout of page.layouts) {
      assert.equal(layout.overflow, 0, `${page.id}/${layout.size}/${layout.style}: window overflow`)
      assert.deepEqual(layout.clipControls, [], `${page.id}/${layout.size}/${layout.style}: inaccessible controls`)
      assert.deepEqual(layout.renderErrors, [], `${page.id}: Vue render error`)
      assert.ok(layout.primary?.height > 90, `${page.id}: missing primary area`)
    }
  }
} finally { await browser.close() }
