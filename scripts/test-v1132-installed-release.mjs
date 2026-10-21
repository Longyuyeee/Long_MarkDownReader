import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {test} from 'node:test'
test('restore driver uses trusted UI, expressions parse, and all release stages verify actual bytes',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-32-workflow.mjs','utf8'),tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const value=node.arguments[0];if(value&&(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value)||ts.isTemplateExpression(value))){const script=ts.isTemplateExpression(value)?value.head.text+value.templateSpans.map(span=>'__fixture__'+span.literal.text).join(''):value.text;assert.doesNotThrow(()=>new vm.Script(script),script);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=20)
 assert.ok(fs.readFileSync('scripts/import-community-release-review.mjs','utf8').includes("[['restoreContinuity',reports.restoreContinuity.file]]"));for(const file of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertRestoreContinuityOutputBytes'),file)
 for(const forbidden of ['dispatchEvent(','__TAURI_INTERNALS__=','force: true'])assert.ok(!source.includes(forbidden));assert.ok(source.includes("path.join(owner,'.v119-installed-owner')"));assert.ok(fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8').includes('runInstalledV1132Workflow'))
})
