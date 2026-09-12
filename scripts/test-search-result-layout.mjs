import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const rule = selector => {
  const start = source.indexOf(`${selector} {`)
  assert.ok(start >= 0, selector)
  return source.slice(start, source.indexOf('}', start) + 1)
}
test('result has one full-width column instead of badge stealing title width', () => {
  assert.match(rule('.knowledge-search-result'), /grid-template-columns: minmax\(0,1fr\);/)
  assert.match(rule('.knowledge-search-result'), /box-sizing: border-box/)
  assert.match(rule('.knowledge-search-result > .relation-summary'), /justify-self: start/)
})
test('title and metadata stack; long titles have bounded wrapping', () => {
  assert.match(rule('.knowledge-result-head'), /flex-direction: column/)
  assert.match(rule('.knowledge-result-head strong'), /overflow-wrap: anywhere/)
  assert.match(rule('.knowledge-result-head strong'), /-webkit-line-clamp: 2/)
  assert.doesNotMatch(rule('.knowledge-result-head strong'), /white-space: nowrap/)
})
test('full title and separate file/graph actions remain available', () => {
  assert.match(source, /:title="result.title" :aria-label="`打开 \$\{result.title\}`" @click="openKnowledgeSearchResult\(result\)"/)
  assert.match(source, /@open="openRelationGraph\(result.path\)"/)
  assert.match(rule('.knowledge-result-open:focus-visible'), /outline: 2px/)
})
