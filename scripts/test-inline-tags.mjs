import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendInlineTag, inlineTags, normalizeInlineTag } from '../src/utils/inlineTags.ts'

test('Draft tags preserve native boundaries, unique labels and case', () => {
  assert.deepEqual(inlineTags('# Heading\n#项目 #项目。 #release-v1! #工作， #Work #work\ntext#not-a-tag'), ['项目', 'release-v1', '工作', 'Work', 'work'])
  assert.deepEqual(inlineTags('## Heading\n\nplain text'), [])
})
test('Typing a leading hash is accepted without introducing a second hash', () => {
  assert.equal(normalizeInlineTag(' #项目 '), '项目')
  for (const tag of ['', 'two tags', '项目。', 'foo#bar', '`code`']) assert.throws(() => normalizeInlineTag(tag))
})
test('Adding appends a separate line and keeps the existing note intact', () => {
  assert.equal(appendInlineTag('原文', '#工作'), '原文\n\n#工作\n')
  assert.equal(appendInlineTag('原文\n', '工作'), '原文\n\n#工作\n')
  assert.equal(appendInlineTag('原文\n\n', '工作'), '原文\n\n#工作\n')
  assert.equal(appendInlineTag('', '工作'), '#工作\n')
  assert.throws(() => appendInlineTag('原文 #工作。', '#工作'), /已经有/)
})
