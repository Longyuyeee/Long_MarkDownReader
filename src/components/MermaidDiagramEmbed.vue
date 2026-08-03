<template>
  <section class="mermaid-embed" :class="{ compact }">
    <header>
      <div><strong>{{ sourceLabel }}</strong><span>Mermaid 源文件 · 实时引用</span></div>
      <nav>
        <button title="重新读取源文件" :disabled="loading" @mousedown.stop @click.stop="load">↻</button>
        <button title="打开图表工作室" @mousedown.stop @click.stop="$emit('open', resolvedSource)">编辑源图表</button>
      </nav>
    </header>
    <div v-if="loading" class="embed-state">正在渲染图表…</div>
    <div v-else-if="error" class="embed-state error"><strong>图表引用不可用</strong><span>{{ error }}</span></div>
    <div v-else class="diagram-stage" v-html="svg"></div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'

interface DiagramDocument { path: string; content: string; signature: string }
const props = defineProps<{ libraryRoot: string; source: string; hostPath?: string; compact?: boolean; dark?: boolean }>()
defineEmits<{ (event: 'open', path: string): void }>()
const loading = ref(true)
const error = ref('')
const svg = ref('')
const instanceId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(16).slice(2)
let generation = 0

const resolvedSource = computed(() => {
  const source = props.source.trim()
  if (/^[A-Za-z]:[\\/]/.test(source) || source.startsWith('/')) return source
  const host = props.hostPath || props.libraryRoot
  const separator = host.includes('\\') ? '\\' : '/'
  const parent = host.substring(0, Math.max(host.lastIndexOf('/'), host.lastIndexOf('\\')))
  return `${parent}${separator}${source.replace(/[\\/]/g, separator)}`
})
const sourceLabel = computed(() => props.source.split(/[\\/]/).pop() || props.source)

const load = async () => {
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    const document = await invoke<DiagramDocument>('read_diagram_file', { libraryRoot: props.libraryRoot, path: resolvedSource.value })
    if (current !== generation) return
    if (document.content.length > 200_000) throw new Error('Canvas 内嵌预览最多解析 20 万字符，请双击打开源图表')
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: props.dark ? 'dark' : 'default',
      maxTextSize: 200_000,
      suppressErrorRendering: true,
      flowchart: { htmlLabels: false, useMaxWidth: true },
    })
    await mermaid.parse(document.content, { suppressErrors: false })
    const rendered = await mermaid.render(`longedit-canvas-diagram-${instanceId}-${current}`, document.content)
    if (current !== generation) return
    svg.value = rendered.svg
  } catch (cause) {
    if (current !== generation) return
    svg.value = ''
    error.value = String(cause).replace(/^Error:\s*/, '').split('\n').slice(0, 3).join(' ').slice(0, 500)
  } finally {
    if (current === generation) loading.value = false
  }
}
const handleFocus = () => { void load() }
const handleSaved = (event: Event) => {
  const path = (event as CustomEvent<string>).detail
  if (path && path.toLocaleLowerCase() === resolvedSource.value.toLocaleLowerCase()) void load()
}
watch(() => [props.source, props.hostPath, props.libraryRoot, props.dark], load)
onMounted(() => {
  void load()
  window.addEventListener('focus', handleFocus)
  window.addEventListener('longedit:diagram-saved', handleSaved)
})
onBeforeUnmount(() => {
  generation += 1
  window.removeEventListener('focus', handleFocus)
  window.removeEventListener('longedit:diagram-saved', handleSaved)
})
</script>

<style scoped>
.mermaid-embed { min-width: 0; min-height: 300px; display: grid; grid-template-rows: 42px minmax(0,1fr); overflow: hidden; border: 1px solid rgba(0,0,0,.09); border-radius: 10px; background: var(--theme-card); box-shadow: 0 5px 18px rgba(32,54,76,.08); }
.mermaid-embed > header { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 11px 0 14px; border-bottom: 1px solid rgba(0,0,0,.07); }.mermaid-embed header > div { min-width: 0; display: flex; flex-direction: column; }.mermaid-embed header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.mermaid-embed header span { color: var(--theme-text-secondary); font-size: var(--text-compact); }.mermaid-embed nav { display: flex; gap: 5px; }.mermaid-embed button { height: 25px; padding: 0 7px; border: 1px solid rgba(0,0,0,.09); border-radius: 5px; color: var(--theme-text-secondary); background: rgba(0,0,0,.025); cursor: pointer; font-size: var(--text-compact); }.mermaid-embed button:hover { color: var(--theme-primary); border-color: var(--theme-primary); }.mermaid-embed button:disabled { opacity: .45; }
.embed-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 18px; color: var(--theme-text-secondary); text-align: center; font-size: var(--text-compact); }.embed-state.error strong { color: #d45555; }.embed-state span { max-width: 460px; word-break: break-word; }
.diagram-stage { min-width: 0; min-height: 0; display: grid; place-items: center; padding: 12px; overflow: auto; box-sizing: border-box; }.diagram-stage :deep(svg) { width: 100%; height: 100%; max-width: 100%; max-height: 100%; }
.mermaid-embed.compact { min-height: 0; height: 100%; border: 0; border-radius: 0; box-shadow: none; }.mermaid-embed.compact > header { height: 37px; }
</style>
