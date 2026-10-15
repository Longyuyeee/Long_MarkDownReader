<template>
  <div class="quick-note-window">
    <header data-tauri-drag-region><strong>快速笔记</strong><span>{{ saving ? '正在保存…' : content ? '未保存' : '空白笔记' }}</span><button aria-label="关闭快速笔记" :disabled="busy" @click="close">×</button></header>
    <div class="capture-toolbar">
      <label :title="library">资料库<select v-model="library" :disabled="busy || !ready" aria-label="资料库"><option value="" disabled>请选择</option><option v-for="item in store.libraries" :key="item.path" :value="item.path">{{ item.name }}</option></select></label>
      <label :title="target">保存到<select :value="target" :disabled="busy || !library" aria-label="保存到" @change="selectTarget"><option :value="inbox">收集箱</option><option :value="library">根目录</option><option v-if="target && target !== inbox && target !== library" :value="target">{{ target }}</option><option value="__choose">选择目录…</option></select></label>
    </div>
    <div class="capture-destination" :title="target">{{ target ? `当前保存位置：${target}` : '先选择资料库和保存位置' }}</div>
    <main><div class="capture-composer"><div class="capture-composer-heading"><span>写下想法</span><label>模板<select :value="template" :disabled="busy" aria-label="模板" @change="selectTemplate"><option v-if="!store.allNoteTemplates.some(item => item.id === template)" :value="template">当前内容（模板已移除）</option><option v-for="item in store.allNoteTemplates" :key="item.id" :value="item.id">{{ item.name }}</option></select></label></div><textarea ref="editor" v-model="content" :disabled="busy" aria-label="笔记正文" placeholder="写下这一刻的灵感…" autofocus /></div></main>
    <p role="status">{{ status || '仅点击保存时写入本地文件' }}</p>
    <footer><n-button size="small" quaternary :disabled="busy" @click="close">丢弃</n-button><label class="after-save">保存后<select v-model="afterSave" :disabled="busy" aria-label="保存后操作"><option value="close">关闭窗口</option><option value="continue">继续记录</option><option value="open">主编辑区打开</option></select></label><n-button size="small" type="primary" :loading="saving" :disabled="(busy && !saving) || !ready" @click="save">保存笔记</n-button></footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { emit, emitTo, listen } from '@tauri-apps/api/event'
import { confirm, open } from '@tauri-apps/plugin-dialog'
import { useMessage } from 'naive-ui'
import { useAppStore } from '../store/app'
import { BLANK_NOTE_TEMPLATE, renderNoteTemplate, type NoteTemplate } from '../config/noteTemplates'
import { inboxDirectory, rememberedCaptureTarget } from '../utils/inboxDirectory'
import { recordWindowDraftActivity } from '../services/windowDrafts'

const store = useAppStore(), message = useMessage()
const content = ref(''), library = ref(''), target = ref(''), template = ref(BLANK_NOTE_TEMPLATE)
const afterSave = ref('close'), status = ref('')
const saving = ref(false), choosing = ref(false), ready = ref(false)
const busy = computed(() => saving.value || choosing.value)
const editor = ref<HTMLTextAreaElement>()
// Retain identity across failed invocations; clear it only after an acknowledged save.
let operationId = crypto.randomUUID().replace(/-/g, '')
let operationTarget: { libraryRoot: string; targetDir: string } | null = null
const inbox = computed(() => inboxDirectory(library.value, store.libraries))
const pendingInbox = ref<string | null>(null)
let stopInboxUpdates: (() => void) | undefined
let stopTemplateUpdates: (() => void) | undefined
let disposed = false
const preferenceKey = (root: string) => 'longedit.quick-note.target:' + root
watch(library, root => {
  pendingInbox.value = null
  try { target.value = rememberedCaptureTarget(root, inbox.value, localStorage.getItem(preferenceKey(root))) }
  catch { target.value = root }
  if (!content.value) applyDefaultTemplate()
})
watch([content, busy], ([value, active]) => {
  store.isTempDirty = value.length > 0 || active
  store.isCaptureBusy = active
  recordWindowDraftActivity()
}, { flush: 'sync' })
onUnmounted(() => { disposed = true; store.isTempDirty = false; store.isCaptureBusy = false; stopInboxUpdates?.(); stopTemplateUpdates?.() })
const applyPendingInbox = () => {
  if (pendingInbox.value !== null && !busy.value && !operationTarget) {
    target.value = pendingInbox.value; pendingInbox.value = null
  }
}
watch(inbox, (next, previous) => {
  if (target.value === previous || pendingInbox.value !== null) {
    pendingInbox.value = next
    applyPendingInbox()
  }
})
watch(busy, applyPendingInbox)
onMounted(async () => {
  try {
    stopInboxUpdates = await listen<{ root: string; relative: string }>('inbox-directory-changed', event => {
      store.libraries = store.libraries.map(item => item.path === event.payload.root ? { ...item, inboxDirectory: event.payload.relative } : item)
    })
    if (disposed) { stopInboxUpdates(); return }
    stopTemplateUpdates = await listen<{ noteTemplates: NoteTemplate[]; defaultNoteTemplates: Record<string, string> }>('note-templates-changed', event => {
      store.noteTemplates = event.payload.noteTemplates
      store.defaultNoteTemplates = event.payload.defaultNoteTemplates
    })
    if (disposed) { stopInboxUpdates(); stopTemplateUpdates(); return }
    await store.loadConfig(); library.value = store.activeLibraryPath; ready.value = true; await nextTick(); editor.value?.focus()
  }
  catch (error) { status.value = '读取资料库失败：' + String(error) }
})
const close = async () => { if (!busy.value) await getCurrentWindow().close() }
const selectTarget = async (event: Event) => {
  const select = event.target as HTMLSelectElement, value = select.value
  select.value = target.value
  if (value !== '__choose') { pendingInbox.value = null; target.value = value; return }
  choosing.value = true
  try {
    const result = await open({ directory: true, multiple: false, defaultPath: library.value, title: '选择当前资料库内的目录' })
    if (typeof result === 'string') {
      await invoke('scan_directory', { libraryRoot: library.value, path: result })
      pendingInbox.value = null
      target.value = result
    }
  } catch (error) { message.error('无法选择目录：' + String(error)) }
  finally { choosing.value = false }
}
const selectTemplate = async (event: Event) => {
  const select = event.target as HTMLSelectElement, id = select.value
  select.value = template.value
  choosing.value = true
  try {
    if (content.value && !await confirm('应用模板会替换当前未保存内容，是否继续？', { title: '替换笔记内容', kind: 'warning' })) return
    const item = store.allNoteTemplates.find(item => item.id === id)
    if (!item) throw new Error('模板已不存在，请重新选择')
    applyTemplate(item)
  } catch (error) { message.error('应用模板失败：' + String(error)) }
  finally { choosing.value = false; await nextTick(); editor.value?.focus() }
}
const applyTemplate = (item: NoteTemplate) => {
  template.value = item.id
  content.value = renderNoteTemplate(item.content, item.name === '空白笔记' ? '快速笔记' : item.name)
}
const applyDefaultTemplate = () => applyTemplate(store.allNoteTemplates.find(item => item.id === store.defaultNoteTemplates[library.value]) || store.allNoteTemplates[0])
const openInMain = async (path: string, root: string) => {
  const requestId = crypto.randomUUID()
  let timer: ReturnType<typeof setTimeout> | undefined
  let resolve!: (error?: string) => void
  const response = new Promise<string | undefined>(r => { resolve = r })
  const unlisten = await listen<{ requestId: string; error?: string }>('quick-note-open-result', event => {
    if (event.payload.requestId === requestId) resolve(event.payload.error)
  })
  try {
    timer = setTimeout(() => resolve('主窗口未响应，请在资料库中打开已保存文件'), 5000)
    const error = await Promise.race([
      emitTo('main', 'quick-note-open', { requestId, path, libraryRoot: root, expiresAt: Date.now() + 5000 }).then(() => response),
      response,
    ])
    if (error) throw new Error(error)
  } finally { clearTimeout(timer); unlisten() }
}
const save = async () => {
  if (busy.value) return
  if (!content.value.trim()) { message.warning('请输入内容'); return }
  if (!library.value || !store.libraries.some(item => item.path === library.value)) { message.error('请选择有效资料库'); return }
  saving.value = true
  let savedPath = ''
  try {
    if (operationTarget && (operationTarget.libraryRoot !== library.value || operationTarget.targetDir !== target.value)) {
      throw new Error('上次保存结果尚未确认，请回到原目录重试，避免重复记录：' + operationTarget.targetDir)
    }
    operationTarget = { libraryRoot: library.value, targetDir: target.value }
    savedPath = await invoke<string>('save_quick_note', {
      ...operationTarget, operationId,
      content: content.value,
    })
  } catch (error) { status.value = '保存失败，输入已保留：' + String(error); saving.value = false; return }
  operationId = crypto.randomUUID().replace(/-/g, '')
  operationTarget = null
  content.value = ''; template.value = BLANK_NOTE_TEMPLATE
  status.value = '已保存：' + savedPath
  try { localStorage.setItem(preferenceKey(library.value), target.value === inbox.value || pendingInbox.value !== null ? '__inbox' : target.value) } catch { /* Preferences cannot invalidate a saved file. */ }
  try {
    await emit('refresh-library')
    if (afterSave.value === 'open') await openInMain(savedPath, library.value)
    if (afterSave.value !== 'continue') { saving.value = false; await close() }
  } catch (error) { status.value = '文件已保存，无需重存。后续操作失败：' + String(error) + '。文件：' + savedPath }
  finally { saving.value = false; if (afterSave.value === 'continue') applyDefaultTemplate(); await nextTick(); editor.value?.focus() }
}
</script>

<style scoped>
.quick-note-window { height: 100vh; display: flex; flex-direction: column; overflow: hidden; color: var(--theme-text); background: var(--theme-bg); }
header { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 16px; background: var(--style-card-gradient, var(--theme-surface)); border-bottom: var(--theme-border); cursor: move; flex-shrink: 0; }
header strong { font-size: var(--text-md); } header span { margin-left: auto; color: var(--theme-text-secondary); font-size: var(--text-sm); }
header button { border: 0; background: transparent; color: inherit; font-size: 22px; width: 28px; height: 28px; cursor: pointer; }
.capture-toolbar { display: grid; grid-template-columns: 1fr 1.3fr; gap: 12px; padding: 12px 16px 6px; flex-shrink: 0; }
label { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: var(--text-sm); white-space: nowrap; }
.capture-toolbar label { display: grid; gap: 5px; }
select { min-width: 0; width: 100%; height: 32px; padding: 0 6px; border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); color: var(--theme-text); font: inherit; text-overflow: ellipsis; }
.capture-destination { flex: none; padding: 0 16px 10px; color: var(--theme-text-secondary); font-size: var(--text-compact); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
main { flex: 1; min-height: 0; display: flex; padding: 0 16px; }
.capture-composer { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; overflow: hidden; border: var(--theme-border); border-radius: var(--theme-radius); background: var(--theme-surface); box-shadow: var(--workflow-panel-shadow, none); }
.capture-composer-heading { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; border-bottom: var(--theme-border); color: var(--theme-text-secondary); font-size: var(--text-sm); }
.capture-composer-heading select { max-width: 150px; }
textarea { flex: 1; width: 100%; min-height: 0; resize: none; box-sizing: border-box; padding: var(--workflow-panel-padding, 16px); border: 0; background: transparent; color: var(--theme-text); font-family: var(--document-font-family, var(--font-sans)); font-size: var(--document-font-size, 16px); line-height: var(--document-line-height, 1.75); }
p { flex-shrink: 0; font-size: var(--text-sm); color: var(--theme-text-secondary); margin: 8px 16px; max-height: 3.5em; overflow: auto; overflow-wrap: anywhere; }
footer { display: flex; align-items: center; gap: 8px; padding: 10px 16px; flex-shrink: 0; background: var(--style-card-gradient, var(--theme-surface)); border-top: var(--theme-border); }
.after-save { margin-left: auto; } .after-save select { width: 116px; }
button:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 1px; }
@media (max-width: 450px) { .capture-toolbar { gap: 8px; } footer { flex-wrap: wrap; } .after-save select { width: 105px; } .capture-composer-heading select { max-width: 125px; } }
</style>
