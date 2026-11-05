import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import test from 'node:test'
import {installLibraryLinkClickHarness} from './lib/library-link-click-test-harness.mjs'
const compile=(file,dependencies={})=>{const context={exports:{},require:name=>dependencies[name]};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports}
const image=compile('src/utils/localImagePath.ts'),links=compile('src/utils/localMarkdownLinks.ts',{'./localImagePath.ts':image})
test('relative document links resolve against their moved note and keep the decoded heading',()=>{
 const target=links.localMarkdownLink('\\\\?\\C:\\Lib\\notes\\a.md','../文档/%E6%96%B0%E5%90%8D.md?view=2#%E6%9C%AC%E5%91%A8%E4%BB%BB%E5%8A%A1')
 assert.equal(target.path,'C:/Lib/文档/新名.md');assert.equal(target.fragment,'本周任务')
 assert.equal(links.localMarkdownLink('C:/Lib/a.md','#heading').path,'C:/Lib/a.md')
 for(const href of ['https://example.com/a.md','longedit://source?path=x','//example.com/a.md','mailto:a@example.com'])assert.equal(links.localMarkdownLink('C:/Lib/a.md',href),null)
 assert.equal(links.localMarkdownLink('C:/Lib/a.md','bad%escape.md').path,null)
})
const node=(text,tagName='H2',id='')=>({textContent:text,tagName,id,getAttribute:()=>null})
test('heading navigation handles generated IDs, Chinese, punctuation, duplicate headings and source mode',()=>{
 const one=node('本周 任务！'),two=node('Heading'),three=node('Heading'),source=node('## Source title','DIV'),explicit=node('other','H2','custom-anchor')
 const root={querySelectorAll:()=>[one,two,three,source,explicit]}
 assert.equal(links.markdownAnchorTarget(root,'本周-任务'),one);assert.equal(links.markdownAnchorTarget(root,'heading-1'),three)
 assert.equal(links.markdownAnchorTarget(root,'source-title'),source);assert.equal(links.markdownAnchorTarget(root,'custom-anchor'),explicit)
 assert.equal(links.markdownAnchorTarget(root,'missing'),undefined)
})
test('a real local-link click snapshots current unsaved content and reuses a target draft',async()=>{
 const source=fs.readFileSync('src/views/LibraryMode.vue','utf8')
 const calls=[],draft={path:'C:/Lib/TARGET.txt',isDirty:true},event={target:{closest:()=>({getAttribute:()=> '../target.txt'})},preventDefault:()=>calls.push('prevent'),stopPropagation:()=>calls.push('stop')}
 const context={isPortableChapterLink:()=>false,localMarkdownLink:links.localMarkdownLink,activeTabId:{value:'C:/Lib/notes/a.md'},store:{libraryPath:'C:/Lib'},allTabs:{value:[draft]},sameLibrary:(a,b)=>a.toLowerCase()===b.toLowerCase(),invoke:async(command,args)=>{calls.push({command,args})},snapshotWindowDrafts:()=>calls.push('snapshot'),openManagedFile:async(router,path)=>calls.push({open:path}),router:{},nextTick:fn=>fn(),revealLinkedHeading(){},message:{warning:value=>calls.push({warning:value})}}
 installLibraryLinkClickHarness(context,source)
 await context.click(event);assert.equal(calls[0],'prevent');assert.equal(calls[1],'stop');assert.equal(calls[2].command,'get_file_stats');assert.equal(calls[2].args.path,'C:/Lib/target.txt');assert.equal(calls[3],'snapshot');assert.equal(calls[4].open,draft.path)
 calls.length=0;context.invoke=async()=>{throw Error('目标已不存在')};await context.click(event);assert.ok(calls.at(-1).warning.includes('目标已不存在'));assert.equal(calls.includes('snapshot'),false)
})
