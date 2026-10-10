import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
import { compile } from '@vue/compiler-dom'
import * as Vue from 'vue'
import { renderToString } from '@vue/server-renderer'

const source = fs.readFileSync('src/utils/searchHighlight.ts', 'utf8')
const sandbox = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox)
const highlight = (text, query) => JSON.parse(JSON.stringify(sandbox.exports.searchHighlight(text, query)))

for (const [text, query, matches] of [
  ['预算确认与预算修订', '预算', ['预算', '预算']],
  ['Needle needle NEEDLE', ' needle ', ['Needle', 'needle', 'NEEDLE']],
  ['a.b axb [x]', 'a.b', ['a.b']],
  ['İ🙂预算', '预算', ['预算']],
  ['İstanbul', 'i', ['İ']],
  ['🙂🙂', '🙂', ['🙂🙂']],
  ['正常文字', '', []],
  ['没有结果', '预算', []],
]) {
  test(`literal highlight preserves content: ${text} / ${query}`, () => {
    const parts = highlight(text, query)
    assert.equal(parts.map(p => p.text).join(''), text)
    assert.deepEqual(parts.filter(p => p.match).map(p => p.text), matches)
  })
}

test('actual highlight template escapes file content instead of rendering HTML', async () => {
  const component = fs.readFileSync('src/components/SearchHighlight.vue', 'utf8')
  const template = component.slice(component.indexOf('<template>') + 10, component.lastIndexOf('</template>'))
  const render = new Function('Vue', compile(template, { mode: 'function' }).code)(Vue)
  const text = '<img src=x onerror=alert(1)>预算'
  const app = Vue.createSSRApp({ setup: () => ({ parts: highlight(text, '预算') }), render })
  const html = await renderToString(app)
  assert.ok(html.includes('&lt;img'))
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('<mark class="search-match">预算</mark>'))
})
