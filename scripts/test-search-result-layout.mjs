import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const card = fs.readFileSync('src/components/SearchFileCard.vue', 'utf8')
const rule = selector => {
  const start = card.lastIndexOf(`${selector}{`)
  assert.ok(start >= 0, selector)
  return card.slice(start, card.indexOf('}', start) + 1)
}
test('file card has one full-width column; relation badge follows its title and locations', () => {
  assert.match(rule('.search-file-card'), /min-width:0/)
  assert.match(rule('.search-file-title'), /flex:1;min-width:100px/)
  assert.match(card, /<slot\/>\s*<\/article>/)
  assert.match(source, /<SearchFileCard[^>]+><RelationSummaryBadge/)
})
test('title and metadata stack; long titles wrap and snippets remain bounded', () => {
  assert.match(rule('.search-file-path'), /display:block/)
  assert.match(rule('.search-file-title strong'), /overflow-wrap:anywhere/)
  assert.match(rule('.search-file-snippet'), /-webkit-line-clamp:2/)
  assert.doesNotMatch(rule('.search-file-title strong'), /white-space:nowrap/)
})
test('full title and separate file/graph actions remain available', () => {
  assert.match(card, /:aria-label="`打开 \$\{file.title\}`" @click="\$emit\('open', first\)"/)
  assert.match(card, /:title="file.path"/)
  assert.match(source, /@open="openKnowledgeSearchResult"/)
  assert.match(source, /@open="openRelationGraph\(file.path\)"/)
  assert.match(card, /button:focus-visible,summary:focus-visible\{outline:2px/)
})
test('actual file card stacks narrow actions and retains all lazy internal positions',()=>{
  assert.match(card, /@container \(max-width:280px\)\{.search-file-heading\{display:block\}/)
  assert.match(card, /:open="extraOpen"/)
  assert.match(card, /file.matches.slice\(3\)/)
  assert.match(card, /v-if="summaryOpen"/)
})
