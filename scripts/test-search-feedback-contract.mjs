import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {test} from 'node:test'
import { searchFeedbackContract } from './lib/search-feedback-contract.mjs'
const evaluate=(expression,nodes)=>vm.runInNewContext(expression,{document:{querySelector:selector=>nodes[selector]||null}})
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
  assert.doesNotMatch(hardening,/\.no-results,\s*\.search-page-empty/)
})
