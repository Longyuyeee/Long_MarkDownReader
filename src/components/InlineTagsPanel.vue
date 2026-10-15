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
      <div v-if="filteredTags.length" class="all-tags"><button v-for="entry in filteredTags" :key="entry.tag" class="tag-item" @click="selectTag(entry.tag)"><span class="tag-symbol">#</span><strong>{{ entry.tag }}</strong><small>{{ entry.count }} 篇</small><ChevronRight /></button></div>
      <p v-else-if="!loading && !error" class="empty-label">{{ filter.trim() ? '没有找到这个标签' : '暂无已保存的标签' }}</p>
    </template>

    <template v-else>
      <button class="back-button" @click="back"><ArrowLeft />全部标签</button>
      <div class="selected-heading"><span class="tag-symbol">#</span><div><h3>{{ selectedTag }}</h3></div><button class="icon-button" aria-label="刷新标签笔记" :disabled="loading || running" @click="refresh"><RefreshCw :class="{ spinning: running }" /></button></div>
      <div v-if="resultError" class="tag-error" role="alert"><p>暂时没能读取相关笔记，请重试。</p><button @click="selectTag(selectedTag)"><RefreshCw />重试</button><details><summary>错误详情</summary><pre>{{ resultError }}</pre></details></div>
      <p v-else-if="running" class="loading-state" role="status"><RefreshCw class="spinning" />正在查找笔记…</p>
      <template v-else>
        <div class="section-label"><strong>相关笔记</strong><small>{{ results.length }} 篇</small></div>
        <div v-if="!results.length" class="empty-tags"><strong>还没有保存的匹配笔记</strong><p>刚添加的标签需保存笔记后刷新。</p></div>
        <div v-else class="tag-results"><button v-for="file in results" :key="file.path" class="tag-note" @click="$emit('open', file.path)"><NotebookPen :style="{ color: noteIconColor }" /><span><strong>{{ file.name }}</strong><small>{{ resultPath(file.path) }}</small></span><ChevronRight /></button></div>
        <button class="file-search" @click="$emit('search', selectedTag)"><Search />在文件搜索中查看<ChevronRight /></button>
      </template>
    </template>

  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { ArrowLeft, Check, ChevronRight, NotebookPen, Plus, RefreshCw, Save, Search, X } from 'lucide-vue-next'
import { useAppStore } from '../store/app'
import { inlineTags, normalizeInlineTag } from '../utils/inlineTags'
import { searchResultPath } from '../utils/searchResultPath'
import { resolveFileTreeVisual } from '../config/fileTreeAppearance'

interface Note { path: string; name: string; content: string; dirty: boolean; editable: boolean }
interface TagFile { path: string; name: string; is_dir: boolean }
const props = defineProps<{ tags: { tag: string; count: number }[]; loading: boolean; error: string; currentNote: Note | null; otherFileOpen: boolean; addTag: (tag: string) => void | Promise<void> }>()
const emit = defineEmits<{ refresh: []; open: [path: string]; search: [tag: string]; browse: []; save: [] }>()
const store = useAppStore()
const filter = ref(''), selectedTag = ref(''), newTag = ref(''), addingOpen = ref(false), adding = ref(false)
const addError = ref(''), notice = ref(''), resultError = ref(''), running = ref(false), results = ref<TagFile[]>([])
const tagInput = ref<HTMLInputElement>()
const noteTags = computed(() => inlineTags(props.currentNote?.content || ''))
const filteredTags = computed(() => { const query = filter.value.trim().replace(/^#+/, '').toLowerCase(); return props.tags.filter(entry => entry.tag.toLowerCase().includes(query)) })
const resultPath = (path: string) => searchResultPath(path, store.libraryPath)
const noteIconColor = computed(() => store.displayPreferences.fileIconStyle === 'muted' ? 'var(--theme-text-secondary)' : resolveFileTreeVisual('markdown').color)
let generation = 0, disposed = false
async function selectTag(tag: string) {
  const token = ++generation, root = store.libraryPath
  selectedTag.value = tag; results.value = []; resultError.value = ''; running.value = true
  try {
    const files = await invoke<TagFile[]>('search_by_tag', { libraryRoot: root, tag })
    if (disposed || generation !== token || root !== store.libraryPath) return
    results.value = files
  } catch (error) { if (!disposed && generation === token && root === store.libraryPath) resultError.value = String(error) }
  finally { if (generation === token) running.value = false }
}
const back = () => { ++generation; selectedTag.value = ''; running.value = false; results.value = []; resultError.value = '' }
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
onBeforeUnmount(() => { disposed = true; ++generation })
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
</style>
