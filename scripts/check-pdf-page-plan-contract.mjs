import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [planSource, view, pageComponent, pdfCommands] = await Promise.all([
  read('src/utils/pdfPagePlan.ts'),
  read('src/views/PdfView.vue'),
  read('src/components/PdfPage.vue'),
  read('src-tauri/src/commands/pdf.rs'),
])

const transpiled = ts.transpileModule(planSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const plan = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`)

const original = plan.createPdfPagePlan(3)
assert.deepEqual(original.map(entry => entry.sourcePage), [1, 2, 3])
assert.ok(original.every(entry => entry.rotation === 0 && !entry.removed))

const rotated = plan.rotatePdfPage(original, original[0].id, -90)
assert.equal(rotated[0].rotation, 270)
assert.equal(original[0].rotation, 0, 'page operations must not mutate their input snapshot')

const reordered = plan.movePdfPage(rotated, rotated[0].id, 1)
assert.deepEqual(reordered.map(entry => entry.sourcePage), [2, 1, 3])

const removed = plan.setPdfPageRemoved(reordered, reordered[0].id, true)
assert.equal(removed[0].removed, true)
assert.deepEqual(plan.summarizePdfPagePlan(removed), {
  rotated: 1,
  moved: 2,
  removed: 1,
  changed: 4,
})

const requireText = (source, text, message) => {
  if (!source.includes(text)) throw new Error(message)
}

for (const text of [
  '页面整理草稿',
  '先在内存中预览',
  'pagePlanUndo',
  'pagePlanRedo',
  'visiblePagePlan.length <= 1',
  'onBeforeRouteLeave',
  'beforeunload',
]) requireText(view, text, `B0 PDF page organizer contract missing: ${text}`)

requireText(pageComponent, 'rotation?: number', 'PDF preview must accept a non-destructive relative rotation')
requireText(pageComponent, 'page.rotate + normalizedRotation.value', 'PDF preview must preserve the source page rotation')
if (/write_pdf_(pages?|document)|save_pdf_(pages?|document)/.test(pdfCommands)) {
  throw new Error('B0 must not expose a PDF rewrite command before B1 reliable-save gates exist')
}

for (const text of [
  '验证隔离副本',
  'preview_pdf_page_plan_isolated_copy',
  'expectedSignature',
  '源文件未修改',
  '当前仍不提供覆盖保存',
]) requireText(view, text, `B1A PDF isolated-copy contract missing: ${text}`)

for (const text of [
  'MAX_PDF_ISOLATED_INPUT_BYTES',
  'pdf_plan_blockers',
  'digital_signature_unverified',
  'acroform_unverified',
  'structural_reparse_verified',
  'text_order_verified',
  'source_unchanged',
]) requireText(pdfCommands, text, `B1A PDF backend safety gate missing: ${text}`)

console.log('PDF B0/B1A contract passed: immutable planning, history/leave guards, signature-protected isolated generation, risk blockers, reparse verification, and no source rewrite.')
