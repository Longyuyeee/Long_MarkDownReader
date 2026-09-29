import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const context = vm.createContext({ exports: {} })
vm.runInContext(ts.transpileModule(fs.readFileSync('src/utils/searchResultPath.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, context)
const { searchResultPath } = context.exports
test('same titles retain distinct directory identity', () => {
  assert.equal(searchResultPath('E:\\Notes\\团队A\\计划.md','e:\\notes'),'团队A/计划.md')
  assert.equal(searchResultPath('E:\\Notes\\团队B\\计划.md','E:\\Notes'),'团队B/计划.md')
})
test('native Windows extended and UNC paths remain readable', () => {
  assert.equal(searchResultPath('\\\\?\\E:\\Notes\\计划.md','E:\\Notes'),'计划.md')
  assert.equal(searchResultPath('\\\\?\\UNC\\server\\share\\计划.md','\\\\server\\share'),'计划.md')
})
test('sibling roots and case-sensitive Unix paths are not shortened incorrectly', () => {
  assert.equal(searchResultPath('E:/Notes-other/计划.md','E:/Notes'),'E:/Notes-other/计划.md')
  assert.equal(searchResultPath('/Notes/计划.md','/notes'),'/Notes/计划.md')
})
