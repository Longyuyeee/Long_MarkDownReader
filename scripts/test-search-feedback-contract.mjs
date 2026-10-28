import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {test} from 'node:test'
import { searchFeedbackContract, paletteFileOpenExpression } from './lib/search-feedback-contract.mjs'
const evaluate=(expression,nodes)=>vm.runInNewContext(expression,{document:{querySelector:selector=>nodes[selector]||null}})

function installedResultWaiter(initial, refreshed) {
  const source=fs.readFileSync('scripts/lib/installed-v1-1-5-workflow.mjs','utf8')
  const helper=source.slice(source.indexOf('  const resultReady ='),source.indexOf('  const normalize ='))
  const files=new Set(initial), calls={waits:0,refreshes:0}
  const context=vm.createContext({files,palette:'.palette',result:name=>`files.has(${JSON.stringify(name)})`,document:{querySelector:()=>({})}})
  context.evaluate=async expression=>vm.runInContext(expression,context)
  context.waitFor=async expression=>{calls.waits++;assert.ok(await context.evaluate(expression))}
  context.mouse=async expression=>{assert.match(expression,/search-page-update button:not\(\[disabled\]\)/);calls.refreshes++;for(const name of refreshed)files.add(name)}
  return {wait:vm.runInContext(helper+';resultReady',context),calls,files}
}

test('installed all-library probe waits for all expected files after the smaller library finishes',async()=>{
  const probe=installedResultWaiter(['remote'],['main','data'])
  await probe.wait(['main','data','remote'],'all three files')
  assert.equal(probe.calls.refreshes,1)
  assert.equal(probe.calls.waits,2)
  assert.deepEqual([...probe.files].sort(),['data','main','remote'])
})

test('installed one-file probe keeps an already visible result without unnecessary refresh',async()=>{
  const probe=installedResultWaiter(['remote'],[])
  await probe.wait('remote','one file')
  assert.equal(probe.calls.refreshes,0)
})

test('installed all-library probe still rejects a missing file after its bounded visible updates',async()=>{
  const probe=installedResultWaiter(['remote'],[])
  await assert.rejects(probe.wait(['main','remote'],'missing file'),/Expected search files absent/)
  assert.equal(probe.calls.refreshes,8)
})

test('grouped palette targets the exact filename open button, never its row, substring or reference',()=>{
  const name='v115-预算资料.txt', scope='.command-palette-container '
  const button=label=>({getAttribute:key=>key==='aria-label'?label:null})
  const wrong=button('打开 v115-预算资料-旧版.txt'), reference=button('在侧边参考 '+name), exact=button('打开 '+name)
  const expression=paletteFileOpenExpression(name)
  const document={querySelector:selector=>selector===scope+'.search-file-card'?{}:null,querySelectorAll:selector=>selector===scope+'.search-file-title'?[wrong,reference,exact]:[]}
  assert.equal(vm.runInNewContext(expression,{document}),exact)
  document.querySelectorAll=()=>[wrong,reference]
  assert.equal(vm.runInNewContext(expression,{document}),undefined)
  const component=fs.readFileSync('src/components/SearchFileCard.vue','utf8')
  assert.match(component,/class="knowledge-result-open search-file-title"[^>]*:aria-label="`打开 \$\{file.title\}`"[^>]*@click="\$emit\('open', first\)"/)
})

test('legacy palette accepts exact stem or full filename while rejecting a near-duplicate title',()=>{
  const row=title=>({querySelector:selector=>selector==='.item-title'?{textContent:title}:null})
  const wrong=row('v115-预算资料-旧版'), exact=row('v115-预算资料'), full=row('v115-预算资料.txt')
  const document={querySelector:()=>null,querySelectorAll:()=>[wrong,exact]}
  const expression=paletteFileOpenExpression('v115-预算资料.txt')
  assert.equal(vm.runInNewContext(expression,{document}),exact)
  document.querySelectorAll=()=>[wrong,full]
  assert.equal(vm.runInNewContext(expression,{document}),full)
  document.querySelectorAll=()=>[wrong]
  assert.equal(vm.runInNewContext(expression,{document}),undefined)
})
test('new completed zero is distinct from preparation, failure and a local format-filter zero',()=>{
  const feedback=searchFeedbackContract(true,'.palette')
  for(const text of ['尚未获得可用文件，不代表没有匹配。','结果尚未查全','当前已加载文件中没有所选格式。',''])assert.equal(evaluate(feedback.emptyExpression,{'.palette .search-page-empty':{textContent:text}}),false)
  assert.equal(evaluate(feedback.emptyExpression,{'.palette .search-page-empty':{textContent:'没有找到匹配内容'}}),true)
  assert.equal(evaluate(feedback.emptyExpression,{}),false)
  assert.equal(feedback.error,'.palette .search-page-error')
})
test('legacy installed packages retain their original empty/error contract',()=>{
  const feedback=searchFeedbackContract(false,'.palette')
  assert.equal(evaluate(feedback.emptyExpression,{'.palette .no-results':{}}),true)
  assert.equal(evaluate(feedback.emptyExpression,{'.palette .search-page-empty':{textContent:'没有找到匹配内容'}}),false)
  assert.equal(feedback.error,'.palette .search-feedback-error');assert.equal(feedback.incompleteText,'搜索未完成')
})
test('installed scenarios count file cards, retain trusted keyboard retry and never use a broad empty union',()=>{
  const scenario=fs.readFileSync('scripts/lib/installed-search-user-scenario.mjs','utf8')
  assert.match(scenario,/search-file-card'\)\.length \|\| document.querySelectorAll/)
  assert.match(scenario,/await tabTo\(feedback.error\+' button'\)/)
  assert.match(scenario,/e\.trusted/)
  const hardening=fs.readFileSync('scripts/lib/installed-v1-1-5-workflow.mjs','utf8')
  assert.ok(hardening.indexOf('const feedback=searchFeedbackContract')<hardening.indexOf("await query('\"未结束')"),'detect protocol while the valid page status exists')
  assert.match(hardening,/await waitFor\(feedback.emptyExpression, 'genuine empty result'\)/)
  assert.ok(hardening.indexOf("await selectScope('当前资料库')")<hardening.indexOf("await query('v115-不存在-410974')"),'genuine zero uses a normally opened readable library, not the mixed incomplete range')
  assert.match(hardening,/assert\.equal\(normalize\(report\.emptyResultScope\.activeLibrary\), normalize\(second\)/)
  assert.doesNotMatch(hardening,/\.no-results,\s*\.search-page-empty/)
})
