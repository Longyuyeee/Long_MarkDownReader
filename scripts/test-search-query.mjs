import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { parseSearchQuery, searchQueryNeedle } from '../src/utils/searchQuery.ts'
import { searchTermsHighlight } from '../src/utils/searchHighlight.ts'
for (const example of JSON.parse(fs.readFileSync('shared/search-query-examples.json', 'utf8'))) test('query grammar: ' + JSON.stringify(example.query), () => {
  if (example.error) assert.throws(() => parseSearchQuery(example.query))
  else assert.deepEqual(parseSearchQuery(example.query), { positive: example.positive, negative: example.negative })
})
test('highlight preserves Unicode and HTML as text, ignores exclusions and joins overlaps', () => {
  const text = '项目预算🙂İ <img> 旧版'
  const result = searchTermsHighlight(text, parseSearchQuery('项目 预算 i -旧版').positive)
  assert.equal(result.map(part => part.text).join(''), text)
  assert.deepEqual(result.filter(part => part.match).map(part => part.text), ['项目预算', 'İ', 'i'])
  assert.equal(searchTermsHighlight('预算', parseSearchQuery('-旧版').positive).some(part => part.match), false)
})
test('query limits and editor needles do not include operators or excluded words', () => {
  assert.throws(() => parseSearchQuery('a'.repeat(501))); assert.throws(() => parseSearchQuery(Array.from({ length: 17 }, (_, n) => n).join(' ')))
  assert.equal(searchQueryNeedle('项目 预算 -旧版', '这份预算已确认'), '预算')
  assert.equal(searchQueryNeedle('"项目 预算" -旧版'), '项目 预算')
  assert.equal(searchQueryNeedle('-旧版'), '')
})
