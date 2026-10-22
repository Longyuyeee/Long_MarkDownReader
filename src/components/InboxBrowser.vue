<template>
  <section class="inbox-browser" :class="{ standalone }" aria-label="收集箱文件" :aria-busy="loading">
    <div class="actions">
      <button v-if="!standalone" class="icon-button back-button" aria-label="返回全部文件" @click="$emit('close')"><ArrowLeft /></button>
      <button class="primary-button" :disabled="loading || creating || choosing" @click="newNote"><SquarePen /><span>{{ creating ? '正在新建…' : '新建笔记' }}</span></button>
      <button class="icon-button" aria-label="刷新" :disabled="loading || creating" @click="reload"><RefreshCw :class="{ spinning: loading }" /></button>
      <button class="icon-button" aria-label="收集箱设置" :aria-expanded="menu" :disabled="choosing || creating" @click="menu = !menu"><Settings2 /></button>
    </div>
    <section v-if="menu" class="inbox-settings" aria-label="收集箱设置选项">
      <strong>保存位置<WorkspaceHelp label="说明：更换位置后，原有资料仍留在原文件夹。" text="更换位置后，原有资料仍留在原文件夹。" /></strong><span class="saved-location">{{ inbox }}</span>
      <button :disabled="choosing || creating" @click="chooseDirectory"><FolderOpen /><span>更换文件夹…</span></button>

    </section>
    <p v-if="settingStatus" class="setting-status" role="status">{{ settingStatus }}</p>
    <div v-if="actionError" class="action-error" role="alert"><span>这次操作没有完成，请重试或更换保存位置。</span><details><summary>错误详情</summary><pre>{{ actionError }}</pre></details></div>
    <div v-if="parents.length" class="location"><Folder /><span>{{ breadcrumb }}</span><button :disabled="creating || loading" @click="up"><ArrowUp /><span>上一级</span></button></div>
    <div v-if="loading" class="inbox-state" role="status"><p>正在读取文件…</p></div>
    <div v-else-if="error || (directoryMissing && (!defaultInbox || knownInbox))" class="inbox-state error-state" role="alert">
      <h3>这个文件夹暂时打不开</h3>
      <p>{{ directoryMissing ? '保存位置已找不到。请连接磁盘或更换文件夹。' : '请检查磁盘连接和文件夹访问权限，再试一次。' }}</p>
      <div class="state-actions"><button class="primary-button" @click="reload"><RefreshCw />重试读取</button><button :disabled="choosing" @click="chooseDirectory"><FolderOpen />更换文件夹</button></div>
      <button v-if="/知识库根|根路径/.test(error)" @click="$emit('manage')">资料库设置</button>
      <template v-if="directoryMissing"><p class="creation-hint">如果这是一个新位置，可以创建空文件夹。</p><button :disabled="creating" @click="createFolder">创建文件夹</button></template>
      <details v-if="error"><summary>错误详情</summary><pre>{{ error }}</pre></details>
    </div>
    <div v-else-if="!entries.length" class="inbox-state empty-state" role="status">
      <p>暂无文件，点击“新建笔记”开始记录。</p>
    </div>
    <template v-else>
      <label class="inbox-filter"><Search /><input v-model="filter" aria-label="筛选收集箱文件" placeholder="查找当前文件夹" /><button v-if="filter" aria-label="清除筛选" @click="filter = ''"><X /></button></label>
      <ul v-if="visibleEntries.length"><li v-for="item in visibleEntries" :key="item.path"><button :disabled="creating" @click="activate(item)"><span class="entry-symbol"><component :is="entryVisual(item).icon" :style="{ color: entryVisual(item).color }" aria-hidden="true" /></span><span class="entry-name">{{ item.name }}</span><ChevronRight v-if="item.is_dir" class="entry-arrow" /></button></li></ul>
      <p v-else class="filter-empty" role="status">没有找到相关文件<button @click="filter = ''">清除筛选</button></p>
    </template>
  </section>
</template>

<script setup lang="ts">
import WorkspaceHelp from './workspace/WorkspaceHelp.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { invoke, listen } from '../services/tauriRuntime'
import { emit as broadcast } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { useAppStore } from '../store/app'
import { inboxDirectory, inboxRelativeDirectory } from '../utils/inboxDirectory'
import { fileStylePathKey } from '../utils/fileDisplayStyles'
import { ArrowLeft, ArrowUp, ChevronRight, Folder, FolderOpen, RefreshCw, Search, Settings2, SquarePen, X } from 'lucide-vue-next'
import { findFileFormat } from '../config/fileFormats'
import { resolveFileTreeVisual } from '../config/fileTreeAppearance'
interface Entry { name: string; path: string; is_dir: boolean }
interface Listing { entries: Entry[]; directoryMissing: boolean }
const props = withDefaults(defineProps<{ libraryRoot: string; standalone?: boolean }>(), { standalone: false })
const emit = defineEmits<{ close: []; open: [path: string]; changed: []; manage: [] }>()
const store = useAppStore()
const entryVisual = (item: Entry) => item.is_dir ? { icon: Folder, color: 'var(--theme-text-secondary)' } : resolveFileTreeVisual(findFileFormat(item.path)?.id)
const menu = ref(false), choosing = ref(false), creating = ref(false), settingStatus = ref(''), actionError = ref(''), filter = ref('')
const inbox = computed(() => inboxDirectory(props.libraryRoot, store.libraries))
const relative = computed(() => inboxRelativeDirectory(props.libraryRoot, store.libraries))
const defaultInbox = computed(() => relative.value === 'Inbox')
const knownInbox = ref(false)
const seenKey = () => 'longedit.inbox.seen:' + fileStylePathKey(inbox.value)
const directory = ref(''), entries = ref<Entry[]>([]), parents = ref<string[]>([])
const error = ref(''), loading = ref(false), directoryMissing = ref(false)
const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || ''
const breadcrumb = computed(() => ['收集箱', ...parents.value.slice(1).map(basename), ...(parents.value.length ? [basename(directory.value)] : [])].join(' / '))
const visibleEntries = computed(() => entries.value.filter(item => item.name.toLocaleLowerCase().includes(filter.value.trim().toLocaleLowerCase())))
let generation = 0, disposed = false
let unlisten: (() => void) | undefined
const reload = async () => {
  const request = ++generation, root = props.libraryRoot, path = directory.value, inboxRelative = relative.value
  loading.value = true; error.value = ''; actionError.value = ''; directoryMissing.value = false
  try {
    if (!root) throw new Error('请先选择资料库')
    const result = await invoke<Listing>('read_inbox_directory', { libraryRoot: root, inboxDirectory: inboxRelative, path })
    if (!disposed && request === generation) {
      entries.value = result.entries; directoryMissing.value = result.directoryMissing
      if (!result.directoryMissing) { knownInbox.value = true; try { localStorage.setItem(seenKey(), '1') } catch { /* Availability must not depend on preferences. */ } }
    }
  } catch (cause) { if (!disposed && request === generation) error.value = String(cause) }
  finally { if (!disposed && request === generation) loading.value = false }
}
const activate = (item: Entry) => {
  if (item.is_dir) { parents.value.push(directory.value); directory.value = item.path; entries.value = []; filter.value = ''; void reload() }
  else emit('open', item.path)
}
const up = () => { const parent = parents.value.pop(); if (parent) { directory.value = parent; entries.value = []; filter.value = ''; void reload() } }
const createFolder = async () => {
  if (creating.value || loading.value || choosing.value) return
  const root = props.libraryRoot, inboxRelative = relative.value
  creating.value = true; actionError.value = ''
  try {
    await invoke('create_inbox_directory', { libraryRoot: root, inboxDirectory: inboxRelative })
    if (!disposed && root === props.libraryRoot && inboxRelative === relative.value) { await reload(); emit('changed') }
  } catch (cause) { if (!disposed && root === props.libraryRoot) actionError.value = String(cause) }
  finally { creating.value = false }
}
const newNote = async () => {
  if (creating.value || loading.value || choosing.value) return
  const root = props.libraryRoot, inboxRelative = relative.value, path = directory.value, atRoot = !parents.value.length
  const current = () => !disposed && root === props.libraryRoot && inboxRelative === relative.value && path === directory.value
  creating.value = true; actionError.value = ''
  try {
    const prepared = await invoke<string>('create_inbox_directory', { libraryRoot: root, inboxDirectory: inboxRelative })
    if (!current()) return
    const note = await invoke<string>('create_new_file', { libraryRoot: root, targetDir: atRoot ? prepared : path })
    if (!current()) return
    await reload()
    if (!current()) return
    emit('changed'); emit('open', note)
  } catch (cause) { if (current()) actionError.value = String(cause) }
  finally { creating.value = false }
}
const chooseDirectory = async () => {
  if (choosing.value || creating.value) return
  const root = props.libraryRoot
  choosing.value = true; settingStatus.value = ''; actionError.value = ''
  try {
    const path = await open({ directory: true, multiple: false, defaultPath: root, title: '选择收集箱文件夹（当前资料库内）' })
    if (typeof path !== 'string' || disposed || root !== props.libraryRoot) return
    const inboxRelative = await store.setInboxDirectory(root, path)
    if (disposed || root !== props.libraryRoot) return
    menu.value = false; settingStatus.value = '已更换保存位置，原有资料留在原文件夹。'
    try { await broadcast('inbox-directory-changed', { root, relative: inboxRelative }) }
    catch { if (!disposed) settingStatus.value = '位置已保存，重新打开快速笔记可同步。' }
  } catch (cause) { if (!disposed && root === props.libraryRoot) actionError.value = String(cause) }
  finally { choosing.value = false }
}
watch([() => props.libraryRoot, inbox], () => {
  parents.value = []; directory.value = inbox.value; entries.value = []; filter.value = ''; settingStatus.value = ''; actionError.value = ''; menu.value = false
  try { knownInbox.value = localStorage.getItem(seenKey()) === '1' } catch { knownInbox.value = false }
  void reload()
}, { immediate: true })
onMounted(async () => {
  try { const stop = await listen('refresh-library', () => { if (!creating.value) void reload() }); if (disposed) stop(); else unlisten = stop }
  catch (cause) { console.warn('收集箱自动刷新订阅失败，可手动刷新', cause) }
})
onUnmounted(() => { disposed = true; ++generation; unlisten?.() })
</script>

<style scoped>
.inbox-browser { flex: 1; padding: 14px 12px; min-height: 0; min-width: 0; overflow: auto; color: var(--theme-text); font-size: var(--text-sm); }
.inbox-browser.standalone { padding: var(--workflow-panel-padding); border: var(--theme-border); border-radius: var(--theme-radius); background: var(--theme-surface); box-shadow: var(--workflow-panel-shadow); }
.actions { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.actions .primary-button { margin-right: auto; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: inherit; background: var(--chrome-control, transparent); border: 1px solid var(--workspace-border-color, #8885); border-radius: var(--theme-radius-sm); min-height: 32px; padding: 5px 9px; cursor: pointer; font: inherit; text-align: left; transition: background var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard); }
button:hover { background: rgba(var(--theme-primary-rgb), .1); border-color: rgba(var(--theme-primary-rgb), .4); }
button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }
button:disabled { opacity: .5; cursor: default; }
.primary-button { color: var(--theme-bg); background: var(--theme-primary); border-color: transparent; font-weight: 600; }
.primary-button:hover { background: color-mix(in srgb, var(--theme-primary) 88%, var(--theme-text)); }
.icon-button { width: 32px; padding: 0; flex-shrink: 0; }
.back-button { border: 0; background: transparent; color: var(--theme-text-secondary); }
.inbox-settings, .action-error { padding: 12px; margin-bottom: 12px; border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); }
.inbox-settings strong { font-size: var(--text-sm); }
.inbox-settings small, .saved-location { display: block; margin: 6px 0 10px; color: var(--theme-text-secondary); font-size: var(--text-compact); overflow-wrap: anywhere; }
.inbox-settings small { margin-bottom: 0; }
.setting-status { font-size: var(--text-compact); }
.location { display: flex; align-items: center; gap: 7px; padding-bottom: 8px; font-size: var(--text-compact); color: var(--theme-text-secondary); }
.location > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.location button { font-size: var(--text-compact); min-height: 28px; padding: 3px 6px; flex-shrink: 0; }
p, details { line-height: 1.6; color: var(--theme-text-secondary); overflow-wrap: anywhere; }
.inbox-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 8px; margin: 8px 0; text-align: center; }
.error-state { border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); }
h3 { font-size: 14px; font-weight: 600; margin: 0; }
.inbox-state p { margin: 0; font-size: var(--text-compact); max-width: 32em; }
.state-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.inbox-state .creation-hint { padding-top: 5px; }
details { text-align: left; font-size: var(--text-compact); max-width: 100%; }
summary { cursor: pointer; }
pre { font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 120px; overflow: auto; }
.inbox-filter { display: flex; align-items: center; gap: 7px; margin: 8px 0; padding: 3px 8px; border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); color: var(--theme-text-secondary); }
.inbox-filter input { min-width: 0; width: 100%; border: 0; color: var(--theme-text); background: transparent; font: inherit; font-size: var(--text-compact); line-height: 24px; }
.inbox-filter input::placeholder { color: var(--theme-text-secondary); }
.inbox-filter button { padding: 0; width: 24px; min-height: 24px; background: transparent; border: 0; }
ul { list-style: none; padding: 0; margin: 0; }
li button { justify-content: flex-start; width: 100%; min-width: 0; min-height: var(--file-row-height, 34px); border: var(--file-row-border, 1px solid transparent); padding: 5px 7px; margin-block: calc(var(--file-row-gap, 3px) / 2); background: var(--file-row-bg, transparent); box-shadow: var(--file-row-shadow, none); }
li button:hover { background: color-mix(in srgb, var(--theme-primary) 8%, var(--theme-surface)); }
.entry-symbol { flex-shrink: 0; display: grid; place-items: center; }
.entry-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry-arrow { color: var(--theme-text-secondary); }
.filter-empty { text-align: center; padding: 18px 0; font-size: var(--text-compact); }
.filter-empty button { display: flex; margin: 8px auto; }
svg { width: 16px; height: 16px; flex-shrink: 0; }
.spinning { animation: inbox-spin 1s linear infinite; }
@keyframes inbox-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinning { animation: none; } }
:global(body[data-motion="reduced"]) .spinning { animation: none; }
@media (max-width: 400px) { .inbox-browser { padding: 12px 10px; } .inbox-browser.standalone { padding: 16px 12px; } }
</style>
