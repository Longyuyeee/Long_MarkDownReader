<template>
  <section class="note-relations" aria-label="笔记关系">
    <header class="relations-heading"><span class="heading-icon"><Link /></span><div><h2>笔记关系</h2><p>从引用找到相关笔记，接着阅读</p></div><button v-if="note" class="icon-button" aria-label="刷新笔记关系" :disabled="outLoading || inLoading" @click="refresh"><RefreshCw :class="{ spinning: outLoading || inLoading }" /></button></header>
    <template v-if="note">
      <div class="current-note"><div class="section-label"><strong>当前笔记</strong><small v-if="note.dirty">未保存</small></div><div class="note-name"><NotebookPen /><strong>{{ note.name }}</strong></div><p v-if="note.dirty">正文中的引用已更新，其他笔记的引用以保存内容为准。</p></div>
      <nav class="relation-directions" aria-label="引用方向"><button :aria-pressed="direction === 'outgoing'" @click="direction = 'outgoing'"><ArrowUpRight /><span>我提到的</span><small>{{ outgoing.length }}</small></button><button :aria-pressed="direction === 'incoming'" @click="direction = 'incoming'"><ArrowDownLeft /><span>提到我的</span><small>{{ incoming.length }}</small></button></nav>
      <p class="direction-hint">{{ direction === 'outgoing' ? '当前正文中引用的笔记，点击即可打开' : '看看谁引用了这篇笔记，以及在哪里提到它' }}</p>
      <template v-if="direction === 'outgoing'">
        <div v-if="outError" class="relation-error" role="alert"><p>暂时没能读取正文中的引用。</p><button @click="loadOutgoing"><RefreshCw />重试</button><details><summary>错误详情</summary><pre>{{ outError }}</pre></details></div>
        <p v-else-if="outLoading" class="loading-state" role="status"><RefreshCw class="spinning" />正在整理正文引用…</p>
        <div v-else-if="outgoing.length" class="relation-list"><button v-for="target in outgoing" :key="target" class="relation-note" :disabled="Boolean(opening)" @click="openTarget(target)"><NotebookPen :style="{ color: noteIconColor }" /><span><strong>{{ target }}</strong><small>{{ opening === target ? '正在查找笔记…' : '正文中的引用' }}</small></span><ChevronRight /></button></div>
        <div v-else class="empty-relations"><ArrowUpRight /><strong>还没提到其他笔记</strong><p>在正文中写上 <code>[[会议记录]]</code>，就能从这里打开它。</p><button @click="$emit('browse')"><Search />查找一篇笔记</button></div>
        <div v-if="openError" class="relation-error" role="alert"><p>{{ openError }}</p><button @click="$emit('search', openingTarget)"><Search />在文件中查找</button><details v-if="openErrorDetails"><summary>错误详情</summary><pre>{{ openErrorDetails }}</pre></details></div>
        <div v-if="choices.length" class="target-choices"><div class="choice-heading"><strong>有多篇同名笔记，请选择</strong><button class="icon-button" aria-label="取消选择链接目标" @click="choices = []"><X /></button></div><button v-for="file in choices" :key="file.path" class="relation-note" @click="chooseTarget(file.path)"><NotebookPen /><span><strong>{{ file.name }}</strong><small>{{ relativePath(file.path) }}</small></span><ChevronRight /></button></div>
      </template>
      <template v-else>
        <div v-if="inError" class="relation-error" role="alert"><p>暂时没能读取引用这篇笔记的资料。</p><button @click="loadIncoming"><RefreshCw />重试</button><details><summary>错误详情</summary><pre>{{ inError }}</pre></details></div>
        <p v-else-if="inLoading" class="loading-state" role="status"><RefreshCw class="spinning" />正在查找引用来源…</p>
        <div v-else-if="incoming.length" class="relation-list"><article v-for="file in incoming" :key="file.path" class="incoming-note"><button class="relation-note" @click="$emit('open', file.path)"><NotebookPen :style="{ color: noteIconColor }" /><span><strong>{{ file.title }}</strong><small>{{ relativePath(file.path) }}</small><span v-if="file.context" class="reference-excerpt">{{ file.context }}</span></span><ChevronRight /></button><details v-if="file.context" class="reference-details"><summary>查看引用句</summary><p>{{ file.context }}</p></details></article></div>
        <div v-else class="empty-relations"><ArrowDownLeft /><strong>还没有笔记引用这里</strong><p>在其他笔记中写上 <code>[[{{ note.name.replace(/\.md$/i, '') }}]]</code>，保存后就会出现在这里。</p></div>
      </template>

      <details class="graph-tools"><summary><Network /><span>查看关系图</span><ChevronDown /></summary><p>想从整体查看关联时，可以打开图谱，或把关系图留在正文旁边。</p><div class="graph-actions"><button @click="$emit('graph')"><Network />在知识图谱中查看<ChevronRight /></button><button data-testid="local-graph-pin" :aria-pressed="pinned" @click="$emit('pin', !pinned)"><PanelRight />{{ pinned ? '取消右侧关系图' : '在右侧保留关系图' }}<Check v-if="pinned" /></button></div></details>
    </template>
    <div v-else class="empty-relations"><NotebookPen /><strong>{{ otherFileOpen ? '这类文件不使用笔记引用' : '先打开一篇笔记' }}</strong><p>{{ otherFileOpen ? '这里查看 Markdown 正文中的笔记引用；其他资料的关系可以在知识图谱中查看。' : '打开 Markdown 笔记后，就能看到它提到了谁，以及哪些笔记引用了它。' }}</p><button @click="$emit('browse')"><Search />打开笔记</button><button v-if="otherFileOpen" @click="$emit('graph')"><Network />在知识图谱中查看</button></div>
    <details class="relation-help"><summary><CircleHelp />资料之间怎么建立关系？</summary><p>点击顶部“添加关系”，选择另一份文件和关系类型，笔记、PDF、表格等资料都可以使用。手动关系会显示在知识图谱中。</p><button @click="requestFileRelation(note?.path || store.activeTabId || undefined)"><Plus />添加资料关系</button><p>Markdown 还可以在正文里写 <code>[[会议记录]]</code>。保存后，它会出现在“我提到的”，对方的“提到我的”里会看到这篇笔记。</p></details>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleHelp, Link, Network, NotebookPen, PanelRight, Plus, RefreshCw, Search, X } from 'lucide-vue-next'
import { requestFileRelation } from '../services/fileRelations'
import { useAppStore } from '../store/app'
import { resolveFileTreeVisual } from '../config/fileTreeAppearance'
import { noteLinkTargets, type LinkFile } from '../utils/noteLinkTargets'
import { searchResultPath } from '../utils/searchResultPath'
interface Note { path: string; name: string; content: string; dirty: boolean }
interface Backlink { title: string; path: string; context: string }
const props = defineProps<{ note: Note | null; otherFileOpen: boolean; pinned: boolean }>()
const emit = defineEmits<{ open: [path: string]; graph: []; pin: [pinned: boolean]; browse: []; search: [target: string] }>()
const store = useAppStore()
const direction = ref<'outgoing' | 'incoming'>('outgoing'), outgoing = ref<string[]>([]), incoming = ref<Backlink[]>([])
const outLoading = ref(false), inLoading = ref(false), outError = ref(''), inError = ref('')
const opening = ref(''), openingTarget = ref(''), choices = ref<LinkFile[]>([]), openError = ref(''), openErrorDetails = ref('')
const relativePath = (path: string) => searchResultPath(path, store.libraryPath)
const noteIconColor = computed(() => store.displayPreferences.fileIconStyle === 'muted' ? 'var(--theme-text-secondary)' : resolveFileTreeVisual('markdown').color)
let outGeneration = 0, inGeneration = 0, openGeneration = 0, disposed = false, debounce: ReturnType<typeof setTimeout> | undefined
const current = (path: string, root: string) => !disposed && path === props.note?.path && root === store.libraryPath
async function loadOutgoing() {
  if (!props.note) return
  const token = ++outGeneration, note = props.note, root = store.libraryPath
  outLoading.value = true; outError.value = ''
  try {
    const links = await invoke<string[]>('extract_wikilinks', { content: note.content })
    if (token === outGeneration && current(note.path, root)) outgoing.value = [...new Set(links)]
  } catch (error) { if (token === outGeneration && current(note.path, root)) outError.value = String(error) }
  finally { if (token === outGeneration) outLoading.value = false }
}
async function loadIncoming() {
  if (!props.note) return
  const token = ++inGeneration, path = props.note.path, root = store.libraryPath
  inLoading.value = true; inError.value = ''
  try {
    const files = await invoke<Backlink[]>('find_backlinks', { filePath: path, libraryRoot: root })
    if (token === inGeneration && current(path, root)) incoming.value = files
  } catch (error) { if (token === inGeneration && current(path, root)) inError.value = String(error) }
  finally { if (token === inGeneration) inLoading.value = false }
}
const refresh = () => { if (debounce) clearTimeout(debounce); void loadOutgoing(); void loadIncoming() }
const clearTarget = () => { ++openGeneration; opening.value = ''; choices.value = []; openError.value = ''; openErrorDetails.value = '' }
async function openTarget(target: string) {
  if (!props.note || opening.value) return
  const token = ++openGeneration, path = props.note.path, root = store.libraryPath
  opening.value = target; openingTarget.value = target; choices.value = []; openError.value = ''; openErrorDetails.value = ''
  try {
    const title = target.replace(/\\/g, '/').split('/').pop()?.replace(/\.md$/i, '') || target
    const files = await invoke<LinkFile[]>('search_library', { libraryRoot: root, query: title, namesOnly: true })
    if (token !== openGeneration || !current(path, root)) return
    const found = noteLinkTargets(target, files, root, path)
    if (found.length === 1) emit('open', found[0].path)
    else if (found.length > 1) choices.value = found
    else openError.value = `未找到“${target}”笔记，可以查找文件，或在正文中调整链接。`
  } catch (error) { if (token === openGeneration && current(path, root)) { openError.value = '暂时没能打开引用的笔记，请查找文件后重试。'; openErrorDetails.value = String(error) } }
  finally { if (token === openGeneration) opening.value = '' }
}
const chooseTarget = (path: string) => { choices.value = []; emit('open', path) }
watch(() => [props.note?.path, store.libraryPath] as const, () => {
  ++outGeneration; ++inGeneration; clearTarget(); if (debounce) clearTimeout(debounce)
  outgoing.value = []; incoming.value = []; outError.value = ''; inError.value = ''; outLoading.value = false; inLoading.value = false
  refresh()
}, { immediate: true, flush: 'sync' })
watch(() => props.note?.content, () => { ++outGeneration; clearTarget(); if (debounce) clearTimeout(debounce); if (props.note) debounce = setTimeout(loadOutgoing, 350) }, { flush: 'sync' })
onBeforeUnmount(() => { disposed = true; ++outGeneration; ++inGeneration; ++openGeneration; if (debounce) clearTimeout(debounce) })
</script>

<style scoped>
.note-relations { padding: 14px 12px 20px; min-width: 0; box-sizing: border-box; color: var(--theme-text); font-size: var(--text-sm); }.relations-heading { display: flex; align-items: center; gap: 9px; margin-bottom: 16px; }.relations-heading > div { flex: 1; min-width: 0; }
.heading-icon { width: 36px; height: 36px; display: grid; place-items: center; flex-shrink: 0; border-radius: var(--theme-radius-sm); color: var(--theme-primary); background: var(--chrome-icon-surface, rgba(var(--theme-primary-rgb), .1)); }.heading-icon svg { width: 21px; height: 21px; }h2 { font-size: 15px; margin: 0; line-height: 1.45; }p { font-size: var(--text-compact); line-height: 1.6; color: var(--theme-text-secondary); overflow-wrap: anywhere; }.relations-heading p { margin: 4px 0 0; }code { color: var(--theme-primary); font-size: inherit; overflow-wrap: anywhere; }
button { box-sizing: border-box; min-width: 0; max-width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 9px; min-height: 32px; font: inherit; color: var(--theme-text); border: 1px solid var(--workspace-border-color); border-radius: var(--theme-radius-sm); background: var(--theme-surface); cursor: pointer; transition: background var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard); }button:hover { background: rgba(var(--theme-primary-rgb), .08); border-color: rgba(var(--theme-primary-rgb), .35); }button:disabled { opacity: .5; cursor: default; }button:focus-visible, summary:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }svg { width: 16px; height: 16px; flex-shrink: 0; }.icon-button { width: 28px; min-height: 28px; padding: 0; border: 0; background: transparent; color: var(--theme-text-secondary); }
.current-note { padding: 11px; border: var(--theme-border); border-radius: var(--theme-radius); background: var(--theme-surface); }.section-label { display: flex; align-items: center; gap: 7px; color: var(--theme-text-secondary); font-size: var(--text-compact); }.section-label small { margin-left: auto; font-size: var(--text-compact); }.note-name { display: flex; align-items: center; gap: 7px; margin-top: 9px; min-width: 0; }.note-name > svg { color: var(--theme-primary); }.note-name strong { min-width: 0; font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.current-note p { margin: 9px 0 0; font-size: 11px; }
.relation-directions { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 16px; padding: 4px; border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); }.relation-directions button { padding: 5px 2px; min-height: 32px; font-size: var(--text-compact); gap: 4px; border: 0; background: transparent; white-space: nowrap; }.relation-directions button[aria-pressed="true"] { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), .1); font-weight: 650; }.relation-directions svg { width: 14px; height: 14px; }.relation-directions small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.direction-hint { margin: 10px 0 12px; font-size: 11px; }
.relation-list { display: grid; gap: 7px; }.relation-note { justify-content: start; align-items: start; width: 100%; gap: 8px; padding: 10px 8px; text-align: left; border: var(--file-row-border); background: var(--file-row-bg, var(--theme-surface)); border-radius: var(--theme-radius-sm); box-shadow: var(--file-row-shadow); min-height: var(--file-row-height); }.relation-note > svg { margin-top: 2px; }.relation-note > span { flex: 1; min-width: 0; display: grid; gap: 5px; }.relation-note strong { font-size: var(--text-sm); overflow-wrap: anywhere; line-height: 1.5; }.relation-note small { color: var(--theme-text-secondary); font-size: var(--text-compact); overflow-wrap: anywhere; }.relation-note > svg:last-child { color: var(--theme-text-secondary); width: 12px; }.incoming-note { border: var(--file-row-border); background: var(--file-row-bg, var(--theme-surface)); border-radius: var(--theme-radius-sm); box-shadow: var(--file-row-shadow); }.incoming-note > .relation-note { border: 0; background: transparent; box-shadow: none; }.reference-excerpt { color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.5; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.reference-details { padding: 0 8px 9px 32px; color: var(--theme-text-secondary); font-size: var(--text-compact); }.reference-details p { margin-bottom: 0; white-space: pre-wrap; }
.empty-relations { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 23px 10px; text-align: center; border: var(--theme-border); border-radius: var(--theme-radius); background: var(--theme-surface); }.empty-relations > svg { width: 29px; height: 29px; color: var(--theme-primary); }.empty-relations strong { font-size: var(--text-sm); }.empty-relations p { margin: 0; }.empty-relations button { font-size: var(--text-compact); }
.loading-state { display: flex; align-items: start; gap: 6px; }.relation-error { margin: 10px 0; padding: 10px; border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); }.relation-error p { margin: 0 0 9px; }.relation-error button { font-size: var(--text-compact); }.relation-error details { margin-top: 9px; color: var(--theme-text-secondary); font-size: 11px; }pre { font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 120px; overflow: auto; }.target-choices { padding: 10px; margin-top: 10px; display: grid; gap: 7px; border: 1px solid rgba(var(--theme-primary-rgb), .3); border-radius: var(--theme-radius-sm); background: var(--theme-surface); }.choice-heading { display: flex; align-items: center; gap: 5px; justify-content: space-between; font-size: var(--text-compact); }
.graph-tools { margin-top: 18px; padding: 11px; border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); font-size: var(--text-compact); }.graph-tools > summary { display: flex; align-items: center; gap: 7px; color: var(--theme-primary); }.graph-tools > summary > span { flex: 1; }.graph-tools[open] > summary > svg:last-child { transform: rotate(180deg); }.graph-tools p { margin: 10px 0; font-size: 11px; }.graph-actions { display: grid; gap: 6px; }.graph-actions button { justify-content: start; text-align: left; font-size: var(--text-compact); padding: 7px; }.graph-actions button > svg:last-child:not(:first-child) { margin-left: auto; width: 12px; }.graph-actions button[aria-pressed="true"] { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), .07); }
.relation-help { margin-top: 16px; padding-top: 12px; border-top: var(--theme-border); color: var(--theme-text-secondary); font-size: var(--text-compact); }.relation-help > summary { display: flex; align-items: center; gap: 7px; }summary { cursor: pointer; }.relation-help p:last-child { margin-bottom: 0; }
.spinning { animation: relation-spin 1s linear infinite; }@keyframes relation-spin { to { transform: rotate(360deg); } }@media (prefers-reduced-motion: reduce) { .spinning { animation: none; } }:global(body[data-motion="reduced"]) .spinning { animation: none; }
</style>
