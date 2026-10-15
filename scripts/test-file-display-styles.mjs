import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'

const context = vm.createContext({ exports: {} })
vm.runInContext(ts.transpile(fs.readFileSync('src/utils/fileDisplayStyles.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context)
const { fileStylePathKey, normalizeFileDisplayStyles, moveFileDisplayStyleEntries, copyFileDisplayStyleEntries, fileMarkerColors } = context.exports
const style = { backgroundColor: '#ffe0eb', textColor: '', icon: 'rocket', selectionStyle: 'outline', selectedTextColor: '#243e59', selectedAccentColor: '#4d8fde' }
const plain = value => JSON.parse(JSON.stringify(value))

test('File and folder copies keep source styles and create independent styles on the copied paths', () => {
  const source = { 'C:/Vault/Folder/Plan.md': style, 'C:/Vault/Folder/Nested/Note.md': style, 'C:/Vault/Folder-other/Plan.md': style }
  const copied = plain(copyFileDisplayStyleEntries(source, '\\\\?\\c:\\vault\\folder', 'C:/Vault/Copy'))
  assert.deepEqual(copied['c:/vault/copy/plan.md'], style)
  assert.deepEqual(copied['c:/vault/copy/nested/note.md'], style)
  assert.deepEqual(copied['c:/vault/folder/plan.md'], style)
  copied['c:/vault/copy/plan.md'].icon = 'heart'
  assert.equal(copied['c:/vault/folder/plan.md'].icon, 'rocket')
  assert.equal(copied['c:/vault/copy-other/plan.md'], undefined)
})

test('Windows paths keep one file identity across canonical prefixes, slash/case variations and UNC paths', () => {
  assert.equal(fileStylePathKey('\\\\?\\C:\\Vault\\Plan.md'), fileStylePathKey('c:/vault/plan.md'))
  assert.equal(fileStylePathKey('\\\\?\\UNC\\Server\\Share\\Plan.md'), fileStylePathKey('\\\\server\\share\\plan.md'))
  assert.notEqual(fileStylePathKey('/home/Plan.md'), fileStylePathKey('/home/plan.md'))
})

test('File and folder moves retain every style field, remove old keys and leave similarly named siblings alone', () => {
  const source = { 'C:/Vault/Folder/Plan.md': style, '\\\\?\\C:\\Vault\\Folder\\Nested\\Note.md': style, 'C:/Vault/Folder-other/Plan.md': style }
  const moved = plain(moveFileDisplayStyleEntries(source, '\\\\?\\c:\\vault\\folder', 'C:/Vault/Inbox/Renamed'))
  assert.deepEqual(moved['c:/vault/inbox/renamed/plan.md'], style)
  assert.deepEqual(moved['c:/vault/inbox/renamed/nested/note.md'], style)
  assert.deepEqual(moved['c:/vault/folder-other/plan.md'], style)
  assert.equal(moved['c:/vault/folder/plan.md'], undefined)
  const renamed = plain(moveFileDisplayStyleEntries(moved, 'C:/VAULT/Inbox/Renamed/Plan.md', '\\\\?\\C:\\Vault\\Inbox\\Renamed\\New.md'))
  assert.deepEqual(renamed['c:/vault/inbox/renamed/new.md'], style)
  assert.equal(renamed['c:/vault/inbox/renamed/plan.md'], undefined)
  assert.deepEqual(plain(normalizeFileDisplayStyles(source))['c:/vault/folder/plan.md'], style)
})

test('Chosen selected colors are exact, outline/marker keep the background, and automatic text stays readable', () => {
  const explicit = { ...style, selectionStyle: 'fill', selectedBackgroundColor: '#243e59', selectedTextColor: '#ffffff' }
  assert.equal(fileMarkerColors(explicit).selectedBackground, '#243e59')
  assert.equal(fileMarkerColors(explicit).selectedText, '#ffffff')
  for (const selectionStyle of ['outline', 'marker']) assert.equal(fileMarkerColors({ ...explicit, selectionStyle }).selectedBackground, style.backgroundColor)
  assert.equal(fileMarkerColors({ backgroundColor: '#ffe0eb' }).text, '#253041')
  assert.equal(fileMarkerColors({ backgroundColor: '#101820' }).text, '#f8fafc')
})

test('A settings write failure after a physical move keeps the style at the new location for retry', async () => {
  const storeSource = fs.readFileSync('src/store/app.ts', 'utf8')
  const start = storeSource.indexOf('    async moveFileDisplayStyles(')
  const end = storeSource.indexOf('    async removeFileDisplayStyles(', start)
  vm.runInContext(ts.transpile('globalThis.moveAction = ({' + storeSource.slice(start, end) + '}).moveFileDisplayStyles;', { target: ts.ScriptTarget.ES2022 }), context)
  const store = { fileDisplayStyles: { 'C:/Vault/Plan.md': style }, updateConfig: async () => { throw Error('settings unavailable') } }
  await assert.rejects(context.moveAction.call(store, '\\\\?\\C:\\Vault\\Plan.md', 'C:/Vault/Inbox/Plan.md'), /settings unavailable/)
  assert.deepEqual(plain(store.fileDisplayStyles)['c:/vault/inbox/plan.md'], style)
  assert.equal(store.fileDisplayStyles['c:/vault/plan.md'], undefined)
})
