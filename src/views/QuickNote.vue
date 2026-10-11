<template>
  <div class="quick-note-window">
    <header data-tauri-drag-region><strong>快速笔记</strong><span>{{ saving ? '正在保存…' : content ? '未保存' : '空白笔记' }}</span><button aria-label="关闭快速笔记" :disabled="busy" @click="close">×</button></header>
    <div class="capture-toolbar">
      <label :title="library">资料库<select v-model="library" :disabled="busy || !ready" aria-label="资料库"><option value="" disabled>请选择</option><option v-for="item in store.libraries" :key="item.path" :value="item.path">{{ item.name }}</option></select></label>
      <label :title="target">保存到<select :value="target" :disabled="busy || !library" aria-label="保存到" @change="selectTarget"><option :value="inbox">收集箱</option><option :value="library">根目录</option><option v-if="target && target !== inbox && target !== library" :value="target">{{ target }}</option><option value="__choose">选择目录…</option></select></label>
      <label>模板<select :value="template" :disabled="busy" aria-label="模板" @change="selectTemplate"><option v-for="name in Object.keys(NOTE_TEMPLATES)" :key="name">{{ name }}</option></select></label>
    </div>
    <main><textarea ref="editor" v-model="content" :disabled="busy" aria-label="笔记正文" placeholder="写下这一刻的灵感…" autofocus /></main>
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
import { NOTE_TEMPLATES } from '../config/noteTemplates'

const store = useAppStore(), message = useMessage()
const content = ref(''), library = ref(''), target = ref(''), template = ref('空白笔记')
const afterSave = ref('close'), status = ref('')
const saving = ref(false), choosing = ref(false), ready = ref(false)
const busy = computed(() => saving.value || choosing.value)
const editor = ref<HTMLTextAreaElement>()
// Retain identity across failed invocations; clear it only after an acknowledged save.
let operationId = crypto.randomUUID().replace(/-/g, '')
let operationTarget: { libraryRoot: string; targetDir: string } | null = null
const inbox = computed(() => library.value.replace(/[\\/]$/, '') + '/Inbox')
const preferenceKey = (root: string) => 'longedit.quick-note.target:' + root
watch(library, root => {
  try { target.value = localStorage.getItem(preferenceKey(root)) || inbox.value }
  catch { target.value = inbox.value }
})
watch([content, busy], ([value, active]) => {
  store.isTempDirty = value.length > 0 || active
  store.isCaptureBusy = active
}, { flush: 'sync' })
onUnmounted(() => { store.isTempDirty = false; store.isCaptureBusy = false })
onMounted(async () => {
  try { await store.loadConfig(); library.value = store.activeLibraryPath; ready.value = true; await nextTick(); editor.value?.focus() }
  catch (error) { status.value = '读取资料库失败：' + String(error) }
})
const close = async () => { if (!busy.value) await getCurrentWindow().close() }
const selectTarget = async (event: Event) => {
  const select = event.target as HTMLSelectElement, value = select.value
  select.value = target.value
  if (value !== '__choose') { target.value = value; return }
  choosing.value = true
  try {
    const result = await open({ directory: true, multiple: false, defaultPath: library.value, title: '选择当前资料库内的目录' })
    if (typeof result === 'string') {
      await invoke('scan_directory', { libraryRoot: library.value, path: result })
      target.value = result
    }
  } catch (error) { message.error('无法选择目录：' + String(error)) }
  finally { choosing.value = false }
}
const selectTemplate = async (event: Event) => {
  const select = event.target as HTMLSelectElement, name = select.value
  select.value = template.value
  choosing.value = true
  try {
    if (content.value && !await confirm('应用模板会替换当前未保存内容，是否继续？', { title: '替换笔记内容', kind: 'warning' })) return
    template.value = name; content.value = NOTE_TEMPLATES[name] || ''
  } catch (error) { message.error('应用模板失败：' + String(error)) }
  finally { choosing.value = false; await nextTick(); editor.value?.focus() }
}
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
    await emitTo('main', 'quick-note-open', { requestId, path, libraryRoot: root })
    const error = await response
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
  content.value = ''; template.value = '空白笔记'
  status.value = '已保存：' + savedPath
  try { localStorage.setItem(preferenceKey(library.value), target.value) } catch { /* Preferences cannot invalidate a saved file. */ }
  try {
    await emit('refresh-library')
    if (afterSave.value === 'open') await openInMain(savedPath, library.value)
    if (afterSave.value !== 'continue') { saving.value = false; await close() }
  } catch (error) { status.value = '文件已保存，无需重存。后续操作失败：' + String(error) + '。文件：' + savedPath }
  finally { saving.value = false; await nextTick(); editor.value?.focus() }
}
</script>

<style scoped>
.quick-note-window { height: 100vh; display: flex; flex-direction: column; overflow: hidden; color: var(--theme-text); background: var(--theme-bg); }
header { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 0 14px; background: var(--theme-card); cursor: move; flex-shrink: 0; }
header strong { font-size: 14px; } header span { margin-left: auto; color: var(--theme-text-secondary); font-size: 12px; }
header button { border: 0; background: transparent; color: inherit; font-size: 22px; width: 28px; height: 28px; cursor: pointer; }
.capture-toolbar { display: grid; grid-template-columns: 1.15fr 1fr 1fr; gap: 7px; padding: 7px 12px; flex-shrink: 0; }
label { display: flex; align-items: center; gap: 4px; min-width: 0; font-size: 12px; white-space: nowrap; }
select { min-width: 0; width: 100%; height: 30px; padding: 0 3px; border: 1px solid var(--workspace-border-color, #8885); border-radius: 4px; background: var(--theme-card); color: var(--theme-text); font: inherit; text-overflow: ellipsis; }
main { flex: 1; min-height: 0; display: flex; padding: 0 12px; }
textarea { width: 100%; min-height: 0; resize: none; box-sizing: border-box; padding: 12px; border: 1px solid var(--workspace-border-color, #8885); border-radius: 4px; background: var(--theme-bg); color: var(--theme-text); font: inherit; font-size: 14px; line-height: 1.65; }
p { flex-shrink: 0; font-size: 12px; color: var(--theme-text-secondary); margin: 5px 12px; max-height: 3.5em; overflow: auto; overflow-wrap: anywhere; }
footer { display: flex; align-items: center; gap: 8px; padding: 8px 12px; flex-shrink: 0; background: var(--theme-card); }
.after-save { margin-left: auto; } .after-save select { width: 116px; }
button:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 1px; }
@media (max-width: 450px) { .capture-toolbar { grid-template-columns: 1fr 1fr; } .capture-toolbar label:last-child { grid-column: 1 / -1; } }
</style>
