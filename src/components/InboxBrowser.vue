<template>
  <section class="inbox-browser" :class="{ standalone }" aria-label="收集箱文件" :aria-busy="loading">
    <div class="actions"><button v-if="!standalone" @click="$emit('close')">← 全部文件</button><strong v-else>收集目录</strong><button :disabled="loading" @click="reload">刷新</button><button aria-label="收集箱设置" :aria-expanded="menu" :disabled="choosing" @click="menu = !menu">收集目录</button></div>
    <div v-if="menu" class="inbox-settings"><button :disabled="choosing" @click="chooseDirectory">设置收集目录…</button><small>仅更改收集位置，不移动已有文件</small></div>
    <p v-if="settingStatus" role="status">{{ settingStatus }}</p>
    <div class="location" :title="directory"><Folder :size="15" aria-hidden="true" />{{ breadcrumb }}</div>
    <button v-if="parents.length" @click="up">↑ 上一级</button>
    <p v-if="loading" role="status">正在读取收集箱…</p>
    <div v-else-if="error" role="alert"><strong>收集箱暂时不可用</strong><p>目录尚未创建、已移动或不可读。可先通过快速笔记保存到收集箱；已有资料请检查目录后重试。</p><button @click="reload">重试读取</button><details><summary>错误详情</summary>{{ error }}</details></div>
    <p v-else-if="!entries.length" role="status">此目录暂无可浏览的资料文件</p>
    <template v-else><p>{{ entries.filter(item => !item.is_dir).length }} 个文件 · {{ entries.filter(item => item.is_dir).length }} 个文件夹</p><ul><li v-for="item in entries" :key="item.path"><button :title="item.path" @click="activate(item)"><component :is="entryVisual(item).icon" :style="{ color: entryVisual(item).color }" aria-hidden="true" /><span>{{ item.name }}</span><small>{{ item.is_dir ? '进入' : findFileFormat(item.path)?.label || '文件' }}</small></button></li></ul></template>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { invoke, listen } from '../services/tauriRuntime'
import { emit as broadcast } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { useAppStore } from '../store/app'
import { inboxDirectory } from '../utils/inboxDirectory'
import { Folder } from 'lucide-vue-next'
import { findFileFormat } from '../config/fileFormats'
import { resolveFileTreeVisual } from '../config/fileTreeAppearance'
interface Entry { name: string; path: string; is_dir: boolean }
const props = withDefaults(defineProps<{ libraryRoot: string; standalone?: boolean }>(), { standalone: false })
const emit = defineEmits<{ close: []; open: [path: string] }>()
const store = useAppStore()
const entryVisual = (item: Entry) => item.is_dir ? { icon: Folder, color: 'var(--theme-text-secondary)' } : resolveFileTreeVisual(findFileFormat(item.path)?.id)
const menu = ref(false), choosing = ref(false), settingStatus = ref('')
const inbox = computed(() => inboxDirectory(props.libraryRoot, store.libraries))
const directory = ref(''), entries = ref<Entry[]>([]), parents = ref<string[]>([])
const error = ref(''), loading = ref(false)
const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || ''
const breadcrumb = computed(() => [basename(inbox.value), ...parents.value.slice(1).map(basename), ...(parents.value.length ? [basename(directory.value)] : [])].join(' / '))
let generation = 0, disposed = false
let unlisten: (() => void) | undefined
const reload = async () => {
  const request = ++generation, root = props.libraryRoot, path = directory.value
  loading.value = true; error.value = ''; entries.value = []
  try {
    if (!root) throw new Error('请先选择资料库')
    const result = await invoke<Entry[]>('scan_directory', { libraryRoot: root, path })
    if (!disposed && request === generation) entries.value = result
  } catch (cause) { if (!disposed && request === generation) error.value = String(cause) }
  finally { if (!disposed && request === generation) loading.value = false }
}
const activate = (item: Entry) => {
  if (item.is_dir) { parents.value.push(directory.value); directory.value = item.path; void reload() }
  else emit('open', item.path)
}
const up = () => { const parent = parents.value.pop(); if (parent) { directory.value = parent; void reload() } }
const chooseDirectory = async () => {
  const root = props.libraryRoot
  choosing.value = true; settingStatus.value = ''
  try {
    const path = await open({ directory: true, multiple: false, defaultPath: root, title: '选择当前资料库内的收集目录' })
    if (typeof path !== 'string' || disposed || root !== props.libraryRoot) return
    const relative = await store.setInboxDirectory(root, path)
    if (!disposed && root === props.libraryRoot) { menu.value = false; settingStatus.value = '收集目录已保存；已有文件未移动' }
    try { await broadcast('inbox-directory-changed', { root, relative }) }
    catch { if (!disposed) settingStatus.value = '目录已保存；请重新打开快速笔记以同步设置' }
  } catch (cause) { if (!disposed) settingStatus.value = '设置失败，原目录保留：' + String(cause) }
  finally { choosing.value = false }
}
watch([() => props.libraryRoot, inbox], () => { parents.value = []; directory.value = inbox.value; void reload() }, { immediate: true })
onMounted(async () => {
  try { const stop = await listen('refresh-library', () => { void reload() }); if (disposed) stop(); else unlisten = stop }
  catch (cause) { console.warn('收集箱自动刷新订阅失败，可手动刷新', cause) }
})
onUnmounted(() => { disposed = true; ++generation; unlisten?.() })
</script>
<style scoped>
.inbox-browser { flex: 1; padding: 8px 10px; min-height: 0; overflow: auto; color: var(--theme-text); }
.inbox-browser.standalone { padding: var(--workflow-panel-padding); border: var(--theme-border); border-radius: var(--theme-radius); background: var(--theme-surface); box-shadow: var(--workflow-panel-shadow); }
.actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.actions > :first-child { margin-right: auto; }
.actions strong { font-size: var(--text-md); }
.inbox-settings { padding: 8px; border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); }
.inbox-settings small { display: block; padding: 4px; }
button { color: inherit; background: transparent; border: 0; border-radius: var(--theme-radius-sm); padding: 7px; cursor: pointer; font: inherit; text-align: left; }
button:hover { background: rgba(var(--theme-primary-rgb), .08); }
button:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: -2px; }
button:disabled { opacity: .5; cursor: default; }
.location { display: flex; align-items: center; gap: 7px; overflow-wrap: anywhere; padding: 8px 0; font-size: var(--text-sm); border-bottom: var(--theme-border); }
p, details { font-size: var(--text-sm); line-height: 1.65; color: var(--theme-text-secondary); overflow-wrap: anywhere; }
ul { list-style: none; padding: 0; margin: 0; }
li button { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; min-height: var(--file-row-height, 34px); border: var(--file-row-border, 1px solid transparent); margin-block: calc(var(--file-row-gap, 3px) / 2); background: var(--file-row-bg, transparent); box-shadow: var(--file-row-shadow, none); }
li button span:nth-child(2) { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
small { font-size: var(--text-compact); color: var(--theme-text-secondary); }
li button > small { max-width: 35%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
svg { width: 16px; height: 16px; flex-shrink: 0; }
</style>
