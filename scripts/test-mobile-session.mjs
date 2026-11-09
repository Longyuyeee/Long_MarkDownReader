import test from 'node:test'
import assert from 'node:assert/strict'
import { createEditorState, DocumentSession } from '../src/mobile/documentSession.ts'

const identity = { rootId: 'local', relativePath: '笔记.md' }
const key = value => JSON.stringify([value.rootId, value.relativePath])
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function fixture() {
  const documents = new Map([[key(identity), { ...identity, content: '原文', signature: 'original', modified: 1 }]])
  const drafts = new Map()
  const controls = { failDraft: false, failWrite: false, failCleanup: false, writes: 0, writeGate: null, readGate: null, draftGate: null }
  const storage = {
    async read(id) { if (controls.readGate && id.relativePath === '慢.md') await controls.readGate.promise; if (!documents.has(key(id))) throw Error('NOT_FOUND'); return { ...documents.get(key(id)) } },
    async draft(id) { return structuredClone(drafts.get(key(id)) ?? null) },
    async saveDraft(draft) { if (controls.draftGate) await controls.draftGate.promise; if (controls.failDraft) throw Error('磁盘已满'); drafts.set(key(draft), structuredClone(draft)) },
    async discardDraft(id, revision) { if (controls.failCleanup) throw Error('清理失败'); if ((drafts.get(key(id))?.revision ?? Infinity) <= revision) drafts.delete(key(id)) },
    async write(id, content, signature) {
      controls.writes++
      if (controls.writeGate) await controls.writeGate.promise
      if (controls.failWrite) throw Error('写入失败')
      if ((documents.get(key(id))?.signature ?? null) !== signature) throw Error('CONFLICT')
      const doc = { rootId: id.rootId, relativePath: id.relativePath, content, signature: `saved:${content}`, modified: 2 }
      documents.set(key(id), doc); return doc
    },
  }
  const state = createEditorState(), session = new DocumentSession(storage, state)
  return { state, session, storage, controls, documents, drafts }
}

test('编辑和保护草稿不会代存原文件', async () => {
  const f = fixture(); await f.session.open(identity); f.session.update('想法'); await f.session.flush()
  assert.equal(f.documents.get(key(identity)).content, '原文'); assert.equal(f.controls.writes, 0)
  assert.equal(f.drafts.get(key(identity)).content, '想法')
})
test('草稿持久化失败会阻止关闭并保留当前文稿', async () => {
  const f = fixture(); await f.session.open(identity); f.session.update('保留'); f.controls.failDraft = true
  await assert.rejects(f.session.close(), /磁盘已满/); assert.equal(f.state.content, '保留'); assert.ok(f.state.document)
})
test('保存期间的后续输入使用新来源签名保护，不被旧回执清除', async () => {
  const f = fixture(); await f.session.open(identity); f.session.update('第一版'); f.controls.writeGate = deferred()
  const saving = f.session.save(); await new Promise(resolve => setImmediate(resolve))
  f.session.update('第二版'); const flushing = f.session.flush(); f.controls.writeGate.resolve()
  await Promise.all([saving, flushing])
  assert.equal(f.documents.get(key(identity)).content, '第一版'); assert.equal(f.state.content, '第二版'); assert.equal(f.state.dirty, true)
  assert.equal(f.drafts.get(key(identity)).expectedSignature, 'saved:第一版'); assert.equal(f.drafts.get(key(identity)).content, '第二版')
})
test('已保存代次的排队草稿不会重新出现', async () => {
  const f = fixture(); await f.session.open(identity); f.session.update('保存内容'); f.controls.writeGate = deferred()
  const saving = f.session.save(); await new Promise(resolve => setImmediate(resolve)); const flushing = f.session.flush()
  f.controls.writeGate.resolve(); await Promise.all([saving, flushing]); assert.equal(f.drafts.has(key(identity)), false)
})
test('外部冲突拒绝覆盖且持久保留草稿', async () => {
  const f = fixture(); await f.session.open(identity); f.session.update('我的输入')
  f.documents.set(key(identity), { ...f.documents.get(key(identity)), content: '外部版本', signature: 'external' })
  await assert.rejects(f.session.save(), /CONFLICT/)
  assert.equal(f.documents.get(key(identity)).content, '外部版本'); assert.equal(f.drafts.get(key(identity)).content, '我的输入'); assert.equal(f.state.dirty, true)
})
test('写入失败后允许重试同一草稿', async () => {
  const f = fixture(); await f.session.open(identity); f.session.update('重试'); f.controls.failWrite = true
  await assert.rejects(f.session.save(), /写入失败/); f.controls.failWrite = false; await f.session.save()
  assert.equal(f.state.dirty, false); assert.equal(f.documents.get(key(identity)).content, '重试')
})
test('清理恢复记录失败仍承认已经完成的文件保存', async () => {
  const f = fixture(); await f.session.open(identity); f.session.update('已保存'); f.controls.failCleanup = true; await f.session.save()
  assert.equal(f.state.dirty, false); assert.equal(f.state.document.signature, 'saved:已保存'); assert.match(f.state.error, /文件已保存/)
})
test('旧文档的延迟读取结果不会替换新文档', async () => {
  const f = fixture(); const slow = { rootId: 'local', relativePath: '慢.md' }
  f.documents.set(key(slow), { ...slow, content: '慢', signature: 'slow', modified: 1 }); f.controls.readGate = deferred()
  const loading = f.session.open(slow); await new Promise(resolve => setImmediate(resolve)); await f.session.open(identity)
  f.controls.readGate.resolve(); await loading; assert.equal(f.state.document.relativePath, identity.relativePath)
})
test('恢复旧来源草稿后仍按旧签名阻止覆盖外部变化', async () => {
  const f = fixture(); f.drafts.set(key(identity), { ...identity, content: '旧草稿', expectedSignature: 'previous', revision: 1, updated: 1 })
  await f.session.open(identity); assert.equal(f.state.content, '原文'); f.session.restore(); await f.session.flush()
  await assert.rejects(f.session.save(), /CONFLICT/); assert.equal(f.state.content, '旧草稿')
})
test('未首次保存的新笔记在新会话中仍可恢复', async () => {
  const f = fixture(), id = { rootId: 'local', relativePath: '新笔记.md' }
  await f.session.create(id); f.session.update('新想法'); await f.session.flush()
  const restored = new DocumentSession(f.storage, createEditorState()); await restored.open(id)
  assert.ok(restored.state.recovery); restored.restore(); await restored.flush(); await restored.save()
  assert.equal(f.documents.get(key(id)).content, '新想法')
})
test('新建同名笔记不会覆盖尚未恢复的草稿', async () => {
  const f = fixture(); f.drafts.set(key(identity), { ...identity, content: '重要草稿', revision: 1 })
  await assert.rejects(f.session.create(identity), /同名草稿/); assert.equal(f.drafts.get(key(identity)).content, '重要草稿')
})
test('切换文档会等待持久化期间产生的后续输入', async () => {
  const f = fixture(), next = { rootId: 'local', relativePath: '下一篇.md' }, gate = deferred()
  f.documents.set(key(next), { ...next, content: '下一篇', signature: 'next', modified: 1 })
  await f.session.open(identity); f.session.update('先写的内容')
  const originalSave = f.storage.saveDraft; let calls = 0
  f.storage.saveDraft = async snapshot => { if (++calls === 1) await gate.promise; return originalSave(snapshot) }
  const switching = f.session.open(next); await new Promise(resolve => setImmediate(resolve))
  f.session.update('写入期间继续输入'); gate.resolve(); await switching
  assert.equal(f.drafts.get(key(identity)).content, '写入期间继续输入')
  assert.equal(f.state.document.relativePath, next.relativePath)
})

test('撤销回已保存原文后不再恢复已放弃的编辑', async () => {
  const f = fixture(); await f.session.open(identity); f.session.update('后来撤销的内容'); await f.session.flush()
  f.session.update('原文'); await f.session.close()
  const reopened = new DocumentSession(f.storage, createEditorState()); await reopened.open(identity)
  assert.equal(reopened.state.recovery, null); assert.equal(reopened.state.content, '原文'); assert.equal(f.controls.writes, 0)
})

test('仅先阅读原文不会清掉尚未选择的恢复草稿', async () => {
  const f = fixture(); f.drafts.set(key(identity), { ...identity, content: '仍有用的草稿', expectedSignature: 'original', revision: 2 })
  await f.session.open(identity); await f.session.close()
  assert.equal(f.drafts.get(key(identity)).content, '仍有用的草稿')
})

test('授权失效后仍能打开私有草稿，且禁止向不可用来源写回', async () => {
  const f = fixture(); await f.session.open(identity); f.session.update('离线也要保留'); await f.session.flush()
  f.storage.read = async () => { throw Error('PERMISSION: 已撤销授权') }
  const reopened = new DocumentSession(f.storage, createEditorState()); await reopened.open(identity)
  assert.match(reopened.state.sourceError, /PERMISSION/); reopened.restore(); await reopened.flush()
  assert.equal(reopened.state.content, '离线也要保留'); assert.equal(reopened.state.dirty, true)
  await assert.rejects(reopened.save(), /SOURCE_UNAVAILABLE/); assert.equal(f.controls.writes, 0)
})

test('来源不可用但没有草稿时不会伪造空文档', async () => {
  const f = fixture(); f.storage.read = async () => { throw Error('PERMISSION: 已撤销授权') }
  await assert.rejects(f.session.open(identity), /PERMISSION/); assert.equal(f.state.document, null)
})

test('新建草稿首次保护失败不激活空文稿，重试仍可正常开始', async () => {
  const f = fixture(), id = { rootId: 'local', relativePath: '重试新建.md' }
  f.controls.failDraft = true
  await assert.rejects(f.session.create(id), /磁盘已满/)
  assert.equal(f.state.document, null); assert.equal(f.drafts.has(key(id)), false); assert.equal(f.controls.writes, 0)
  f.controls.failDraft = false; await f.session.create(id)
  assert.equal(f.state.document.relativePath, id.relativePath); assert.equal(f.state.draftStatus, '草稿已保护')
  f.session.update('失败后继续记录'); await f.session.save()
  assert.equal(f.documents.get(key(id)).content, '失败后继续记录')
})

test('新建期间重复请求或切换不会替换正在保护的笔记', async () => {
  const f = fixture(), id = { rootId: 'local', relativePath: '一次新建.md' }
  f.controls.draftGate = deferred(); const preparing = f.session.create(id)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.state.document, null)
  await assert.rejects(f.session.create(id), /正在准备/)
  await assert.rejects(f.session.open(identity), /正在准备/)
  await assert.rejects(f.session.close(), /正在准备/)
  f.controls.draftGate.resolve(); await preparing
  assert.equal(f.drafts.size, 1); assert.equal(f.state.document.relativePath, id.relativePath)
})

test('新建核对实际来源，不能把已有文件或读取失败当作空位置', async () => {
  const f = fixture()
  await assert.rejects(f.session.create(identity), /已经有这个名字/)
  assert.equal(f.documents.get(key(identity)).content, '原文'); assert.equal(f.drafts.size, 0)
  f.storage.read = async () => { throw 'READ_FAILED: 提供器离线' }
  await assert.rejects(f.session.create({ rootId: 'local', relativePath: '未读取.md' }), /READ_FAILED/)
  assert.equal(f.state.document, null); assert.equal(f.drafts.size, 0)
  f.storage.read = async () => { throw 'NOT_FOUND: 文件不存在' }
  await f.session.create({ rootId: 'local', relativePath: '不存在.md' })
  assert.equal(f.state.document.relativePath, '不存在.md')
})

test('新笔记先持久保护，再等待页面准备，最后激活可编辑文稿', async () => {
  const f = fixture(), id = { rootId: 'local', relativePath: '页面准备.md' }, gate = deferred()
  const task = f.session.create(id, async () => { assert.equal(f.state.document, null); assert.ok(f.drafts.has(key(id))); await gate.promise })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.state.document, null); await assert.rejects(f.session.close(), /正在准备/)
  gate.resolve(); await task
  assert.equal(f.state.document.relativePath, id.relativePath); assert.equal(f.state.dirty, true)
})
