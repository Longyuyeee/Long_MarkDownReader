import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createContextCommands } from '../src/services/contextCommands.ts'
import { searchResultPath } from '../src/utils/searchResultPath.ts'

test('commands use the live callback and never apply an old result to another document', async () => {
  const commands = createContextCommands()
  let owner = 'library/a', available = true, calls = 0
  const dispose = commands.register(() => owner, () => available ? [{id:'history',title:'历史',description:'',run:()=>++calls}] : [])
  const captured = commands.capture()[0]
  assert.equal(await captured.run(), 1)
  owner = 'library/b'
  await assert.rejects(captured.run(), /文件已切换/)
  assert.equal(calls, 1)
  owner = 'library/a'; available = false
  await assert.rejects(captured.run(), /暂不可用/)
  available = true; dispose()
  await assert.rejects(captured.run(), /文件已切换/)
  assert.deepEqual(commands.capture(), [])
})
test('a remounted editor cannot inherit an old callback even with the same path', async () => {
  const commands = createContextCommands()
  const dispose = commands.register(()=>'a',()=>[{id:'check',title:'检查',description:'',run:()=>assert.fail('old editor')}])
  const old = commands.capture()[0]; dispose()
  commands.register(()=>'a',()=>[{id:'check',title:'检查',description:'',run:()=>42}])
  await assert.rejects(old.run(), /文件已切换/)
  assert.equal(await commands.capture()[0].run(), 42)
})
test('local operation failures propagate without saving or unregistering other actions', async () => {
  const commands = createContextCommands(), draft = {content:'未保存的正文',dirty:true}
  commands.register(()=>'a',()=>[{id:'attachments',title:'附件',description:'',run:()=>{throw Error('目录暂不可读')}}])
  await assert.rejects(commands.capture()[0].run(), /目录暂不可读/)
  assert.deepEqual(draft,{content:'未保存的正文',dirty:true})
  assert.equal(commands.capture().length,1)
})
test('attachment paths display relative Windows and UNC names while preserving input bytes', () => {
  for (const [file, root, expected] of [
    ['\\\\?\\E:\\资料库\\中文 文件\\笔记.md','e:/资料库','中文 文件/笔记.md'],
    ['\\\\?\\UNC\\server\\share\\资料\\笔记.md','\\\\server\\share\\资料','笔记.md'],
    ['E:/资料库2/笔记.md','E:/资料库','E:/资料库2/笔记.md'],
  ]) { const before=file;assert.equal(searchResultPath(file,root),expected);assert.equal(file,before) }
})
