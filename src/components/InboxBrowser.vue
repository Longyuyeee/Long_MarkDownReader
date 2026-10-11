<template>
  <section class="inbox-browser" aria-label="收集箱文件" :aria-busy="loading">
    <div class="actions"><button @click="$emit('close')">← 全部文件</button><button :disabled="loading" @click="reload">刷新</button></div>
    <div class="location" :title="directory">{{ breadcrumb }}</div>
    <button v-if="parents.length" @click="up">↑ 上一级</button>
    <p v-if="loading" role="status">正在读取收集箱…</p>
    <div v-else-if="error" role="alert"><strong>收集箱暂时不可用</strong><p>目录尚未创建、已移动或不可读。可先通过快速笔记保存到收集箱；已有资料请检查目录后重试。</p><button @click="reload">重试读取</button><details><summary>错误详情</summary>{{ error }}</details></div>
    <p v-else-if="!entries.length" role="status">此目录暂无可浏览的资料文件</p>
    <template v-else><p>{{ entries.filter(item => !item.is_dir).length }} 个文件 · {{ entries.filter(item => item.is_dir).length }} 个文件夹</p><ul><li v-for="item in entries" :key="item.path"><button :title="item.path" @click="activate(item)"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path v-if="item.is_dir" d="M3 7V5h6l2 2h10v13H3Z"/><path v-else d="M6 3h8l4 4v14H6ZM14 3v5h4M9 12h6M9 16h6"/></svg><span>{{ item.name }}</span><small v-if="item.is_dir">进入</small></button></li></ul></template>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { invoke, listen } from '../services/tauriRuntime'
interface Entry { name: string; path: string; is_dir: boolean }
const props = defineProps<{ libraryRoot: string }>()
const emit = defineEmits<{ close: []; open: [path: string] }>()
const directory = ref(''), entries = ref<Entry[]>([]), parents = ref<string[]>([])
const error = ref(''), loading = ref(false)
const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || ''
const breadcrumb = computed(() => ['Inbox', ...parents.value.slice(1).map(basename), ...(parents.value.length ? [basename(directory.value)] : [])].join(' / '))
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
watch(() => props.libraryRoot, root => { parents.value = []; directory.value = root.replace(/[\\/]$/, '') + '/Inbox'; void reload() }, { immediate: true })
onMounted(async () => {
  try { const stop = await listen('refresh-library', () => { void reload() }); if (disposed) stop(); else unlisten = stop }
  catch (cause) { console.warn('收集箱自动刷新订阅失败，可手动刷新', cause) }
})
onUnmounted(() => { disposed = true; ++generation; unlisten?.() })
</script>
<style scoped>
.inbox-browser { flex: 1; padding: 8px 10px; min-height: 0; overflow: auto; color: var(--theme-text); }
.actions { display: flex; justify-content: space-between; gap: 8px; }
button { color: inherit; background: transparent; border: 0; padding: 6px; cursor: pointer; font: inherit; text-align: left; }
button:hover { background: rgba(var(--theme-primary-rgb), .08); }
button:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: -2px; }
button:disabled { opacity: .5; cursor: default; }
.location { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 6px; font-size: 12px; }
p, details { font-size: 12px; color: var(--theme-text-secondary); overflow-wrap: anywhere; }
ul { list-style: none; padding: 0; margin: 0; }
li button { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; }
li button span:nth-child(2) { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
small { font-size: 11px; color: var(--theme-text-secondary); }
svg { width: 16px; height: 16px; flex-shrink: 0; }
</style>
