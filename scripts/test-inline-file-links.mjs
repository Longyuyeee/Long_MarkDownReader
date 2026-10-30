import assert from 'node:assert/strict'
import {test} from 'node:test'
import {inlineFileLinks,editableFileLink,replaceInlineDestination,relativeFileDestination} from '../src/utils/inlineFileLinks.ts'
import {inlineSourceMatches} from '../src/utils/vditorInlineLink.ts'
test('duplicate links retain exact occurrence and only the selected destination changes',()=>{
 const one='[**资料**](<old%20file.md#标题> "说明标题")',text='\uFEFF# 原文\r\n\r\n'+one+'\r\n保留文字\r\n'+one+'\r\n'
 const links=inlineFileLinks(text);assert.equal(links.length,2)
 assert.equal(replaceInlineDestination(text,links[1],'new.md'),text.slice(0,links[1].destinationStart)+'new.md'+text.slice(links[1].destinationEnd));assert.ok(replaceInlineDestination(text,links[1],'new.md').includes(one))
 assert.throws(()=>replaceInlineDestination(text.replaceAll('old%20file','changed'),links[0],'new.md'),/原链接已变化/)
})
test('code, front matter and images are excluded while reference links retain rendered order without becoming editable',()=>{
 const text='---\nfield: "[ignore](x.md)"\n---\n\n`[code](x.md)`\n\n```md\n[fenced](x.md)\n```\n\n![picture](x.png) [ref][name] [file](a.md)\n\n[name]: target.md\n'
 const links=inlineFileLinks(text);assert.deepEqual(links.map(l=>l.href),['target.md','a.md']);assert.equal(editableFileLink(links[0],'C:/lib/a.md'),false);assert.equal(editableFileLink(links[1],'C:/lib/a.md'),true)
})
test('escaped label brackets, balanced parentheses, titles and list offsets preserve the untouched source',()=>{
 const text='- [a \\[b\\] c](dir/a(b).md \'title\')\n- [two](two.md)\n',links=inlineFileLinks(text)
 assert.equal(links.length,2);assert.equal(text.slice(links[0].destinationStart,links[0].destinationEnd),'dir/a(b).md');assert.equal(replaceInlineDestination(text,links[0],'next.md'),text.replace('dir/a(b).md','next.md'))
 for(const href of ['https://example.com/a.md','#heading','mailto:a@b.com']){const item=inlineFileLinks(`[a](${href})`)[0];assert.equal(editableFileLink(item,'C:/lib/a.md'),false)}
})
test('relative targets encode Chinese, spaces and punctuation; Windows prefixes and case identify the same parent',()=>{
 assert.equal(relativeFileDestination('\\\\?\\C:\\库\\笔记\\来源.md','c:/库/资料/新 目标#%.md','本周任务'),'../%E8%B5%84%E6%96%99/%E6%96%B0%20%E7%9B%AE%E6%A0%87%23%25.md#%E6%9C%AC%E5%91%A8%E4%BB%BB%E5%8A%A1')
 assert.equal(relativeFileDestination('//?/UNC/server/share/a.md','//SERVER/share/b.txt'),'b.txt');assert.throws(()=>relativeFileDestination('C:/lib/a.md','D:/other/b.md'))
})
test('render normalization never grants permission to rewrite unrelated Markdown syntax',()=>{
 assert.equal(inlineSourceMatches('\uFEFF[a](b.md)\r\n','[a](b.md)\n\n'),true)
 assert.equal(inlineSourceMatches('[a][b]\n\n[b]: x.md\n','[a](x.md)\n'),false)
 assert.equal(inlineSourceMatches('a  b','a b'),false)
})
test('readonly or unavailable sources receive local feedback without a dead repair action',async()=>{
 const {readFileSync}=await import('node:fs'),{default:ts}=await import('typescript'),{default:vm}=await import('node:vm'),source=readFileSync('src/views/LibraryMode.vue','utf8'),start=source.indexOf('const showInlineLinkProblem='),end=source.indexOf('watch(()=>store.libraryPath',start)
 for(const ready of [false,true]){
  let notice,closed=false,repaired=false
  const context={inlineLinkReady:()=>ready,h:(type,props,children)=>({type,props,children}),message:{warning:value=>{notice=typeof value==='function'?value():value;return{destroy:()=>closed=true}}}}
  vm.runInNewContext(ts.transpileModule(source.slice(start,end)+'\nglobalThis.show=showInlineLinkProblem',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);context.show(()=>repaired=true)
  if(!ready){assert.equal(typeof notice,'string');assert.equal(repaired,false)}else{const button=notice.children[1];assert.equal(button.type,'button');button.props.onClick();assert.ok(repaired&&closed)}
 }
})
