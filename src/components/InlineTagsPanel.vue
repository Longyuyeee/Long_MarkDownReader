<template>
  <section class="inline-tags" aria-label="文内标签">
    <section v-if="currentNote" class="current-note" aria-label="当前笔记标签">
      <div class="note-name"><NotebookPen /><strong>{{ currentNote.name }}</strong><span v-if="currentNote.dirty" class="draft-state">未保存</span></div>
      <div v-if="noteTags.length" class="note-tags"><button v-for="tag in noteTags" :key="tag" :aria-label="`查看 #${tag} 的笔记`" @click="selectTag(tag)">#{{ tag }}</button></div>
      <p v-else class="note-empty">这篇笔记还没有标签</p>
      <div class="note-actions"><button :disabled="!currentNote.editable || adding" :aria-expanded="addingOpen" @click="toggleAdd"><Plus />添加标签</button><button v-if="currentNote.dirty" :disabled="!currentNote.editable || adding" @click="$emit('save')"><Save />保存笔记</button></div>
      <p v-if="!currentNote.editable" class="note-empty">当前笔记暂时不能编辑，仍可查看标签。</p>
      <form v-if="addingOpen" class="tag-form" @submit.prevent="add">
        <label>标签名称<input ref="tagInput" v-model="newTag" :disabled="adding || !currentNote.editable" maxlength="80" placeholder="例如：项目，或 #项目" /></label>
        <p class="add-hint">写入正文末尾，需保存笔记。</p>
        <div class="form-actions"><button class="primary" type="submit" :disabled="adding || !newTag.trim() || !currentNote.editable">{{ adding ? '正在添加…' : '写入笔记' }}</button><button type="button" :disabled="adding" @click="addingOpen = false">取消</button></div>
      </form>
      <p v-if="addError" class="local-error" role="alert">{{ addError }}</p>
      <p v-if="notice" class="tag-notice" role="status"><Check />{{ notice }}</p>
    </section>
    <div v-else class="note-guide"><span>{{ otherFileOpen ? '当前文件不支持文内标签' : '未打开笔记' }}</span><button @click="$emit('browse')">打开笔记<ChevronRight /></button></div>

    <template v-if="!selectedTag">
      <div class="section-label library-label"><strong>全部标签</strong><small>{{ tags.length }}</small><button class="icon-button" aria-label="刷新文内标签" :disabled="loading || running" @click="refresh"><RefreshCw :class="{ spinning: loading || running }" /></button></div>
      <div v-if="tags.length" class="tag-filter"><Search /><input v-model="filter" aria-label="查找标签" placeholder="查找标签" /><button v-if="filter" class="icon-button" aria-label="清除标签查找" @click="filter = ''"><X /></button></div>
      <div v-if="error" class="tag-error" role="alert"><p>暂时没能读取资料库的标签。</p><button :disabled="loading" @click="$emit('refresh')"><RefreshCw />重试</button><details><summary>错误详情</summary><pre>{{ error }}</pre></details></div>
      <p v-if="loading" class="loading-state" role="status"><RefreshCw class="spinning" />正在整理已保存笔记的标签…</p>
      <p v-if="catalogStale" role="status">保留上次标签数量，本次统计尚未完成。</p>
      <p v-else-if="catalog && !catalog.scanComplete" role="status">已统计 {{ catalog.examinedNotes }} 篇笔记，数量仅为已统计部分。{{ catalog.warnings.join('；') }}</p>
      <button v-if="catalogMore" :disabled="loading" @click="$emit('continue-catalog')">继续统计标签</button>
      <div v-if="filteredTags.length" class="all-tags"><button v-for="entry in filteredTags" :key="entry.tag" class="tag-item" @click="selectTag(entry.tag)" @contextmenu.prevent="openTagMenu($event, entry.tag)"><span class="tag-symbol"><Pin v-if="preferences.pinnedTags.includes(entry.tag)" /><template v-else>#</template></span><strong>{{ entry.tag }}</strong><small>{{ entry.count === null ? '待统计' : `${entry.count} 篇` }}</small><ChevronRight /></button></div>
      <p v-else-if="!loading && !error" class="empty-label">{{ catalog && !catalog.scanComplete ? '标签尚未统计完整，请继续统计或查看提示。' : filter.trim() ? '没有找到这个标签' : '暂无已保存的标签' }}</p>
    </template>

    <template v-else>
      <button class="back-button" @click="back"><ArrowLeft />全部标签</button>
      <div class="selected-heading"><span class="tag-symbol">#</span><div><h3>{{ selectedTag }}</h3></div><button class="icon-button" aria-label="刷新标签笔记" :disabled="loading || running" @click="refresh"><RefreshCw :class="{ spinning: running }" /></button></div>
      <div v-if="resultError" class="tag-error" role="alert"><p>{{ resultError }}</p><button :disabled="running" @click="selectTag(selectedTag)"><RefreshCw />重试</button></div>
      <p v-if="running" class="loading-state" role="status"><RefreshCw class="spinning" />正在查找笔记…</p>
      <div class="tag-result-body">
        <div class="section-label"><strong>相关笔记</strong><small>已加载 {{ results.length }}<template v-if="pageState?.totalFiles != null && !retaining"> / {{ pageState.totalFiles }}</template> 篇</small></div>
        <p v-if="retaining">仍显示上次笔记，本次尚未更新。</p><p v-else-if="pageState && !pageState.scanComplete">尚未查全。{{ pageState.warnings?.join('；') }}</p>
        <div class="note-actions"><button :disabled="!results.length || running" @click="selecting = !selecting; selectedPaths = []">{{ selecting ? '取消选择' : '选择笔记整理标签' }}</button><button v-if="selecting" :disabled="!selectedPaths.length" @click="editingTags = true">整理 {{ selectedPaths.length }} 份笔记</button></div>
        <p v-if="selecting">最多选择 64 篇；仅处理明确选择的已加载笔记，不会代存草稿。</p>
        <div v-if="!results.length && pageState?.scanComplete && !resultError" class="empty-tags"><strong>还没有保存的匹配笔记</strong><p>刚添加的标签需保存笔记后刷新。旧标签的固定记录仍保留，可右键取消固定。</p></div>
        <div v-else class="tag-results"><div v-for="file in results" :key="file.path" class="tag-file-row"><input v-if="selecting" v-model="selectedPaths" type="checkbox" :value="file.path" :aria-label="`选择 ${file.title}`" :disabled="selectedPaths.length >= 64 && !selectedPaths.includes(file.path)" /><button class="tag-note" @click="$emit('open', file.path)"><NotebookPen :style="{ color: noteIconColor }" /><span><strong>{{ file.title }}</strong><small>{{ resultPath(file.path) }}</small></span><ChevronRight /></button></div></div>
        <button v-if="nextPage" class="file-search" :disabled="running" @click="lookup.loadMore()">加载更多笔记</button><button v-if="canContinue" class="file-search" :disabled="running" @click="lookup.continueSearch()">继续查找笔记</button>
        <button class="file-search" @click="$emit('search', selectedTag)"><Search />在文件搜索中查看<ChevronRight /></button>
      </div>
    </template>

    <n-dropdown :show="tagMenu.show" :x="tagMenu.x" :y="tagMenu.y" trigger="manual" placement="bottom-start" :options="tagMenuOptions" @select="tagMenuAction" @clickoutside="tagMenu.show = false" />
    <TagEditDialog v-if="editingTags" :tag="selectedTag" :paths="selectedPaths" @close="editingTags = false" @completed="refresh" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { NDropdown } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { ArrowLeft, Check, ChevronRight, NotebookPen, Plus, RefreshCw, Save, Search, X, Pin } from 'lucide-vue-next'
import { libraryNavigationPreferences, updateLibraryNavigation } from '../services/libraryNavigationPreferences'
import { useAppStore } from '../store/app'
import { inlineTags, normalizeInlineTag } from '../utils/inlineTags'
import { searchResultPath } from '../utils/searchResultPath'
import { resolveFileTreeVisual } from '../config/fileTreeAppearance'
import { createSearchPages } from '../services/searchPages'
import type { TagCatalogFrame } from '../services/tagCatalogPages'
import TagEditDialog from './TagEditDialog.vue'

interface Note { path: string; name: string; content: string; dirty: boolean; editable: boolean }
const props = defineProps<{ tags: { tag: string; count: number }[]; loading: boolean; error: string; catalog?: TagCatalogFrame | null; catalogMore?: boolean; catalogStale?: boolean; currentNote: Note | null; otherFileOpen: boolean; addTag: (tag: string) => void | Promise<void> }>()
const emit = defineEmits<{ refresh: []; 'continue-catalog': []; open: [path: string]; search: [tag: string]; browse: []; save: [] }>()
const store = useAppStore()
const preferences = computed(() => libraryNavigationPreferences(store.libraryPath))
const tagMenu = reactive({ show: false, x: 0, y: 0, tag: '' })
const tagMenuOptions = computed(() => [
  { label: preferences.value.pinnedTags.includes(tagMenu.tag) ? '取消固定标签' : '固定常用标签', key: 'pin' },
  { label: '按名称排序', key: 'name' }, { label: '按笔记数量排序', key: 'count' },
])
const openTagMenu = (event: MouseEvent, tag: string) => Object.assign(tagMenu, { show: true, x: event.clientX, y: event.clientY, tag })
const tagMenuAction = (key: string) => {
  tagMenu.show = false
  if (key === 'pin') {
    const tags = preferences.value.pinnedTags
    updateLibraryNavigation(store.libraryPath, { pinnedTags: tags.includes(tagMenu.tag) ? tags.filter(tag => tag !== tagMenu.tag) : [...tags, tagMenu.tag] })
  } else if (key === 'name' || key === 'count') updateLibraryNavigation(store.libraryPath, { tagSort: key })
}
const filter = ref(''), selectedTag = ref(''), newTag = ref(''), addingOpen = ref(false), adding = ref(false)
const addError = ref(''), notice = ref(''), selecting = ref(false), selectedPaths = ref<string[]>([]), editingTags = ref(false)
const lookup = createSearchPages(invoke)
const { files: results, busy: running, error: resultError, status: pageState, retainingView: retaining, nextPage, canContinue } = lookup
const tagInput = ref<HTMLInputElement>()
const noteTags = computed(() => inlineTags(props.currentNote?.content || ''))
const filteredTags = computed(() => {
  const query = filter.value.trim().replace(/^#+/, '').toLowerCase(), pref = preferences.value
  const entries: { tag: string; count: number | null }[] = [...props.tags, ...pref.pinnedTags.filter(tag => !props.tags.some(entry => entry.tag === tag)).map(tag => ({ tag, count: props.catalog?.scanComplete && !props.catalogStale ? 0 : null }))]
  return entries.filter(entry => entry.tag.toLowerCase().includes(query)).sort((a, b) => Number(pref.pinnedTags.includes(b.tag)) - Number(pref.pinnedTags.includes(a.tag)) || (pref.tagSort === 'count' ? (b.count || 0) - (a.count || 0) : 0) || a.tag.localeCompare(b.tag, 'zh-CN', { numeric: true }))
})
const resultPath = (path: string) => searchResultPath(path, store.libraryPath)
const noteIconColor = computed(() => store.displayPreferences.fileIconStyle === 'muted' ? 'var(--theme-text-secondary)' : resolveFileTreeVisual('markdown').color)
let generation = 0, disposed = false
async function selectTag(tag: string) {
  ++generation
  const preserve = tag === selectedTag.value, depth = preserve ? results.value.length : 0
  if (!preserve) { selectedPaths.value = []; selecting.value = false }
  selectedTag.value = tag
  await lookup.start({ libraryRoot: store.libraryPath, query: '', sort: 'name', channel: 'collection', kind: 'collection', objectTypes: ['markdown'], filters: { directory: '', tag, modifiedWithinDays: null } }, { preserve, loadUntil: depth })
}
const back = () => { ++generation; selectedTag.value = ''; lookup.reset(); selectedPaths.value = []; selecting.value = false }
const refresh = () => { emit('refresh'); if (selectedTag.value) void selectTag(selectedTag.value) }
const toggleAdd = async () => { addingOpen.value = !addingOpen.value; addError.value = ''; notice.value = ''; if (addingOpen.value) { await nextTick(); tagInput.value?.focus() } }
async function add() {
  if (!props.currentNote?.editable || adding.value) return
  const path = props.currentNote.path
  adding.value = true; addError.value = ''; notice.value = ''
  try {
    const tag = normalizeInlineTag(newTag.value)
    await props.addTag(tag)
    if (disposed || props.currentNote?.path !== path) return
    newTag.value = ''; addingOpen.value = false; notice.value = `已添加 #${tag}，保存笔记后生效。`
  } catch (error) { if (!disposed && props.currentNote?.path === path) addError.value = String(error).replace(/^Error:\s*/, '') }
  finally { adding.value = false }
}
watch(() => props.currentNote?.path, () => { newTag.value = ''; addingOpen.value = false; addError.value = ''; notice.value = '' })
watch(newTag, () => { addError.value = '' })
watch(() => props.currentNote?.dirty, (dirty, wasDirty) => { if (wasDirty && dirty === false) { notice.value = ''; if (selectedTag.value) void selectTag(selectedTag.value) } })
watch(() => store.libraryPath, () => { back(); filter.value = ''; newTag.value = ''; addingOpen.value = false; addError.value = ''; notice.value = '' }, { flush: 'sync' })
onBeforeUnmount(() => { disposed = true; ++generation; lookup.dispose() })
</script>

<style scoped>
.inline-tags { padding: 14px 12px 20px; min-width: 0; box-sizing: border-box; color: var(--theme-text); font-size: var(--text-sm); }

h3 { font-size: 15px; margin: 0; line-height: 1.45; overflow-wrap: anywhere; }p { font-size: var(--text-compact); line-height: 1.6; color: var(--theme-text-secondary); overflow-wrap: anywhere; }
button, input { box-sizing: border-box; min-width: 0; max-width: 100%; font: inherit; color: var(--theme-text); border: 1px solid var(--workspace-border-color); border-radius: var(--theme-radius-sm); background: var(--theme-surface); }
button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 9px; min-height: 32px; cursor: pointer; transition: background var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard); }button:hover { background: rgba(var(--theme-primary-rgb), .08); border-color: rgba(var(--theme-primary-rgb), .35); }button:disabled { opacity: .5; cursor: default; }
input { width: 100%; padding: 7px 9px; min-height: 34px; }input::placeholder { color: var(--theme-text-secondary); font-size: var(--text-compact); }button:focus-visible, input:focus, summary:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }
svg { width: 16px; height: 16px; flex-shrink: 0; }.icon-button { width: 28px; min-height: 28px; padding: 0; border: 0; background: transparent; color: var(--theme-text-secondary); }
.section-label { display: flex; align-items: center; gap: 7px; color: var(--theme-text-secondary); font-size: var(--text-compact); }.section-label small { color: var(--theme-primary); padding: 1px 5px; background: rgba(var(--theme-primary-rgb), .08); border-radius: var(--theme-radius-sm); }.library-label { margin: 12px 0 7px; }.library-label .icon-button { margin-left: auto; }
.current-note { padding: 11px; border: var(--theme-border); border-radius: var(--theme-radius); background: var(--theme-surface); }.draft-state { flex-shrink: 0; margin-left: auto; font-size: var(--text-compact); color: var(--theme-text-secondary); }.note-name { display: flex; gap: 7px; align-items: center; margin: 0 0 8px; min-width: 0; }.note-name svg { color: var(--theme-primary); }.note-name strong { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-sm); }
.note-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }.note-tags button { padding: 3px 7px; min-height: 25px; font-size: var(--text-compact); color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), .06); overflow-wrap: anywhere; }.note-empty { margin: 0 0 10px; font-size: 11px; }.note-actions { display: flex; flex-wrap: wrap; gap: 6px; }.note-actions button { font-size: var(--text-compact); padding: 5px 7px; }
.tag-form { display: grid; gap: 9px; margin-top: 12px; padding-top: 12px; border-top: var(--theme-border); }label { display: grid; gap: 7px; font-size: var(--text-compact); }.add-hint { margin: 0; font-size: 11px; }.form-actions { display: flex; gap: 7px; flex-wrap: wrap; }.form-actions button { font-size: var(--text-compact); }.primary { background: var(--theme-primary); border-color: transparent; color: var(--workspace-on-accent, var(--theme-bg)); font-weight: 600; }.primary:hover { background: color-mix(in srgb, var(--theme-primary) 88%, var(--theme-text)); }
.tag-notice { display: flex; align-items: start; gap: 5px; margin: 10px 0 0; color: var(--theme-primary); }.local-error { margin: 10px 0 0; color: var(--theme-text); }.note-guide { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; font-size: var(--text-compact); line-height: 1.6; color: var(--theme-text-secondary); }.note-guide button { padding: 0; min-height: 24px; border: 0; color: var(--theme-primary); background: transparent; font-size: inherit; }
.tag-filter { display: flex; align-items: center; gap: 6px; padding: 0 8px; border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); margin-bottom: 10px; }.tag-filter > svg { color: var(--theme-text-secondary); width: 14px; }.tag-filter input { border: 0; background: transparent; padding-inline: 0; font-size: var(--text-compact); }.tag-filter:focus-within { outline: 2px solid var(--theme-primary); outline-offset: 2px; }.tag-filter input:focus { outline: none; }
.all-tags { display: grid; gap: 6px; }.tag-item { justify-content: start; width: 100%; gap: 8px; padding: 9px; text-align: left; border: var(--file-row-border); border-radius: var(--theme-radius-sm); background: var(--file-row-bg, var(--theme-surface)); box-shadow: var(--file-row-shadow); min-height: var(--file-row-height); }.tag-symbol { display: grid; place-items: center; width: 25px; height: 25px; flex-shrink: 0; border-radius: var(--theme-radius-sm); color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), .08); font-size: 16px; font-weight: 650; }.tag-item strong { min-width: 0; flex: 1; overflow-wrap: anywhere; font-size: var(--text-sm); }.tag-item small { white-space: nowrap; color: var(--theme-text-secondary); font-size: 11px; }.tag-item > svg { width: 12px; color: var(--theme-text-secondary); }
.empty-label { margin: 8px 0; }.empty-tags { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 12px 8px; border: var(--theme-border); border-radius: var(--theme-radius); background: var(--theme-surface); }.empty-tags strong { font-size: var(--text-sm); }.empty-tags p { margin: 0; }.empty-tags button { font-size: var(--text-compact); }
.back-button { border: 0; background: transparent; padding: 0; color: var(--theme-text-secondary); margin: 12px 0 8px; font-size: var(--text-compact); min-height: 24px; }.selected-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }.selected-heading > div { flex: 1; min-width: 0; }.tag-results { display: grid; gap: 6px; margin-top: 9px; }.tag-note { width: 100%; justify-content: start; align-items: start; gap: 8px; padding: 10px 8px; text-align: left; border: var(--file-row-border); background: var(--file-row-bg, var(--theme-surface)); border-radius: var(--theme-radius-sm); box-shadow: var(--file-row-shadow); min-height: var(--file-row-height); }.tag-note > svg { margin-top: 2px; }.tag-note > span { min-width: 0; flex: 1; display: grid; gap: 5px; }.tag-note strong { font-size: var(--text-sm); overflow-wrap: anywhere; }.tag-note small { color: var(--theme-text-secondary); font-size: var(--text-compact); overflow-wrap: anywhere; }.tag-note > svg:last-child { width: 12px; color: var(--theme-text-secondary); }.file-search { margin-top: 12px; width: 100%; justify-content: start; border: 0; padding: 4px 0; background: transparent; color: var(--theme-primary); font-size: var(--text-compact); }.file-search > svg:last-child { margin-left: auto; width: 12px; }
.loading-state { display: flex; align-items: start; gap: 6px; }.tag-error { margin: 10px 0; padding: 10px; border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); }.tag-error p { margin: 0 0 9px; }.tag-error button { font-size: var(--text-compact); }.tag-error details { margin-top: 9px; color: var(--theme-text-secondary); font-size: 11px; }pre { font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 120px; overflow: auto; }
summary { cursor: pointer; }
.spinning { animation: tag-spin 1s linear infinite; }@keyframes tag-spin { to { transform: rotate(360deg); } }@media (prefers-reduced-motion: reduce) { .spinning { animation: none; } }:global(body[data-motion="reduced"]) .spinning { animation: none; }
.tag-file-row { display: flex; gap: 7px; align-items: start; }.tag-file-row > input { margin-top: 13px; width: 16px; min-height: 16px; flex-shrink: 0; }.tag-file-row > .tag-note { flex: 1; min-width: 0; }.section-label { flex-wrap: wrap; }
</style>
