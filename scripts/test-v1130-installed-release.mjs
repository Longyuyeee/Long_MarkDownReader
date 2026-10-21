// Parse the actual cross-process driver expressions before spending a native
// installation run. This is a contract check, never installed acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {test} from 'node:test'
test('native Table validation observations parse and every publication stage binds actual output bytes',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-30-workflow.mjs','utf8'),tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const value=node.arguments[0];if(value&&(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value)||ts.isTemplateExpression(value))){const script=ts.isTemplateExpression(value)?value.head.text+value.templateSpans.map(span=>'__fixture__'+span.literal.text).join(''):value.text;assert.doesNotThrow(()=>new vm.Script(script),script);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=20)
 assert.ok(source.includes("path.join(folder,'.v119-installed-owner')"),'Native clipboard and focus helpers require the owned fixture marker')
 for(const forbidden of ['dispatchEvent(','__TAURI_INTERNALS__=','force: true'])assert.ok(!source.includes(forbidden))
 for(const file of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertTableValidationOutputBytes'),file)
 assert.ok(fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8').includes('runInstalledV1130Workflow'))
})
