import assert from 'node:assert/strict'
import {test} from 'node:test'
import {attachmentDrafts} from '../src/utils/attachmentDrafts.ts'
test('current-window dirty Markdown overlays preserve empty, Unicode and aliased paths',()=>{
 const tabs=[{path:'C:/库/新增.md',content:'自己的补写\r\n![图](a.png)\r\n',isDirty:true},{path:'\\\\?\\C:\\库\\删除.markdown',content:'',isDirty:true},{path:'C:/库/已保存.md',content:'x',isDirty:false},{path:'C:/库2/库外.md',content:'x',isDirty:true},{path:'C:/库/表.table.json',content:'x',isDirty:true}],before=structuredClone(tabs)
 const result=attachmentDrafts('C:/库',tabs);assert.equal(result.length,2);assert.equal(result.find(r=>r.document.endsWith('删除.markdown')).content,'');assert.equal(result.find(r=>r.document.endsWith('新增.md')).content,tabs[0].content);assert.deepEqual(tabs,before)
 assert.equal(attachmentDrafts('C:/库',[tabs[0],{...tabs[0],path:'c:/库/新增.md'}]).length,1)
 assert.throws(()=>attachmentDrafts('C:/库',[tabs[0],{...tabs[0],path:'c:/库/新增.md',content:'不同'}]))
})
test('unavailable or partial dirty drafts cannot silently fall back to stale disk references',()=>{
 for(const extra of [{},{content:'x',textReadOnlyReason:'部分读取'},{content:'x',textLoadError:'读取失败'}])assert.throws(()=>attachmentDrafts('C:/库',[{path:'C:/库/a.md',isDirty:true,...extra}]))
})
