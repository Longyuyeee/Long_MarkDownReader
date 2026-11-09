import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), { parse: sfc } = require('@vue/compiler-sfc'), { parse } = require('@babel/parser')
const source = process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : 'src/mobile/MobileApp.vue'
const text = (sfc(await readFile(source, 'utf8')).descriptor.scriptSetup).content
const node = parse(text, { sourceType: 'module', plugins: ['typescript'] }).program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'save')
assert.ok(node)
const handler = text.slice(node.start, node.end)
const output = `docs/evidence/mobile-0.1.0/save-recent-lifetime-${Date.now()}`
await mkdir(output); await writeFile(output + '/.gitignore', '*\n')
const report = { scope: 'Actual save handler extracted from MobileApp; controlled metadata wait, not native IO', source, checks: [], passed: false }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
try {
  for (const replacement of [null, { rootId: 'other-root', relativePath: '另一篇.md' }]) {
    const saved = { rootId: 'saved-root', relativePath: '原稿.md' }, editor = { document: saved }, reached = deferred(), metadata = deferred(), invalidated = [], remembered = []
    let saves = 0
    const deps = { editor, session: { async save() { saves++ } }, needsLocalCopy: { value: false }, saveCopy: () => assert.fail('Unexpected copy'), remember(identity) { remembered.push(identity); reached.resolve(); return metadata.promise }, invalidateSearch: root => invalidated.push(root) }
    const save = new Function('deps', `const {editor, session, needsLocalCopy, saveCopy, remember, invalidateSearch} = deps; return (${handler})`)(deps)
    const pending = save(); await reached.promise; editor.document = replacement; metadata.resolve(); await pending
    assert.equal(saves, 1); assert.deepEqual(remembered, [saved]); assert.deepEqual(invalidated, ['saved-root'])
    report.checks.push(replacement ? 'Delayed recent persistence invalidates the saved root even if another document becomes current' : 'Closing while recent metadata waits does not dereference a cleared document')
  }
  let copies = 0
  const deps = { editor: { document: null }, session: { save: () => assert.fail('Unexpected original write') }, needsLocalCopy: { value: true }, saveCopy: async () => { copies++ }, remember: () => assert.fail('Unexpected metadata write'), invalidateSearch: () => assert.fail('Unexpected invalidation') }
  await new Function('deps', `const {editor, session, needsLocalCopy, saveCopy, remember, invalidateSearch} = deps; return (${handler})`)(deps)()
  assert.equal(copies, 1); report.checks.push('Existing save-copy admission still delegates once without writing the original'); report.passed = true
} catch (error) { report.failure = String(error.stack || error); process.exitCode = 1 }
finally { await writeFile(output + '/report.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ output, passed: report.passed, checks: report.checks.length, failure: report.failure })) }
