import assert from 'node:assert/strict'
import { test } from 'node:test'
import { noteLinkTargets } from '../src/utils/noteLinkTargets.ts'
const file = path => ({ path, name: path.split('/').pop(), is_dir: false })
test('Links find nested notes without depending on expanded tree nodes', () => {
  const files = ['C:/library/参考资料/调研.md', 'C:/library/Other.md', 'C:/library/调研.txt', 'C:/library/调研.md.exe'].map(file)
  assert.deepEqual(noteLinkTargets('参考资料/调研', files, 'C:/library', 'C:/library/方案.md').map(f => f.path), ['C:/library/参考资料/调研.md'])
  assert.equal(noteLinkTargets('缺失/调研', files, 'C:/library', 'C:/library/方案.md').length, 0)
})
test('Same-folder names win; ambiguous names remain selectable', () => {
  const files = ['C:/library/a/记录.md', 'C:/library/b/记录.md'].map(file)
  assert.equal(noteLinkTargets('记录', files, 'C:/library', 'C:/library/a/方案.md')[0].path, files[0].path)
  assert.equal(noteLinkTargets('记录', files, 'C:/library', 'C:/library/方案.md').length, 2)
})
test('Windows prefixes, separators and extension case share an identity', () => {
  const files = [file('\\\\?\\C:\\LIBRARY\\a\\Note.MD'), file('C:/library/a/Note.MD')]
  assert.equal(noteLinkTargets('note.md', files, 'C:/library', 'C:/library/a/方案.md').length, 1)
  assert.equal(noteLinkTargets('A\\NOTE.MD', files, 'C:/library', 'C:/library/方案.md').length, 1)
})
test('Only current-library Markdown files are offered, with POSIX case preserved', () => {
  const files = ['/library/Note.md', '/library/note.md', '/library-copy/Note.md', '/other/Note.md'].map(file)
  assert.deepEqual(noteLinkTargets('Note', files, '/library', '/library/plan.md').map(f => f.path), ['/library/Note.md'])
})
