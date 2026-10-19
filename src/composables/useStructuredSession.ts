import { onBeforeUnmount, onMounted, shallowRef, type Ref } from 'vue'
import type { EditorView } from '@codemirror/view'
import type { DialogApi, MessageApi } from 'naive-ui'
import { invoke } from '../services/tauriRuntime'
import { listen } from '../services/tauriRuntime'
import { confirmAppAction } from '../services/appDialog'
import { beginWindowSave, recordWindowDraftActivity, useWindowDraft, useWindowDraftSnapshot } from '../services/windowDrafts'
import type { TabInfo, useAppStore } from '../store/app'
import type { ConflictSnapshot } from '../components/TextConflictDialog.vue'
import { fileStylePathKey } from '../utils/fileDisplayStyles'

interface Snapshot {
  content: string; signature: string; encoding: string; size: number; modified: number
  path: string; readOnlyReason?: string
}
interface Owner {
  root: string; path: string; external: boolean; format: string; generation: number
  editor: EditorView; source: string; signature: string; tab?: TabInfo
}
interface Options {
  path: () => string; external: () => boolean; format: () => string; generation: () => number
  editor: () => EditorView | null; store: ReturnType<typeof useAppStore>
  dialog: DialogApi; message: MessageApi
  loading: Ref<boolean>; saving: Ref<boolean>; dirty: Ref<boolean>; signature: Ref<string>
  encoding: Ref<string>; fileSize: Ref<number>; modified: Ref<number>; readOnlyReason: Ref<string>
  analyze: (source: string) => Promise<{ valid: boolean }>
  clearAnalysis: () => void; scheduleAnalysis: () => void
  applySnapshot: (snapshot: Snapshot) => Promise<void>
  load: (discard: boolean) => Promise<void>
}
// A write may outlive its component. A newly mounted editor must wait for it
// before reading the same file; the owner is released only on a settled IPC.
const writes = new Map<string, Promise<void>>()
const key = (owner: Pick<Owner, 'path'>) => fileStylePathKey(owner.path)
const editorText = (source: string) => source.replace(/\r\n?/g, '\n')

export function useStructuredSession(options: Options) {
  let disposed = false, bound: Owner | undefined
  const conflict = shallowRef<Owner>()
  const preview = shallowRef<{ owner: Owner; title: string; target: string; anchor: number }>()
  const previewError = shallowRef('')
  const capture = (): Owner | undefined => {
    const editor = options.editor()
    if (!editor) return
    return {
      root: options.store.libraryPath, path: options.path(), external: options.external(), format: options.format(),
      generation: options.generation(), editor, source: editor.state.doc.toString(), signature: options.signature.value,
      tab: options.store.tabs.find(tab => tab.path === options.path()),
    }
  }
  const owns = (owner?: Owner): boolean => Boolean(owner && !disposed
    && owner.editor === options.editor() && owner.generation === options.generation()
    && owner.path === options.path() && owner.root === options.store.libraryPath
    && owner.external === options.external() && owner.format === options.format())
  const unchanged = (owner?: Owner): owner is Owner => Boolean(owner && owns(owner) && owner.editor.state.doc.toString() === owner.source)
  const sync = (isDirty = options.dirty.value) => {
    if (!bound || options.editor() !== bound.editor || !bound.tab || !options.store.tabs.includes(bound.tab)) return
    const content = bound.editor.state.doc.toString(), changed = bound.tab.content !== content
    Object.assign(bound.tab, {
      content, isDirty, textSignature: options.signature.value,
      textEncoding: options.encoding.value, textSize: options.fileSize.value,
      textModified: options.modified.value, textReadOnlyReason: options.readOnlyReason.value,
    })
    if (changed) recordWindowDraftActivity()
  }
  const bind = () => {
    const owner = capture()
    if (!owner) return
    options.store.addTab({ id: owner.path, title: owner.path.split(/[\\/]/).pop() || owner.format,
      path: owner.path, external: owner.external, isDirty: options.dirty.value })
    owner.tab = options.store.tabs.find(tab => tab.path === owner.path)
    bound = owner
    sync()
  }
  const waitForWrite = async (owner: Owner) => { await writes.get(key(owner)) }
  const hasDocument = () => Boolean(bound && bound.editor === options.editor() && bound.path === options.path()
    && bound.root === options.store.libraryPath && bound.external === options.external() && bound.format === options.format())
  const metadata = (snapshot: Snapshot) => {
    options.signature.value = snapshot.signature; options.encoding.value = snapshot.encoding
    options.fileSize.value = snapshot.size; options.modified.value = snapshot.modified
  }
  const save = async () => {
    if (disposed || options.loading.value || options.saving.value || options.readOnlyReason.value || !options.dirty.value) return
    if (!hasDocument()) { options.message.info('当前文件尚未载入，原文件的未保存内容仍保留'); return }
    const owner = capture()
    if (!owner || !owner.signature || !owner.format) return
    if (writes.has(key(owner))) { options.message.info('这份文件正在保存，请稍候'); return }
    options.clearAnalysis()
    options.saving.value = true
    const finish = beginWindowSave()
    let release!: () => void
    writes.set(key(owner), new Promise<void>(resolve => { release = resolve }))
    try {
      const analysis = await options.analyze(owner.source)
      if (!owns(owner)) return
      let allowInvalid = false
      if (!analysis.valid) {
        if (owner.format === 'svg') { options.message.warning('SVG 尚有阻断项，请根据诊断修复；当前修改仍保留'); return }
        allowInvalid = await confirmAppAction(options.dialog, {
          title: '源码存在错误，仍要保存？', content: '可以继续编辑修复；按源码保存会保留当前语法错误。',
          positiveText: '按源码保存', negativeText: '继续编辑', danger: true,
        })
        if (!allowInvalid) return
        if (!unchanged(owner)) { options.message.info('文件或内容已变化，未执行旧确认；当前修改仍保留'); return }
      }
      if (!owns(owner)) return
      const kind = owner.format === 'jsonc' ? 'json' : owner.format
      const snapshot = await invoke<Snapshot>(`write_${owner.external ? 'external_' : ''}${kind}_source_document`, {
        ...(owner.external ? {} : { libraryRoot: owner.root }), path: owner.path, content: owner.source,
        expectedSignature: owner.signature, ...(kind === 'json' ? { formatId: owner.format } : {}),
        ...(kind === 'svg' ? {} : { allowInvalid }),
      })
      if (!owns(owner)) {
        // Do not update the replacement editor. Its pending read waits for this
        // receipt; the old cached draft keeps any input made after submission.
        if (owner.tab && options.store.tabs.includes(owner.tab)) {
          Object.assign(owner.tab, { textSignature: snapshot.signature, textEncoding: snapshot.encoding,
            textSize: snapshot.size, textModified: snapshot.modified })
          owner.tab.isDirty = owner.tab.content !== editorText(snapshot.content)
        }
        return
      }
      metadata(snapshot)
      options.dirty.value = owner.editor.state.doc.toString() !== editorText(snapshot.content)
      sync()
      options.message.success(options.dirty.value ? '已保存本次内容，后续输入仍未保存' : '已保存')
    } catch (error) {
      if (owns(owner)) {
        if ((error as { code?: string })?.code === 'external-modified') conflict.value = capture()
        else options.message.error(`保存失败，当前修改仍保留：${errorText(error)}`)
      }
    } finally {
      release(); writes.delete(key(owner)); finish()
      if (owns(owner)) options.saving.value = false
    }
  }
  const reload = async () => {
    if (disposed || options.saving.value || options.loading.value) return
    if (!hasDocument()) { await options.load(false); return }
    const owner = capture()
    if (!owner) return
    if (options.dirty.value && !await confirmAppAction(options.dialog, {
      title: '重新读取文件？', content: '会放弃当前未保存修改，使用磁盘内容。取消或读取失败会保留草稿。',
      positiveText: '放弃修改并重新读取', negativeText: '继续编辑', danger: true,
    })) return
    if (!unchanged(owner)) { options.message.info('文件或内容已变化，请重新发起读取；当前修改仍保留'); return }
    await options.load(true)
  }
  const applyConflict = async (snapshot: ConflictSnapshot, protectedCopy?: string) => {
    if (!unchanged(conflict.value)) return
    await options.applySnapshot({ ...snapshot, readOnlyReason: snapshot.readOnlyReason || undefined })
    conflict.value = undefined
    if (protectedCopy) options.message.success(`草稿已保留为同目录副本：${protectedCopy.split(/[\\/]/).pop()}`)
  }
  const closeConflict = () => { conflict.value = undefined }
  const finishCopy = (path: string) => { closeConflict(); options.message.success(`副本已保存：${path.split(/[\\/]/).pop()}；原件与当前草稿未变`) }
  const offerChange = (owner: Owner, title: string, target: string, anchor = 0) => {
    if (!hasDocument() || !unchanged(owner)) { options.message.info('文件或内容已变化，未应用旧结果；当前修改仍保留'); return }
    if (target === owner.source) { options.message.info('内容无需修改'); return }
    previewError.value = ''; preview.value = { owner, title, target, anchor }
  }
  const applyChange = () => {
    const change = preview.value
    if (!change) return
    if (!hasDocument() || !unchanged(change.owner)) { previewError.value = '已继续编辑或切换文件，未应用旧修改。请关闭后重新操作。'; return }
    change.owner.editor.dispatch({ changes: { from: 0, to: change.owner.source.length, insert: change.target },
      selection: { anchor: Math.min(change.anchor, change.target.length) } })
    preview.value = undefined
    options.message.success('已应用到草稿，可撤销；保存后才写入文件')
  }
  const cancelChange = () => { preview.value = undefined; previewError.value = '' }
  const keydown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's' || document.body.inert) return
    event.preventDefault(); event.stopImmediatePropagation()
    const target = event.target instanceof Element ? event.target : null
    if (!target?.closest('.n-dialog,.structured-change-dialog,.text-conflict-dialog')) void save()
  }
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!options.dirty.value && !options.saving.value) return
    event.preventDefault(); event.returnValue = ''
  }
  useWindowDraft(() => options.dirty.value || options.saving.value, () => bound?.path || options.path())
  useWindowDraftSnapshot(() => sync())
  const subscriptions: (() => void)[] = []
  onMounted(() => {
    window.addEventListener('keydown', keydown, true); window.addEventListener('beforeunload', beforeUnload)
    for (const [command, action] of [['command-save', save], ['command-refresh', reload]] as const) {
      void listen(command, () => { void action() }).then(stop => { if (disposed) stop(); else subscriptions.push(stop) })
    }
  })
  onBeforeUnmount(() => { sync(); disposed = true; cancelChange(); closeConflict(); subscriptions.forEach(stop => stop()); window.removeEventListener('keydown', keydown, true); window.removeEventListener('beforeunload', beforeUnload) })
  return { capture, owns, unchanged, bind, sync, hasDocument, waitForWrite, save, reload, conflict, applyConflict, closeConflict, finishCopy,
    preview, previewError, offerChange, applyChange, cancelChange }
}
const errorText = (error: unknown) => (error as { message?: string })?.message || String(error)
