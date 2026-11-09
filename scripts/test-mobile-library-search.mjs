import test from 'node:test'
import assert from 'node:assert/strict'
import { LibrarySearchIndex, SEARCH_LIMITS } from '../src/mobile/librarySearch.ts'

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function fixture(paths = { '阅读/笔记.md': '中文[ ] ALPHA alpha\n<svg onload="leak()">', '中文名.txt': '另一个内容', '阅读/deeper/想法.TXT': '记下中文[ ]', '.private/隐藏.md': '秘密', '表格.csv': '不搜索' }) {
  const documents = new Map(Object.entries(paths).map(([relativePath, content]) => [relativePath, { rootId: 'local', relativePath, content, modified: 1, signature: content }]))
  const controls = { available: true, failFolder: '', failFile: '', truncated: false, gate: null, reads: [], rootsGate: null }
  const storage = {
    async roots() { if (controls.rootsGate) await controls.rootsGate.promise; return [{ id: 'local', available: controls.available }] },
    async list(rootId, path) {
      if (controls.failFolder === path && path) throw Error('READ_FAILED: 提供器离线')
      const prefix = path ? path + '/' : '', found = new Map()
      for (const document of documents.values()) if (document.relativePath.startsWith(prefix)) {
        const tail = document.relativePath.slice(prefix.length), name = tail.split('/')[0]
        found.set(name, { name, relativePath: prefix + name, directory: tail.includes('/'), size: tail.includes('/') ? 0 : new TextEncoder().encode(document.content).length })
      }
      return { entries: [...found.values()], truncated: controls.truncated }
    },
    async read(id) { controls.reads.push(id.relativePath); if (controls.gate) await controls.gate.promise; if (controls.failFile === id.relativePath) throw Error('UNSUPPORTED: 非 UTF-8'); return { ...documents.get(id.relativePath) } },
  }
  return { documents, controls, storage, index: new LibrarySearchIndex('local') }
}

test('递归读取所选库，中文、英文及符号原样匹配，范围和路径排序一致', async () => {
  const f = fixture(); await f.index.build(f.storage)
  assert.equal(f.index.status.phase, 'ready'); assert.equal(f.index.status.indexed, 3); assert.equal(f.index.status.folders, 3)
  assert.equal(f.index.search('中文').total, 3); assert.equal(f.index.search('中文', 'content').total, 2)
  assert.equal(f.index.search('中文', 'path').total, 1); assert.equal(f.index.search('中文').hits[0].relativePath, '中文名.txt')
  assert.equal(f.index.search('[ ]').total, 2); assert.equal(f.index.search('alpha').total, 1)
  assert.equal(f.index.search('中文 想法').total, 0, '不隐式分词或解释搜索语法')
  assert.equal(f.index.search('秘密').total, 0); assert.equal(f.index.search('不搜索').total, 0)
  assert.ok(!f.controls.reads.some(path => path.includes('.private') || path.endsWith('.csv')))
  const unicode = fixture({ 'unicode.txt': '\u0130中文 test' }); await unicode.index.build(unicode.storage)
  assert.equal(unicode.index.search('中文').hits[0].excerpt.hit, '中文', '使用实际匹配偏移，前面的 Unicode 大小写变化不移动命中位置')
})
test('刷新不依赖修改时间，删除、外部同时间改文、添加都反映到结果；不读取草稿', async () => {
  const f = fixture({ 'a.md': '旧词', 'remove.txt': '将删除' }); await f.index.build(f.storage)
  f.documents.get('a.md').content = '新词'; f.documents.delete('remove.txt'); f.documents.set('new.txt', { rootId: 'local', relativePath: 'new.txt', content: '新增', signature: 'new', modified: 1 })
  f.index.markStale(); assert.equal(f.index.status.stale, true)
  await f.index.build(f.storage)
  assert.equal(f.index.search('旧词').total, 0); assert.equal(f.index.search('将删除').total, 0)
  assert.equal(f.index.search('新词').total, 1); assert.equal(f.index.search('新增').total, 1); assert.equal(f.index.status.stale, false)
})
test('源码片段保留真实换行和字面命中，普通摘要与路径范围保持原有语义', async () => {
  const source='def read_text(path):\r\n    """读取并阅读文本。"""\r\n    return "<svg onload=leak()>"\r\n'
  const f=fixture({'sample.py':source,'notes.md':'段落一\n阅读文本\n段落二'});await f.index.build(f.storage)
  const result=f.index.search('阅读'),code=result.hits.find(h=>h.relativePath==='sample.py'),note=result.hits.find(h=>h.relativePath==='notes.md')
  assert.equal(code.codeExcerpt.before+code.codeExcerpt.hit+code.codeExcerpt.after,source)
  assert.equal(code.codeExcerpt.hit,'阅读');assert.ok(!code.excerpt.before.includes('\n'));assert.equal(note.codeExcerpt,undefined)
  assert.equal(f.index.search('sample','path').hits[0].codeExcerpt,undefined)
  assert.equal(f.documents.get('sample.py').content,source);assert.equal(f.controls.reads.length,2)
})
test('提供器失败与截断保留部分结果及具体说明，不声称覆盖全部；权限丢失清除文本', async () => {
  const f = fixture({ 'good.txt': '中文', 'folder/bad.md': '中文', 'bad.txt': '中文' })
  f.controls.failFolder = 'folder'; f.controls.failFile = 'bad.txt'; f.controls.truncated = true
  await f.index.build(f.storage)
  assert.equal(f.index.status.phase, 'partial'); assert.equal(f.index.status.indexed, 1); assert.ok(f.index.status.issueCount >= 3)
  assert.equal(f.index.search('中文').total, 1)
  f.controls.available = false; assert.equal(await f.index.verifyAccess(f.storage), false)
  assert.equal(f.index.status.phase, 'unavailable'); assert.equal(f.index.search('中文').total, 0); assert.equal(f.index.status.indexed, 0)
})
test('文件、容量、文件夹及层数预算都明确标记部分读取，结果条数单独截断并统计总数', async () => {
  for (const limits of [{ files: 1 }, { bytes: 5 }, { folders: 1 }, { depth: 0 }, { fileBytes: 3 }]) {
    const f = fixture(); f.index = new LibrarySearchIndex('local', () => {}, { ...SEARCH_LIMITS, ...limits })
    await f.index.build(f.storage); assert.equal(f.index.status.phase, 'partial', JSON.stringify(limits)); assert.ok(f.index.status.issueCount)
  }
  const f = fixture({ 'a.txt': '词', 'b.txt': '词', 'c.txt': '词' })
  f.index = new LibrarySearchIndex('local', () => {}, { ...SEARCH_LIMITS, results: 1 }); await f.index.build(f.storage)
  assert.equal(f.index.search('词').total, 3); assert.equal(f.index.search('词').hits.length, 1)
  assert.equal(f.index.status.phase, 'ready', '结果数量限制不伪装成读取失败')
})
test('停止后的迟到回执、旧授权检查和切换库不污染新状态；重读可恢复', async () => {
  const f = fixture({ 'a.md': '慢文件' }); f.controls.gate = deferred()
  const building = f.index.build(f.storage); await new Promise(r => setImmediate(r))
  f.index.stop(); assert.equal(f.index.status.phase, 'partial'); assert.equal(f.index.status.indexed, 0)
  f.controls.gate.resolve(); await building; assert.equal(f.index.status.indexed, 0); assert.equal(f.index.search('慢文件').total, 0)
  f.controls.gate = null; await f.index.build(f.storage); assert.equal(f.index.search('慢文件').total, 1)
  f.controls.rootsGate = deferred(); const verify = f.index.verifyAccess(f.storage)
  f.index.reset('other-root'); f.controls.rootsGate.resolve(); await verify
  assert.equal(f.index.status.rootId, 'other-root'); assert.equal(f.index.status.phase, 'idle'); assert.equal(f.index.search('慢文件').total, 0)
})
test('读取中撤销权限立即清除已读取文稿，异常身份与越界位置不会进入索引', async () => {
  const f = fixture({ 'good.md': '私密词', 'denied.md': '私密词' })
  const read = f.storage.read; f.storage.read = async id => { if (id.relativePath === 'denied.md') throw Error('PERMISSION: 授权失效'); return read(id) }
  await f.index.build(f.storage); assert.equal(f.index.status.phase, 'unavailable'); assert.equal(f.index.search('私密词').total, 0)
  const invalid = fixture({ 'fake.md': '私密词' }), list = invalid.storage.list
  invalid.storage.list = async (...args) => { const value = await list(...args); value.entries.push({ name: '../outside.md', relativePath: '../outside.md', directory: false }); return value }
  invalid.storage.read = async id => ({ rootId: 'other', relativePath: id.relativePath, content: '私密词' })
  await invalid.index.build(invalid.storage); assert.equal(invalid.index.status.phase, 'partial'); assert.equal(invalid.index.status.indexed, 0)
  assert.ok(invalid.index.status.issues.some(issue => /无效位置/.test(issue.message)))
  const duplicate = fixture({ 'duplicate.md': '歧义内容' }), duplicateList = duplicate.storage.list
  duplicate.storage.list = async (...args) => { const value = await duplicateList(...args); value.entries.push({ ...value.entries[0] }); return value }
  await duplicate.index.build(duplicate.storage); assert.equal(duplicate.index.status.phase, 'partial'); assert.equal(duplicate.index.status.indexed, 0)
  assert.deepEqual(duplicate.controls.reads, [], '同名歧义条目两项都不能被读取')
})
test('恶意文稿保持纯数据，长查询拒绝；新实例不持久保存或继承旧内容', async () => {
  const f = fixture(); await f.index.build(f.storage)
  const hit = f.index.search('<svg onload="leak()">').hits[0]
  assert.equal(hit.excerpt.hit, '<svg onload="leak()">')
  assert.equal(f.index.search('x'.repeat(129)).total, 0)
  const fresh = new LibrarySearchIndex('local'); assert.equal(fresh.search('中文').total, 0); assert.equal(fresh.status.phase, 'idle')
})

test('名称路径只读目录：正文不可读或超过正文预算，仍能定位文件且不误称全文已准备', async () => {
  const f = fixture({ '外部/大文稿.md': 'x'.repeat(128), '无法解码.txt': '正文不可读' })
  f.controls.failFile = '无法解码.txt'
  f.index = new LibrarySearchIndex('local', () => {}, { ...SEARCH_LIMITS, fileBytes: 1, bytes: 1 })
  await f.index.build(f.storage, 'paths')
  assert.equal(f.index.status.scope, 'paths'); assert.equal(f.index.status.phase, 'ready'); assert.equal(f.index.status.bytes, 0)
  assert.deepEqual(f.controls.reads, [])
  assert.equal(f.index.search('大文稿', 'path').total, 1)
  assert.equal(f.index.search('大文稿', 'path').hits[0].signature, null)
  assert.equal(f.index.search('大文稿', 'all').total, 0, '目录快照不得伪装成全文快照')
})

test('从目录快照升级为正文快照会重新读取正文，保留真实失败与来源签名', async () => {
  const f = fixture({ '笔记.md': '中文源文', '坏文件.txt': '不可读取' })
  await f.index.build(f.storage, 'paths'); f.controls.failFile = '坏文件.txt'
  await f.index.build(f.storage, 'content')
  assert.equal(f.index.status.scope, 'content'); assert.equal(f.index.status.phase, 'partial')
  assert.equal(f.index.search('中文', 'content').hits[0].signature, '中文源文')
  assert.equal(f.index.search('坏文件', 'path').total, 0)
  const reads = f.controls.reads.length
  await f.index.build(f.storage, 'paths')
  assert.equal(f.index.search('坏文件', 'path').total, 1, '正文失败不妨碍重新按目录定位文件')
  assert.equal(f.controls.reads.length, reads)
})

test('异步扫描与原有字面匹配、稳定顺序和显示上限一致', async () => {
  const f = fixture(Object.fromEntries(Array.from({ length: 180 }, (_, i) => [`文稿${String(i).padStart(3, '0')}.md`, '中文 [ ] alpha'])))
  await f.index.build(f.storage)
  for (const field of ['all', 'content', 'path']) assert.deepEqual(await f.index.searchAsync('文稿', field), f.index.search('文稿', field))
  assert.deepEqual(await f.index.searchAsync('[ ]'), f.index.search('[ ]'))
  assert.equal((await f.index.searchAsync('中文')).total, 180)
  assert.equal((await f.index.searchAsync('中文')).hits.length, 100)
})

test('接近文本预算的无命中扫描能让出事件循环并响应取消，不发布部分结果', async () => {
  const text = 'x'.repeat(180 * 1024)
  const f = fixture(Object.fromEntries(Array.from({ length: 128 }, (_, i) => [`文稿${i}.md`, text])))
  await f.index.build(f.storage)
  const controller = new AbortController(); let heartbeat = false
  const running = f.index.searchAsync('并不存在的词', 'content', controller.signal)
  setTimeout(() => { heartbeat = true; controller.abort() }, 0)
  assert.equal(await running, null); assert.equal(heartbeat, true)
  assert.equal(f.index.status.indexed, 128, '取消匹配不会删除已读取的快照')
})

test('新查询、切库和撤销授权会取消旧扫描，旧任务无法覆盖新结果', async () => {
  const f = fixture(Object.fromEntries(Array.from({ length: 180 }, (_, i) => [`文稿${i}.md`, '旧词 新词'])))
  await f.index.build(f.storage)
  const old = f.index.searchAsync('旧词'), current = f.index.searchAsync('新词')
  assert.equal(await old, null); assert.equal((await current).total, 180)
  const changingRoot = f.index.searchAsync('旧词'); f.index.reset('another')
  assert.equal(await changingRoot, null)
  f.index.reset('local'); await f.index.build(f.storage)
  const revoked = f.index.searchAsync('旧词'); f.controls.available = false; await f.index.verifyAccess(f.storage)
  assert.equal(await revoked, null); assert.equal(f.index.status.phase, 'unavailable')
})
