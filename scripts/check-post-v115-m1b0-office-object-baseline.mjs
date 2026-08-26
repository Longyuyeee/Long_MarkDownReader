import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-m1b0-office-object-baseline-policy.json', 'utf8'))
const docxView = fs.readFileSync('src/views/DocxReaderView.vue', 'utf8')
const pptxView = fs.readFileSync('src/views/PptxReaderView.vue', 'utf8')
const pptxCommand = fs.readFileSync('src-tauri/src/commands/pptx.rs', 'utf8')
const failures = []

for (const marker of ['draftUndoStack', 'draftRedoStack', "save_docx_patch_source", '保存到原文件']) {
  if (!docxView.includes(marker)) failures.push(`DOCX direct-edit marker is missing: ${marker}`)
}
for (const marker of ['save_pptx_patch_copy', '可靠另存副本', '源 PPTX 始终只读']) {
  if (!pptxView.includes(marker) && !pptxCommand.includes(marker)) failures.push(`PPTX copy boundary marker is missing: ${marker}`)
}
for (const forbidden of ['save_pptx_patch_source', 'pptxDraftUndoStack', 'pptxDraftRedoStack']) {
  if (pptxView.includes(forbidden) || pptxCommand.includes(forbidden)) failures.push(`M1B0 actual boundary drifted; reassess before implementation: ${forbidden}`)
}
if (policy.expected.pptxDirectSourceSave !== true || policy.beforeActual.pptxDirectSourceSave !== false) failures.push('Expected/actual PPTX source-save gap is not explicit')
if (policy.expected.pptxDraftUndoRedo !== true || policy.beforeActual.pptxDraftUndoRedo !== false) failures.push('Expected/actual PPTX history gap is not explicit')

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('M1B0 contract accepted: DOCX is aligned; PPTX source save and unified history remain the measured gaps.')
