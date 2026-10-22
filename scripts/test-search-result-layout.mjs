import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {parse,compileScript} from '@vue/compiler-sfc'
import * as Vue from 'vue'
import * as Lucide from 'lucide-vue-next'
import {renderToString} from '@vue/server-renderer'
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
const statusDescriptor=parse(fs.readFileSync('src/components/SearchPageStatus.vue','utf8')).descriptor
const statusScript=compileScript(statusDescriptor,{id:'search-refresh-status',inlineTemplate:true})
function compileComponent(path, dependencies) {
  const descriptor = parse(fs.readFileSync(path, 'utf8')).descriptor
  const script = compileScript(descriptor, { id: path, inlineTemplate: true })
  const context = { exports: {}, require: name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected component dependency: ${name}`)
    return dependencies[name]
  }}
  vm.runInNewContext(ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context.exports
}
const helpModule = compileComponent('src/components/workspace/WorkspaceHelp.vue', { vue: Vue, 'lucide-vue-next': Lucide })
const statusModule={exports:{},require:name=>{
  if (name === 'vue') return Vue
  assert.equal(name, './workspace/WorkspaceHelp.vue')
  return helpModule
}}
vm.runInNewContext(ts.transpileModule(statusScript.content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,statusModule)
function statusProps(busy,retaining){return {sort:'relevance',page:{busy:Vue.ref(busy),retainingView:Vue.ref(retaining),pendingView:Vue.ref(null),status:Vue.ref({totalFiles:244,scanComplete:true,scanState:'ready'}),files:Vue.ref([{}]),error:Vue.ref(''),errorCode:Vue.ref(''),nextPage:Vue.ref(null),canContinue:Vue.ref(false)}}}
test('actual status identifies old cards immediately, without presenting an old total as fresh results',async()=>{
  const html=await renderToString(Vue.h(statusModule.exports.default,statusProps(true,true)))
  assert.match(html,/正在重新搜索 · 暂时保留上次结果/);assert.match(html,/保留旧视图/)
  assert.doesNotMatch(html,/共 244|\/ 244/)
})
test('actual status retains a paused or failed replacement label and returns to normal after acceptance',async()=>{
  const paused=await renderToString(Vue.h(statusModule.exports.default,statusProps(false,true)))
  assert.match(paused,/暂时保留上次结果 · 本次搜索尚未完成/)
  const ready=await renderToString(Vue.h(statusModule.exports.default,statusProps(false,false)))
  assert.match(ready,/共 244/);assert.doesNotMatch(ready,/保留上次结果|保留旧视图/)
})
test('a loaded page failure exposes recovery in the actual footer instead of a disabled dead end',async()=>{
  assert.match(source, /<SearchPageStatus[^>]*part="footer"[^>]*@retry="retryKnowledgeSearch"/)
  assert.match(fs.readFileSync('src/components/CommandPalette.vue','utf8'), /<SearchPageStatus[^>]*part="footer"[^>]*@retry="retryPages"/)
  const props=statusProps(false,false);props.part='footer';props.page.error.value='续载暂时失败';props.page.errorCode.value='busy';props.page.nextPage.value='issued:40'
  const html=await renderToString(Vue.h(statusModule.exports.default,props))
  assert.match(html,/search-page-retry/);assert.match(html,/续载未完成/);assert.match(html,/>重试<\/button>/)
  assert.doesNotMatch(html,/>加载更多文件<\/button>/)
})
test('footer keeps precise restart/refresh semantics and normal paging returns after recovery',async()=>{
  for(const [code,label] of [['expired','重新搜索'],['invalidCursor','重新搜索'],['requestMismatch','重新搜索'],['snapshotChanged','刷新可用结果'],['unavailable','重试']]){
    const props=statusProps(true,true);props.part='footer';props.page.error.value='保留旧结果';props.page.errorCode.value=code
    const html=await renderToString(Vue.h(statusModule.exports.default,props))
    assert.match(html,/class="search-page-retry"/);assert.ok(html.includes(label));assert.match(html,/disabled/)
  }
  const props=statusProps(false,false);props.part='footer';props.page.nextPage.value='issued:40'
  const html=await renderToString(Vue.h(statusModule.exports.default,props))
  assert.match(html,/>加载更多文件<\/button>/);assert.doesNotMatch(html,/search-page-retry/)
})
