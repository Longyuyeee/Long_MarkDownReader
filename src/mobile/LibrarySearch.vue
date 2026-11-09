<template>
  <section ref="pane" class="library-search-page" tabindex="-1" aria-label="资料库全文查找">
    <div class="search-controls"><header class="phone-page-header"><h1 tabindex="-1">搜索</h1></header>
      <label class="search-field"><Search :size="21" aria-hidden="true" /><input ref="input" v-model="view.query" aria-label="查找资料内容" placeholder="搜索名称或文档原文" maxlength="128" enterkeyhint="search" @keydown.enter="submit" @compositionstart="composing = true" @compositionend="composing = false; schedule()" /><button v-if="view.query" aria-label="清除全文查找" @click="view.query = ''; input?.focus()"><X :size="18" aria-hidden="true" /></button></label>
      <button class="search-scope-summary" :aria-label="`搜索范围：${root?.name || '选择资料库'} · ${fieldLabel}`" aria-haspopup="dialog" :aria-expanded="scopeOpen" @click="$emit('scope')"><span>{{ fieldLabel }}<ChevronDown :size="18" aria-hidden="true" /></span></button>
    </div>
    <div v-if="status.phase === 'unavailable'" class="search-progress" role="status"><span>这个资料库暂时无法访问</span><button class="text-button" @click="refresh">重新读取</button></div>
    <template v-if="view.query.trim()">
      <div v-if="status.phase === 'loading'" class="search-progress" role="status"><LoaderCircle :size="18" class="spinning" /><span>{{ status.scope === 'paths' ? '正在读取文件位置' : '正在读取资料' }} · 已准备 {{ status.indexed }} 份文档</span><button class="text-button" @click="index.stop()">停止读取</button></div>
      <div v-else-if="status.phase === 'partial' || status.stale" class="search-progress" role="status"><span>{{ status.phase === 'partial' ? `部分资料可搜索 · ${status.indexed} 份文档` : '资料已变化，请更新' }}</span><button class="text-button" @click="refresh">更新搜索内容</button></div>
      <p v-if="querying" class="search-progress" role="status"><span>正在查找匹配</span><button class="text-button" @click="stopQuery">停止查找</button></p>
      <p v-else-if="stopped" class="search-progress" role="status"><span>查找已停止</span><button class="text-button" @click="search">重新查找</button></p>
      <details v-if="status.issueCount" class="search-issues"><summary>{{ status.issueCount }} 项读取说明 · {{ status.phase === 'unavailable' ? '无法搜索' : '部分资料尚未纳入' }}</summary><ul><li v-for="(issue, i) in status.issues" :key="i"><strong>{{ issue.path }}</strong><span>{{ issue.message }}</span></li></ul><p v-if="status.issueCount > status.issues.length">仅列出前 {{ status.issues.length }} 项。请缩小资料库后重试。</p></details>
    </template>
    <template v-if="status.phase !== 'unavailable'">
      <template v-if="!view.query.trim()">
        <div class="section-heading search-result-heading"><h2>最近打开</h2><span>{{ recent.length }} 项</span></div>
        <div v-if="!recent.length" class="empty-state"><Search :size="34" /><h3>暂无最近记录</h3><button class="button" @click="$emit('browse')">浏览资料</button></div>
        <div v-else class="file-list search-recents"><button v-for="item in recent" :key="item.relativePath" :data-result-path="item.relativePath" class="file-row" @click="openRecent(item)"><MobileFileIcon :name="filename(item.relativePath) || item.relativePath" /><span class="file-info"><strong>{{ filename(item.relativePath) }}</strong><small>{{ item.relativePath.includes('/') ? item.relativePath : '资料库根目录' }}</small></span><ChevronRight :size="18" aria-hidden="true" /></button></div>
      </template>
      <template v-else-if="status.phase !== 'loading' && checked && status.finished">
        <div class="section-heading search-result-heading"><h2 role="status">找到 {{ results.total }} 条结果{{ status.phase === 'partial' ? ' · 部分资料' : '' }}</h2></div>
        <div v-if="!results.total" class="search-empty"><h3>{{ status.phase === 'partial' ? '已读取的资料中没有匹配' : '没有找到匹配' }}</h3><button class="button" @click="$emit('scope')">修改搜索范围</button></div>
        <div v-else class="search-results"><button v-for="hit in results.hits" :key="hit.relativePath" :data-result-path="hit.relativePath" class="search-result" @click="openHit(hit)"><MobileFileIcon :name="filename(hit.relativePath) || hit.relativePath" /><span class="search-result-copy"><strong class="search-result-title"><template v-if="!hit.relativePath.includes('/') && hit.pathMatch">{{ hit.pathExcerpt.before }}<mark>{{ hit.pathExcerpt.hit }}</mark>{{ hit.pathExcerpt.after }}</template><template v-else>{{ filename(hit.relativePath) }}</template></strong><small>{{ hit.contentMatch ? '源文命中' : '名称或路径命中' }}</small><span v-if="hit.relativePath.includes('/')" class="search-result-path">{{ hit.pathExcerpt.before }}<mark>{{ hit.pathExcerpt.hit }}</mark>{{ hit.pathExcerpt.after }}</span><span v-if="hit.excerpt" class="search-result-excerpt"><MobileCodeExcerpt v-if="hit.codeExcerpt && codeFileInfo(hit.relativePath)" :excerpt="hit.codeExcerpt" :language="codeFileInfo(hit.relativePath)!.language" /><template v-else>{{ hit.excerpt.before }}<mark>{{ hit.excerpt.hit }}</mark>{{ hit.excerpt.after }}</template></span></span><ChevronRight :size="18" aria-hidden="true" /></button></div>
        <p v-if="results.total > results.hits.length" class="subtle-message">先显示前 {{ results.hits.length }} 份文件，请增加关键词缩小结果。</p>
      </template>
    </template>
  </section>
</template>
<script setup lang="ts">
import MobileFileIcon from './MobileFileIcon.vue'
import MobileCodeExcerpt from './MobileCodeExcerpt.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, LoaderCircle, Search, X } from 'lucide-vue-next'
import { codeFileInfo } from './codeFormats'
import type { Identity, Library, Storage } from './storage'
import type { LibrarySearchIndex, SearchField, SearchHit, SearchResults, SearchStatus } from './librarySearch'
const props = defineProps<{ root?: Library; recent: Identity[]; scopeOpen: boolean; storage: Storage; index: LibrarySearchIndex; status: SearchStatus; view: { query: string; field: SearchField; scroll: number; focusPath: string } }>()
const emit = defineEmits<{ scope: []; browse: []; 'open-recent': [identity: Identity]; open: [hit: SearchHit, query: string] }>()
const fieldLabel = computed(() => ({ all: '名称与原文', content: '文档源文', path: '名称与路径' })[props.view.field])
const results = ref<SearchResults>({ hits: [], total: 0 }), checked = ref(false), input = ref<HTMLInputElement>(), composing = ref(false)
const pane = ref<HTMLElement>()
const querying = ref(false), stopped = ref(false)
const filename = (path: string) => path.split('/').pop()
let timer: ReturnType<typeof setTimeout> | undefined, generation = 0, alive = true, opening = false
let building = false, queryController: AbortController | null = null
const scopeId = props.index.status.rootId
async function search() {
  const owner = ++generation
  queryController?.abort(); checked.value = false; querying.value = false; stopped.value = false
  if (!await props.index.verifyAccess(props.storage) || !alive || owner !== generation) return
  const scope = props.view.field === 'path' ? 'paths' : 'content'
  if (props.status.phase === 'loading') return
  const needsScope = (scope === 'content' && props.status.scope === 'paths') || (scope === 'paths' && props.status.scope === 'content' && props.status.phase === 'partial')
  if (props.view.query.trim() && (props.status.phase === 'idle' || needsScope)) {
    building = true
    try { await props.index.build(props.storage, scope) } finally { building = false }
    if (alive && owner !== generation) { schedule(); return }
  }
  if (!alive || owner !== generation) return
  queryController = new AbortController(); querying.value = !!props.view.query.trim()
  const result = await props.index.searchAsync(props.view.query, props.view.field, queryController.signal)
  if (!alive || owner !== generation) return
  querying.value = false
  if (result) { results.value = result; checked.value = true; await nextTick(); if (props.view.focusPath) restoreFocus() }
}
function schedule() {
  clearTimeout(timer); generation++; queryController?.abort(); checked.value = false; querying.value = false; stopped.value = false
  if (!composing.value) timer = setTimeout(() => { void search() }, 200)
}
function stopQuery() { clearTimeout(timer); generation++; queryController?.abort(); props.index.cancelSearch(); querying.value = false; checked.value = false; stopped.value = true }
function submit() { if (!composing.value) { clearTimeout(timer); input.value?.blur(); void search() } }
async function refresh() {
  clearTimeout(timer); generation++; queryController?.abort(); querying.value = false; stopped.value = false; building = true
  try { await props.index.build(props.storage, props.view.field === 'path' ? 'paths' : 'content') } finally { building = false }
  if (alive) void search()
}
function openRecent(identity: Identity) { props.view.scroll = window.scrollY; props.view.focusPath = identity.relativePath; opening = true; emit('open-recent', identity) }
function openHit(hit: SearchHit) { props.view.scroll = window.scrollY; props.view.focusPath = hit.relativePath; opening = true; emit('open', hit, props.view.query.trim()) }
watch(() => [props.view.query, props.view.field], () => { props.view.scroll = 0; props.view.focusPath = ''; schedule() })
watch(() => [props.status.finished, props.status.phase, props.status.rootId], () => {
  if (props.status.phase === 'loading' || props.status.phase === 'unavailable') { queryController?.abort(); results.value = { hits: [], total: 0 }; checked.value = false; querying.value = false }
  else if (!building && alive) void search()
})
function restoreFocus(restoreScroll = false) {
  if (input.value && document.activeElement === input.value) return
  if (restoreScroll) window.scrollTo(0, props.view.scroll)
  // Restore keyboard focus without bringing up the IME. The parent also calls
  // this after the closing transition has released its inert subtree.
  const previous = [...(pane.value?.querySelectorAll<HTMLButtonElement>('button[data-result-path]') || [])].find(row => row.dataset.resultPath === props.view.focusPath)
  ;(previous || pane.value)?.focus({ preventScroll: true })
}
onMounted(async () => {
  await search(); await nextTick()
  if (!alive) return
  restoreFocus(true)
})
function rememberPosition() { props.view.scroll = window.scrollY; opening = true }
defineExpose({ restoreFocus, rememberPosition, refresh })
onBeforeUnmount(() => { alive = false; generation++; clearTimeout(timer); queryController?.abort(); props.index.cancelSearch(); if (props.index.status.rootId === scopeId) { props.index.stop(); if (!opening) props.view.scroll = window.scrollY } })
</script>
