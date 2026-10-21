import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import ts from 'typescript'
import {portableChapterUri,parsePortableChapterLink,chapterHeadingTarget,isPortableChapterLink} from '../src/utils/portableChapterLinks.ts'
import {markdownChapterLink} from '../src/utils/markdownSections.ts'

test('default library links follow the library root and retain Chinese, encoded names and duplicate fragments',()=>{
 const uri=portableChapterUri('C:/旧库','\\\\?\\C:\\旧库\\资料\\方案 #%.md','重复 [方案]','重复-方案-1')
 assert.ok(!uri.includes('C:'));assert.deepEqual(parsePortableChapterLink(uri,'D:/新库'),{path:'D:/新库/资料/方案 #%.md',title:'重复 [方案]',fragment:'重复-方案-1'})
 assert.equal(parsePortableChapterLink(portableChapterUri('\\\\?\\UNC\\server\\share','//SERVER/share/a.md','A','a'),'//other/share').path,'//other/share/a.md')
 assert.equal(parsePortableChapterLink(portableChapterUri('/','/a.md','A','a'),'/new').path,'/new/a.md')
 assert.match(markdownChapterLink('C:/库/a.md','标题','标题','C:/库'),/longedit:\/\/chapter/)
 assert.match(markdownChapterLink('C:/库/a.md','标题','标题'),/C:\/库\/a.md|C:\/%E5%BA%93\/a.md/)
 const long='字'.repeat(1365);assert.ok(parsePortableChapterLink(portableChapterUri('C:/库','C:/库/a.md',long,long),'D:/库'))
 assert.throws(()=>portableChapterUri('C:/库','C:/库/a.md','字'.repeat(1366),'a'),/标题或位置过长/)
 assert.throws(()=>portableChapterUri('C:/库','C:/库/a.md','a','字'.repeat(1366)),/标题或位置过长/)
})
test('ambiguous or unavailable addresses never become a guessed local document',()=>{
 const uri=portableChapterUri('C:/库','C:/库/a.md','A','a')
 for(const bad of [uri.replace('#a','&extra=1#a'),uri.replace('path=a.md','path=..%2Fa.md'),uri.replace('path=a.md','path=%2Fa.md'),uri.replace('path=a.md','path=C%3A%2Fa.md'),uri.replace('path=a.md','path=a.pdf'),uri.replace('&title=','&path=b.md&title='),uri.replace('#a','#%FF'),uri.replace('title=A','title=%zz'),uri.replace('chapter?','chapter/?')])assert.equal(parsePortableChapterLink(bad,'C:/库'),null,bad)
 assert.throws(()=>portableChapterUri('C:/库','C:/库外/a.md','A','a'));assert.throws(()=>portableChapterUri('/lib','/LIB/a.md','A','a'))
 const headings=[{slug:'重复',text:'重复',id:'first'},{slug:'重复-1',text:'重复',id:'second'},{slug:'other',text:'改名',id:'other'}]
 assert.equal(chapterHeadingTarget(headings,'重复-1','重复').id,'second');assert.equal(chapterHeadingTarget(headings,'other','旧标题'),undefined)
})
function clickHarness(){
 const source=fs.readFileSync('src/views/LibraryMode.vue','utf8'),start=source.indexOf('const openSourceReference ='),end=source.indexOf('const openPdfReference =',start),calls=[],target={path:'C:/库/目标.md',isDirty:true,content:'目标未保存内容'},context={isPortableChapterLink,parsePortableChapterLink,chapterLinkGeneration:0,activeTabId:{value:'C:/库/当前.md'},store:{libraryPath:'C:/库'},allTabs:{value:[target]},sameLibrary:(a,b)=>a.toLowerCase()===b.toLowerCase(),invoke:async(command,args)=>calls.push({command,args}),snapshotWindowDrafts:()=>calls.push('snapshot'),openManagedFile:async(router,path,query)=>calls.push({path,query}),router:{},nextTick:fn=>fn(),revealLinkedHeading(){},message:{warning:text=>calls.push({warning:text})}}
 vm.runInNewContext(ts.transpileModule(source.slice(start,end)+'\nglobalThis.click=openSourceReference',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context)
 const event=href=>({target:{closest:()=>({getAttribute:()=>href})},preventDefault(){},stopPropagation(){}})
 return {context,calls,target,click:href=>context.click(event(href))}
}
test('actual click preserves the source draft and reuses the target draft before precise navigation',async()=>{
 const h=clickHarness(),uri=portableChapterUri('C:/库','C:/库/目标.md','重复','重复-1');await h.click(uri)
 assert.equal(h.calls[0].command,'get_file_stats');assert.equal(h.calls[1],'snapshot');assert.equal(h.calls[2].path,h.target.path);assert.equal(h.calls[2].query.markdownAnchor,'重复-1');assert.equal(h.calls[2].query.markdownHeading,'重复');assert.equal(h.target.content,'目标未保存内容');assert.equal(h.target.isDirty,true)
 h.calls.length=0;h.context.invoke=async()=>{throw Error('missing')};await h.click(uri);assert.equal(h.calls.length,1);assert.ok(h.calls[0].warning.includes('当前草稿已保留'))
})
test('late file checks cannot redirect a different document or library',async()=>{
 for(const change of [h=>h.context.activeTabId.value='C:/库/别的.md',h=>h.context.store.libraryPath='D:/另一个库']){
  const h=clickHarness();let release;h.context.invoke=()=>new Promise(resolve=>release=resolve);const pending=h.click(portableChapterUri('C:/库','C:/库/目标.md','A','a'));change(h);release();await pending;assert.deepEqual(h.calls,[])
 }
})
test('actual heading reveal refuses a renamed heading instead of falling back to a different target',()=>{
 const source=fs.readFileSync('src/views/LibraryMode.vue','utf8'),start=source.indexOf('const revealLinkedHeading ='),end=source.indexOf('const handleOutlineSelect',start),calls=[],context={route:{query:{path:'C:/库/a.md',markdownAnchor:'旧标题',markdownHeading:'旧标题',markdownLocator:'1'}},activeTabId:{value:'C:/库/a.md'},isVditorReady:true,lastLoadedPath:'C:/库/a.md',sameLibrary:(a,b)=>a===b,syncOutlineManual(){},chapterHeadingTarget,outlineItems:{value:[{slug:'旧标题',text:'新标题',id:'wrong'}]},scrollToHeading:id=>calls.push({scroll:id}),chapterNoticeToken:'',message:{warning:text=>calls.push({warning:text})}}
 vm.runInNewContext(ts.transpileModule(source.slice(start,end)+'\nglobalThis.reveal=revealLinkedHeading',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);context.reveal();context.reveal();assert.equal(calls.length,1);assert.ok(calls[0].warning.includes('改名或删除'));context.outlineItems.value=[{slug:'旧标题',text:'旧标题',id:'correct'}];context.reveal();assert.equal(calls[1].scroll,'correct')
})
