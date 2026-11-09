import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,readdir,copyFile,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const root='docs/design/mobile-phone-v3-2026-11-05',raw='docs/evidence/mobile-0.1.0/',read=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,'')),sha=b=>createHash('sha256').update(b).digest('hex')
const first=await read(raw+'phone-format-audit-2026-11-05/report.json'),exact=await read(raw+'phone-format-audit-2026-11-05-exact/report.json'),settled=await read(raw+'phone-format-audit-2026-11-05-structures-settled/report.json'),baseline=await read(raw+'portrait-comfort-2026-11-05-baseline-settled/baseline.json'),prompts=await read(root+'/prompts.json')
const rows=`CodeTools|06-code|page|定位行输入、范围错误、前往后返回
CodeTouchTools|06-code|embedded|符号、光标、缩进、选择行、撤销重做
FileImportPanel|09-create-import|task|记录列表、读取失败、核对、完整正文、去向、存入结果、移除确认
ImageAttachments|10-media-pack|task|图片记录、详情、插入、不可用、重选取消、替换结果
IncomingCenter|10-media-pack|task|混合收件、按类型详情、回原任务、移除确认
JsonAppend|04-json|task|新增字段或数组项、输入、核对、返回保留输入
JsonDiagnostic|04-json|page|首个错误、合法、预算限制、定位源码
JsonFind|04-json|page|查找、结果、命中详情、返回结果
JsonFormat|04-json|task|缩进选择、前后核对、应用到草稿
JsonMove|04-json|task|选择目标、核对移动、取消返回
JsonOperations|04-json|sheet|重命名、新增、移动、删除入口
JsonRemove|04-json|confirmation|对象身份、删除范围、取消、应用到草稿
JsonRename|04-json|task|字段名称、重名边界、核对、应用到草稿
JsonStructure|04-json|task|本层列表、字段详情、修改值、前后核对、继续输入
JsonTools|04-json|embedded|结构入口、检查入口、整理缩进入口
LibraryRoots|12-settings|page|库选择、授权状态、外部目录、断开入口、系统授权取消
LibrarySearch|01-roots|root|空词、名称与原文结果、读取中、部分结果、无匹配、范围选择
MobileApp|01-roots|root|资料、文件夹、全部与最近、按名称查找、继续阅读、添加菜单、新建、文档更多
MobileAppearanceStatus|12-settings|status|偏好读取失败、保存未确认、同一目标重试
MobileConfirmation|12-settings|confirmation|明确对象与后果、取消、确定、等待状态
MobileEditor|02-markdown|task|Markdown与纯文字输入、查找、组合输入、保存、未完成草稿
MobileHelp|12-settings|embedded|问号入口、可访问名称
MobileHelpHost|12-settings|sheet|按需说明、正文独立滚动、关闭、系统返回回入口
MobileNotice|12-settings|status|简短错误、同任务重试、恢复或副本出口、关闭
MobilePdf|07-pdf|task|原版、文字模式、页面选择、缩放与旋转、返回原来源
MobilePdfAnnotationEditor|08-annotations|task|评论输入、完整摘录、颜色选择、核对保存、放弃确认
MobilePdfAnnotations|08-annotations|task|批注列表、详情、筛选、摘录选择、删除与撤销
MobilePdfBookmarks|07-pdf|page|书签列表、条目操作、重命名、删除确认、撤销
MobilePdfContinuous|07-pdf|embedded|连续纸面、当前页、局部页面窗口
MobilePdfContinuousPage|07-pdf|embedded|真实纸面、加载失败、文字与批注对齐
MobilePdfNavigation|07-pdf|page|目录、缩略图、书签、批次、目标失效
MobilePdfPageDialog|07-pdf|dialog|页码输入、范围错误、取消、前往
MobilePdfPassword|09-create-import|page|密码、显示或隐藏、错误重试、取消、后台清空
MobilePdfPermissions|07-pdf|page|能力总览、单项详情、来源只读、继续阅读
MobilePdfPosition|07-pdf|status|位置读取失败、保存失败、重试、返回保护
MobilePdfReadingNoteTask|08-annotations|task|选择摘录、独立筛选、完整预览、保存结果、原文回链
MobilePdfSearch|07-pdf|page|关键词、结果、停止、无匹配、部分结果、回原命中
MobilePdfSettings|07-pdf|page|阅读方式、显示方向、缩放、外观、短选择子层
MobilePdfThumbnail|07-pdf|embedded|真实纸面缩略图、当前页、加载或重试
MobileReader|02-markdown|task|Markdown排版、原文阅读、图片失败、来源回链、位置恢复
MobileReadingPosition|03-text|status|位置读取失败、保存失败、当前任务重试
MobileSettings|12-settings|root|分类、外观、资料库、导入导出记录、恢复、关于
MobileSourcePageDialog|03-text|dialog|分段编号、输入范围、取消、前往、焦点返回
PackImportPanel|10-media-pack|task|记录列表、核对、正文、附件清单、图片、冲突、结果
PdfImportPanel|09-create-import|task|接收记录、详情、文件身份、打开、移除确认
PdfImportPreview|09-create-import|embedded|实际PDF页、加载失败、返回详情
PortableExport|11-export-recovery|task|源身份核对、正文、清单、结果、历史、移除确认
RecoveryCenter|11-export-recovery|task|恢复列表、详情、版本、核对、继续或另存、结果
RecoverySource|11-export-recovery|embedded|完整原稿或候选、长文分段、保留选区与滚动
SourcePager|03-text|embedded|前后分段、位置、按需跳段
SourceReader|03-text|task|分段原文、选区、查找命中、进度、跳段、位置保护
TextExport|11-export-recovery|task|来源核对、完整预览、文件名、系统位置、成功结果、失败重试
TomlDiagnostic|05-structured|page|首个问题、通过、数值与预算限制、回源码修正
TomlStructure|05-structured|task|表与字段、详情、值输入、核对、应用到草稿
TomlTools|05-structured|embedded|源码与结构入口、检查入口
XmlDiagnostic|05-structured|page|语法问题、通过、预算限制、定位源码
XmlStructure|05-structured|task|元素与属性、详情、属性修改、核对、应用到草稿
XmlTools|05-structured|embedded|源码与结构入口、检查入口
YamlDiagnostic|05-structured|page|语法问题、通过、复杂值边界、定位源码
YamlStructure|05-structured|task|映射与序列、详情、值输入、核对、应用到草稿
YamlTools|05-structured|embedded|源码与结构入口、检查入口`.split('\n').map(line=>{const[component,board,kind,states]=line.split('|');return{component:component+'.vue',board,kind,states:states.split('、')}})
assert.equal(rows.length,61);assert.deepEqual(rows.map(r=>r.component).sort(),first.components.map(c=>c.file).sort())
const interactions={
 root:'仅资料／搜索／设置显示底部主导航。文件夹返回上一级；次级任务返回实际来源并恢复列表滚动、筛选与焦点。名称筛选按需进入，不额外常驻一排表单。',
 task:'独立竖屏任务页，56dp标题栏，正文为主要空间。返回只消费当前一层；字段、评论、选区、滚动与核对版本保留。提交必须等待实际持久化确认。',
 page:'一项明确目的地或子任务。返回到发起入口，恢复当前文档与位置；不把结果、输入、筛选和列表同时铺开。',
 sheet:'仅放短操作或单项选择，建议不超过6行。选定即回原任务；遮罩、关闭或Back只收起该层。不得在底部面板里堆整套管理流程。',
 dialog:'一个短输入或确认，聚焦输入后仍能看到操作。键盘出现后适应剩余区域；取消回入口，取消不提交。',
 confirmation:'说明具体对象与真实后果，动作明确命名；取消保留原任务。只有确认后才执行，等待时防重复。',
 embedded:'依附所在任务的内容或单排工具，不独立生成全局导航；按需显示，不能与主输入和多组工具争夺竖屏高度。',
 status:'只呈现真实失败／等待／确认结果。错误保留当前资料并提供对应动作；一般说明移入问号，成功不重复占多排。'
}
await writeFile(root+'/interface-catalog.json',JSON.stringify({sourceCommit:first.sourceCommit,components:first.components,coverage:rows.map(r=>({...r,interaction:interactions[r.kind]})),notes:'61 components are fully mapped to page/state families; 36 generated key screens define the visual templates. Reused/loading/error/confirmation variants are specified here, not falsely claimed as individually rendered raster screens.'},null,2))
const tokens={viewport:{primary:{width:390,height:844},additional:[{width:360,height:800},{width:320,height:640}],fontScales:[1,1.3,2]},spacing:{screen:16,section:24,rowGap:12,touchTargetMin:48,appBar:56,rootNavigation:72,fab:56},type:{body:17,uiBody:16,secondary:13,title:20,articleTitle:28,lineHeight:1.75,code:14},palette:{canvas:'#FAFBF8',surface:'#FFFFFF',ink:'#172A24',muted:'#68766E',primary:'#267458',line:'#E5EAE6',codeCanvas:'#111C28',codeKeyword:'#C6A3F0',codeString:'#A9D994',codeNumber:'#E9BF70',codeSymbol:'#82CBDA'},motion:{pageMs:200,sheetMs:220,reducedMotion:true},rules:['原始PDF纸面颜色和比例保持，应用只组织外围工具','Markdown：语义标题、引用、表格、行内代码与高亮代码块；禁止把普通文稿伪造成PDF页码','TXT：原文、换行和选区保持；安全分段回退不虚构语法解析','源码：只读与编辑采用一致语法色；声明highlight=false的JSX/TSX/Vue须单列实现与验收，不能假称已具备','结构化文件：按值类型分色，路径和源码定位明确；编辑与核对分别成页','底部输入工具只占一排；键盘上方显示，避免输入焦点和选区被工具点击清空','实际Android安全区、系统Back和IME需原生验收；图稿中的键盘只是设计示意','图稿示例日期、内容、命中和缩略图是设计样本，不是用户资料或真实测试回执']}
await writeFile(root+'/design-tokens.json',JSON.stringify(tokens,null,2))
const reports=[{folder:'phone-format-audit-2026-11-05',report:first},{folder:'phone-format-audit-2026-11-05-exact',report:exact},{folder:'phone-format-audit-2026-11-05-structures-settled',report:settled}]
const formats=new Map(),states=new Map()
for(const entry of reports){for(const f of entry.report.formats)if(f.captured)formats.set(f.id,f);for(const s of entry.report.states)if(!s.name.endsWith('-failure'))states.set(s.name,{...s,source:raw+entry.folder+'/'+s.name+'.png',file:'actual/'+s.name+'.png'})}
assert.equal(formats.size,27);assert.equal(states.size,62)
for(const screen of baseline.screens.filter(s=>s.name!=='reader')){const name='root-'+screen.name;states.set(name,{name,viewport:screen.viewport,source:raw+'portrait-comfort-2026-11-05-baseline-settled/before-'+screen.name+'.png',file:'actual/'+name+'.png'})}
assert.equal(states.size,69);const taskAudit=await read(raw+'phone-task-audit-2026-11-05/report.json');assert.deepEqual(taskAudit.failures,[]);assert.deepEqual(taskAudit.errors,[]);for(const state of taskAudit.states)states.set('task-'+state.name,{...state,name:'task-'+state.name});assert.equal(states.size,87);await mkdir(root+'/actual',{recursive:true})
const copied=[]
for(const s of states.values()){const bytes=await readFile(s.source),destination=root+'/'+s.file;try{await access(destination);assert.equal(sha(await readFile(destination)),sha(bytes),destination)}catch(error){if(error.code==='ENOENT')await copyFile(s.source,destination);else throw error}copied.push({...s,sha256:sha(bytes),bytes:bytes.length})}
await writeFile(root+'/actual-manifest.json',JSON.stringify(copied,null,2))
await writeFile(root+'/format-audit.json',JSON.stringify({scope:first.scope,formats:[...formats.values()],states:copied,originalReports:reports.map(r=>({file:raw+r.folder+'/report.json',captured:r.report.formats.filter(f=>f.captured).length,errors:r.report.errors,failed:r.report.formats.filter(f=>!f.captured)})),taskReport:{file:raw+'phone-task-audit-2026-11-05/report.json',states:taskAudit.states.length,failures:taskAudit.failures,errors:taskAudit.errors},baselineReport:raw+'portrait-comfort-2026-11-05-baseline-settled/baseline.json',firstBaselineAttempt:raw+'portrait-comfort-2026-11-05/baseline.json',loadingCaptures:'Initial structure captures only showed loading; the final -structures-settled originals wait for actual parsed field rows. The first generic reader baseline was also a loading frame and is excluded from these selected screenshots.',nativeAndroidTest:false,productSourceModified:false},null,2))
if(process.argv.includes('--prepare')){console.log(JSON.stringify({components:rows.length,formats:formats.size,actual:copied.length,states:rows.reduce((n,r)=>n+r.states.length,0)}));process.exit(0)}
const images=await read(root+'/image-manifest.json');assert.equal(images.filter(i=>i.selected).length,12)
for(const item of images){const bytes=await readFile(root+'/'+item.file);assert.equal(sha(bytes),item.sha256,item.file)}
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
const figures=prompts.boards.map((b,n)=>{const image=images.find(i=>i.id===b.id&&i.selected);return`<section class="board" id="board-${b.id}"><h2>${esc(b.title)}</h2><a href="${encodeURI(image.file)}"><img loading="lazy" src="${encodeURI(image.file)}" alt="${esc(b.title)}：三个关键界面设计"></a><p>${esc(['资料、搜索、设置只保留单一顶栏与任务相关内容。','排版、语法色、引用与表格重新设计；键盘上方保留单排格式工具。','纯文本、分段原文与按需跳转分别处理。','JSON结构、详情与修改分层，重命名等复用相同任务模型。','YAML、XML、TOML保留各自语义和类型提示。','阅读与编辑共用语法色；触控工具按需展开。','原始PDF纸面保持，目录与页面进入独立任务。','批注、评论与摘录笔记分开，输入不挤在列表里。','短添加菜单、单字段对话框与完整导入任务分别承载。','收件、图片与附件包按对象进入下一层。','源身份、预览、实际结果与恢复记录保持清楚。','设置分类到单项任务，说明仅在问号里出现。'][n])}</p></section>`}).join('')
const actual=copied.map(s=>`<figure><a href="${encodeURI(s.file)}"><img loading="lazy" src="${encodeURI(s.file)}" alt="当前实页 ${esc(s.name)}"></a><figcaption>${esc(s.name)}</figcaption></figure>`).join('')
const catalog=rows.map(r=>`<details><summary>${esc(r.component)} · ${esc(r.kind)} <a href="#board-${esc(r.board)}">图稿</a></summary><p>${esc(r.states.join(' → '))}</p><p>${esc(interactions[r.kind])}</p></details>`).join('')
await writeFile(root+'/index.html',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Long编辑 · 手机界面重设计 v3</title><style>*{box-sizing:border-box}body{margin:0;font:16px/1.7 system-ui,"Microsoft YaHei",sans-serif;background:#f4f6f3;color:#172a24}main{max-width:1440px;margin:auto;padding:28px 20px 80px}h1{font-size:28px;line-height:1.35}h2{font-size:22px;margin:32px 0 16px}p{max-width:1080px}a{color:#216349}nav{display:flex;flex-wrap:wrap;gap:12px 20px;padding:16px 0}nav a{padding:8px 0}img{display:block;width:100%;height:auto;border-radius:8px;border:1px solid #dce4de}.board{scroll-margin-top:20px;border-top:1px solid #dce4de;padding-top:4px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:22px}figure{margin:0;min-width:0}figcaption{overflow-wrap:anywhere;font-size:14px;padding:8px 0}details{padding:12px 16px;border:1px solid #dce4de;border-radius:8px;margin:8px 0;background:#fff}summary{cursor:pointer;overflow-wrap:anywhere}summary a{float:right}.scope{padding:16px 20px;background:#e8f0ea;border-radius:10px}section{min-width:0}.meta{font-size:14px;color:#53655b}</style><main><h1>Long编辑 · 手机界面重设计 v3</h1><p class="scope">这是设计提案，尚未接入产品。先核对当前完整构建的真实页面，再将61个组件拆为任务与状态，生成12组、36张关键界面图。27类格式与87张选定实页原图单独留存。浏览器实页、AI设计图和Android真机验收分别记录。</p><nav><a href="README.md">设计与交互规范</a><a href="interface-catalog.json">61组件拆分</a><a href="format-audit.json">27类格式实查</a><a href="design-tokens.json">尺寸与颜色</a><a href="prompts.json">生成提示词</a><a href="review-notes.md">图稿校对</a><a href="image-manifest.json">图稿版本／摘要</a><a href="#actual">当前实页原图</a><a href="#catalog">状态与返回规则</a></nav><nav>${prompts.boards.map(b=>`<a href="#board-${b.id}">${esc(b.title)}</a>`).join('')}</nav>${figures}<section id="catalog"><h2>逐组件的页面／状态与返回规则</h2><p>36张关键图定义视觉模板；以下子状态按共同任务样式展开，未将所有子状态冒称为单独出过图片。加载、错误、空数据、短屏与键盘都需在正式实现时逐项验收。</p>${catalog}</section><section id="actual"><h2>当前版本实际页面：87张原图</h2><p class="meta">源码7642eb8da／Android测试序号1002050所用前端，390×844触摸浏览器为主，短屏样本单列。使用合成资料，未注入产品CSS或替换UI。未连接或操作用户手机。本轮没有进行新的原生Android/IME验收。原文件按SHA256原样复制；初次选择器和加载等待的失败见原报告。</p><div class="grid">${actual}</div></section></main></html>`)
console.log(JSON.stringify({root,boards:12,screens:36,actual:copied.length,components:rows.length,states:rows.reduce((n,r)=>n+r.states.length,0)}))
