// Real Office Vue pages; isolated IPC contracts, never real documents or desktop.
import '/src/App.vue' // Include the actual shell's global typography, without mounting it.
import '/src/styles/motion.scss'
import '/src/styles/workflow-surfaces.scss'
const surface = new URL(location.href).searchParams.get('surface')
if (!['docx', 'pptx', 'workbook'].includes(surface)) throw Error('Unknown Office audit surface')
const clone = value => JSON.parse(JSON.stringify(value))
const audit = { blocked: false, requests: [], disk: null, savedText: null }
const proof = {
  outputDigest: 'a'.repeat(64), outputBytes: 2048, changedParts: ['ppt/slides/slide1.xml'],
  unchangedPartsVerified: true, structuralReparseVerified: true, semanticReparseVerified: true,
  temporaryCopyReopenVerified: true, sourceUnchanged: true, writesUserFile: false,
}
let internals
Object.defineProperty(window, '__TAURI_INTERNALS__', {
  configurable: true, get: () => internals,
  set(value) {
    const original = value.invoke
    value.invoke = async (command, args) => {
      if (command.startsWith('save_docx') || command.startsWith('save_pptx') || command === 'write_workbook_draft') {
        audit.requests.push({ command, args: clone(args), blocked: audit.blocked })
        if (audit.blocked) throw '文档正在保存或整理，请保留修改并稍后重试'
        if (surface !== 'workbook') {
          const operation = args.operation || args.operations[0]
          audit.savedText = operation.replacementText
          return {
            status: surface === 'docx' ? 'source_saved_verified' : 'transaction_source_saved_verified',
            rollbackProtected: true, unchangedPartsVerified: true,
            structuralReopenVerified: true, semanticReopenVerified: true,
            producerEvidence: [{}, {}, {}],
          }
        }
      }
      if (command === 'preview_docx_text_patch_isolated_copy') return { ...proof, status: 'isolated_verified', changedParts: ['word/document.xml'] }
      if (command === 'preview_pptx_text_patch_isolated_copy') return { ...proof, targetPart: 'ppt/slides/slide1.xml' }
      if (command === 'preview_pptx_patch_transaction') return {
        ...proof, status: 'transaction_verified', operationCount: args.operations.length,
        deterministicReplayVerified: true, structuralReopenVerified: true, semanticReopenVerified: true,
      }
      const result = await original(command, args)
      if (command === 'audit_pptx_edit_baseline') {
        for (const target of result.editableTextTargets) {
          target.expectedTextDigest = 'fixture-text'; target.expectedPartDigest = 'fixture-part'
        }
      }
      if (command === 'read_docx_document' || command === 'read_pptx_presentation') {
        if (audit.savedText) {
          result.signature = 'saved-fixture'
          if (surface === 'docx') {
            result.model.blocks[0].text = audit.savedText
            result.editableTextTargets[0].text = audit.savedText
          } else {
            result.model.slides[0].text = audit.savedText
            result.model.slides[0].objects[0].text = audit.savedText
          }
        }
        audit.disk = clone(result)
      }
      return result
    }
    internals = value
  },
})
if (surface === 'docx') await import('./docx-redesign-browser.mjs')
if (surface === 'pptx') await import('./pptx-redesign-browser.mjs')
if (surface === 'workbook') await import('./workbook-save-browser.mjs')
const { useAppStore } = await import('/src/store/app.ts')
const { windowDraftCount } = await import('/src/services/windowDrafts.ts')
audit.store = useAppStore(); audit.store.motionSpeed = 'calm'
document.body.dataset.theme = 'white'; document.documentElement.dataset.theme = 'white'
document.body.dataset.motion = 'calm'
document.body.style.margin = '0'; document.querySelector('#app').style.height = '100vh'
Object.defineProperty(audit, 'draftCount', { get: () => windowDraftCount.value })
window.officeMoveAudit = audit
