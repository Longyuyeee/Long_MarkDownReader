<template>
  <section ref="panel" class="smart-collection" aria-label="智能集合条件">
    <template v-if="mode === 'home'">
      <div class="collection-home-actions"><button class="primary" @click="beginNew"><Plus />新建集合</button><n-dropdown trigger="click" :options="transferOptions" @select="action => openTransfer(String(action))"><button class="icon-button" aria-label="集合管理"><Ellipsis /></button></n-dropdown></div>
      <div v-if="currentQuery" class="current-search"><span>当前搜索：{{ currentQuery }}</span><button @click="$emit('save-search')"><BookmarkPlus />保存这个搜索</button></div>
      <button v-if="hasDraft" class="resume-draft" @click="mode = 'editor'"><PencilLine /><span>继续设置 {{ name || '未命名集合' }}</span></button>
      <div class="section-label"><strong>我的集合</strong><small>{{ collections.length }}</small></div>
      <p v-if="!collections.length" class="empty-label">暂无集合</p>
      <div v-else class="collection-list">
        <div v-for="entry in orderedCollections" :key="entry.id" class="collection-card" draggable="true" @dragstart="dragCollection = entry.id" @dragover.prevent @drop.prevent="moveCollection(dragCollection, entry.id)" @dragend="dragCollection = ''">
          <button class="collection-open" @click="$emit('select', entry)"><component :is="entry.graphRoot ? Network : entry.filters ? FolderSearch : Search" /><span><strong>{{ entry.name }}</strong><small>{{ summaryFor(entry) }}</small></span><ChevronRight /></button>
          <n-dropdown trigger="click" :options="entryOptions(entry)" @select="action => collectionAction(String(action), entry)"><button class="icon-button" :aria-label="`集合操作 ${entry.name}`"><Ellipsis /></button></n-dropdown>
        </div>
      </div>
      <div class="section-label"><strong>常用条件</strong></div>
      <div class="collection-presets">
        <button @click="preset('recent')"><Clock />最近更新</button>
        <button @click="preset('notes')"><NotebookPen />全部笔记</button>
        <button @click="preset('tag')"><Tag />按标签查找</button>
      </div>
    </template>

    <template v-else>
      <header class="detail-heading"><button class="icon-button back-button" aria-label="我的集合" @click="goHome"><ArrowLeft /></button><h2>{{ mode === 'editor' ? editingId ? '调整集合' : '新建集合' : name || '查找结果' }}</h2></header>
      <form v-if="mode === 'editor'" class="collection-form" @submit.prevent="run">
        <label>集合名称<input ref="nameInput" v-model="name" :disabled="saving" maxlength="80" placeholder="例如：本周项目资料" /></label>
        <label>关键词（可不填）<input v-model="query" :disabled="saving" maxlength="500" placeholder="例如：周会，查找文件名和正文" /></label>
        <details class="collection-range" :open="advanced" @toggle="advanced = ($event.target as HTMLDetailsElement).open">
          <summary><SlidersHorizontal /><span>进一步筛选<small>{{ conditionSummary }}</small></span><ChevronDown /></summary>
          <fieldset :disabled="saving">
            <label>文件夹<div class="directory-field"><input v-model="directory" aria-label="文件夹" maxlength="4096" placeholder="整个资料库" /><button type="button" :disabled="choosing" aria-label="选择文件夹" @click="chooseDirectory"><FolderOpen /></button></div></label>
            <label>文件类型<n-select v-model:value="objectTypes" multiple clearable :max-tag-count="1" :disabled="saving" :options="formatOptions" placeholder="不限类型" size="small" /></label>
            <label>笔记标签<div class="tag-field"><span>#</span><input ref="tagInput" v-model="tag" aria-label="笔记标签" maxlength="640" placeholder="多个标签用空格分隔，同时满足" /></div></label>
            <label>修改时间<select v-model="days" aria-label="修改时间"><option :value="null">不限</option><option :value="7">最近 7 天</option><option :value="30">最近 30 天</option><option :value="90">最近 90 天</option></select></label>
          </fieldset>
        </details>
        <div class="actions"><button class="primary" type="submit" :disabled="running || saving"><Search />{{ running ? '正在查找…' : '查看资料' }}</button><button type="button" :disabled="saving || running || !name.trim()" @click="save"><BookmarkPlus />{{ saving ? '正在保存…' : editingId ? '保存修改' : '保存集合' }}</button></div>
        <button v-if="editingId" type="button" class="new-another" :disabled="saving" @click="beginNew"><Plus />新建其他集合</button>
      </form>
      <template v-else>
        <div class="condition-chips"><span v-if="query.trim()">包含「{{ query.trim() }}」</span><span>{{ conditionSummary }}</span></div>
        <div class="result-actions"><button :disabled="running || saving" @click="run"><RefreshCw :class="{ spinning: running }" />刷新</button><button :disabled="saving" @click="mode = 'editor'; advanced = Boolean(directory || tag || days || objectTypes.length)"><SlidersHorizontal />调整条件</button><button v-if="!editingId" class="primary" :disabled="running || saving" @click="save"><BookmarkPlus />保存集合</button></div>
      </template>
      <p v-if="notice" class="collection-notice" role="status"><Check />{{ notice }}</p>
      <div v-if="error" class="collection-error" role="alert"><p>{{ error }}</p><button v-if="errorKind === 'run'" :disabled="running" @click="run"><RefreshCw />再试一次</button><details><summary>错误详情</summary><pre>{{ errorDetails }}</pre></details></div>
      <div v-if="mode === 'results'" class="results">
        <p v-if="running" class="result-waiting" role="status"><RefreshCw class="spinning" />正在查找匹配的资料…</p>
        <p v-if="lookupError" class="collection-error" role="alert">{{ lookupError }}<button :disabled="running" @click="run">重新查找</button><span v-if="directory">文件夹可能已移动或删除，请从“调整条件”重新选择；原集合仍保留。</span></p>
        <template v-if="searched || results.length">
          <div class="section-label"><strong>匹配资料</strong><small>已加载 {{ results.length }}<template v-if="pageState?.totalFiles != null && !retaining"> / {{ pageState.totalFiles }}</template> 个文件</small><select v-model="resultSort" :disabled="running" aria-label="集合结果排序" @change="run"><option value="name">名称排序</option><option value="path">路径排序</option><option value="modified">修改时间排序</option><option value="relevance">相关度排序</option></select></div>
          <p v-if="retaining" class="result-limit" role="status">保留上次结果，尚未更新；旧续载位置已停用。</p>
          <p v-else-if="pageState && !pageState.scanComplete" class="result-limit">尚未查全，当前数量仅代表已加载文件。{{ pageState.warnings?.join('；') }}</p>
          <div v-if="!results.length && pageState?.scanComplete && !lookupError" class="empty-collections"><Search /><strong>还没有匹配的资料</strong><p>换个关键词，或放宽筛选条件试试。</p><button @click="mode = 'editor'">调整条件</button></div>
          <article v-for="(result, i) in sortedResults" :key="`${result.path}-${i}`" class="collection-result">
            <button class="result-open" @click="$emit('open', result)"><component :is="resultVisual(result).icon" :style="{ color: resultVisual(result).color }" /><span><strong>{{ result.title }}</strong><small>{{ formatLabel(result.objectType) }}<template v-if="result.locationLabel"> · {{ result.locationLabel }}</template><template v-else-if="result.page"> · 第 {{ result.page }} 页</template></small><span v-if="result.context && result.context !== '符合集合条件'" class="result-excerpt">{{ result.context }}</span></span><ChevronRight /></button>
            <details class="result-details"><summary>{{ relativeResultPath(result) }} · {{ files[i]?.matches.length || 1 }} 个匹配位置</summary><button v-for="(match, n) in files[i]?.matches" :key="n" class="match-location" @click="$emit('open', match)">{{ match.locationLabel || (match.page ? `第 ${match.page} 页` : match.context || '打开文件') }}</button><small>{{ result.path }}</small><small v-if="result.extractionFailed">正文暂未解析</small></details>
          </article>
          <button v-if="nextPage" class="load-more" :disabled="running" @click="lookup.loadMore()">加载更多文件</button>
          <button v-if="canContinue" class="load-more" :disabled="running" @click="lookup.continueSearch()">继续查找</button>
        </template>
      </div>
    </template>
    <CollectionTransferDialog v-if="transferMode" :mode="transferMode" :entries="transferEntries" :formats="formats" @close="transferMode = null" @completed="transferCompleted" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, onBeforeUnmount, onMounted } from 'vue'
import { NDropdown, NSelect, useMessage } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { ArrowLeft, BookmarkPlus, Check, ChevronDown, ChevronRight, Clock, Ellipsis, FolderOpen, FolderSearch, Network, NotebookPen, PencilLine, Plus, RefreshCw, Search, SlidersHorizontal, Tag } from 'lucide-vue-next'
import { useAppStore, type SavedSearchConfig } from '../store/app'
import { resolveFileTreeVisual } from '../config/fileTreeAppearance'
import { sameWorkspacePath, toCollectionRelativePath } from '../utils/savedCollections'
import { searchResultPath } from '../utils/searchResultPath'
import { libraryNavigationPreferences, updateLibraryNavigation, splitFilterTags } from '../services/libraryNavigationPreferences'
import { createSearchPages, type CollectionSort } from '../services/searchPages'
import { rememberCollectionDraft, readCollectionDraft, type CollectionDraft } from '../services/collectionDrafts'
import CollectionTransferDialog from './CollectionTransferDialog.vue'
interface Result {
  title: string; path: string; objectType: string; matchKind: 'title' | 'body' | 'ocr' | 'annotation' | 'related' | 'tag' | 'slide-title' | 'object' | 'notes'
  context: string; page?: number; annotationId?: string; locatorKind?: string; locatorObjectId?: string; locationLabel?: string; score: number; extractionFailed: boolean
}
const props = withDefaults(defineProps<{ selected: SavedSearchConfig | null; editing?: boolean; formats: { label: string; value: string }[]; collections: SavedSearchConfig[]; currentQuery?: string; summaryFor: (entry: SavedSearchConfig) => string }>(), { editing: false, currentQuery: '' })
const emit = defineEmits<{ open: [result: Result]; select: [entry: SavedSearchConfig]; edit: [entry: SavedSearchConfig]; remove: [entry: SavedSearchConfig]; saved: [entry: SavedSearchConfig]; reset: []; 'save-search': [] }>()
const store = useAppStore()
const message = useMessage(), transferMode = ref<'import' | 'export' | null>(null), transferEntries = ref<SavedSearchConfig[]>([])
const transferOptions = computed(() => [{ label: '导入集合条件…', key: 'import' }, { label: '导出本资料库集合…', key: 'export', disabled: !props.collections.length }])
const openTransfer = (mode: string, entry?: SavedSearchConfig) => { if (mode !== 'import' && mode !== 'export') return; transferEntries.value = entry ? [entry] : [...props.collections]; transferMode.value = mode }
const transferCompleted = (notice: string) => { transferMode.value = null; message.success(notice) }
const panel = ref<HTMLElement>(), resultSort = ref<CollectionSort>('name'), dragCollection = ref('')
const lookup = createSearchPages(invoke)
const { files, busy: running, status: pageState, error: lookupError, retainingView: retaining, nextPage, canContinue } = lookup
const preferences = computed(() => libraryNavigationPreferences(store.libraryPath))
const orderedCollections = computed(() => [...props.collections].sort((a, b) => {
  const order = preferences.value.collectionOrder
  const rank = (id: string) => order.includes(id) ? order.indexOf(id) : order.length
  return rank(a.id) - rank(b.id)
}))
const results = computed(() => files.value.map(file => file.matches[0]))
const sortedResults = results
const moveCollection = (id: string, target?: string) => {
  if (!target) return
  const order = orderedCollections.value.map(entry => entry.id), from = order.indexOf(id), to = order.indexOf(target)
  if (from < 0 || to < 0 || from === to) return
  order.splice(from, 1); order.splice(to, 0, id)
  updateLibraryNavigation(store.libraryPath, { collectionOrder: order })
}
const scrollParent = () => panel.value?.parentElement
const rememberView = () => {
  if (previousRoot && previousRoot !== store.libraryPath) return
  if (!editingId.value || mode.value !== 'results' || running.value) return
  updateLibraryNavigation(store.libraryPath, { resultViews: { ...preferences.value.resultViews, [editingId.value]: { sort: resultSort.value, scroll: scrollParent()?.scrollTop || 0 } } })
}
let viewTimer: ReturnType<typeof setTimeout> | undefined
const rememberScroll = () => { clearTimeout(viewTimer); viewTimer = setTimeout(rememberView, 150) }
onMounted(() => scrollParent()?.addEventListener('scroll', rememberScroll, { passive: true }))
const mode = ref<'home' | 'editor' | 'results'>('home'), advanced = ref(false)
const name = ref(''), query = ref(''), directory = ref(''), tag = ref(''), editingId = ref('')
const objectTypes = ref<string[]>([]), days = ref<number | null>(null)
const saving = ref(false), choosing = ref(false), searched = ref(false)
const error = ref(''), errorDetails = ref(''), errorKind = ref(''), notice = ref('')
const nameInput = ref<HTMLInputElement>(), tagInput = ref<HTMLInputElement>()
const filters = () => { const tags = splitFilterTags(tag.value); return { directory: directory.value.trim(), tag: tags[0] || '', ...(tags.length > 1 ? { tags: tags.slice(1) } : {}), modifiedWithinDays: days.value } }
const fingerprint = () => JSON.stringify({ name: name.value.trim(), query: query.value.trim(), objectTypes: [...objectTypes.value].sort(), filters: filters() })
const baseline = ref(fingerprint())
const hasDraft = computed(() => fingerprint() !== baseline.value)
const conditionSummary = computed(() => [directory.value.trim() || '整个资料库', objectTypes.value.length ? `${objectTypes.value.length} 种类型` : '', ...splitFilterTags(tag.value).map(value => '#' + value), days.value ? `最近 ${days.value} 天` : ''].filter(Boolean).join(' · '))
const formatLabel = (type: string) => type === 'markdown' ? '笔记' : props.formats.find(format => format.value === type)?.label || type
const formatOptions = computed(() => props.formats.map(format => ({ ...format, disabled: objectTypes.value.length >= 8 && !objectTypes.value.includes(format.value) })))
const relativeResultPath = (result: Result) => searchResultPath(result.path, store.libraryPath)
const resultVisual = (result: Result) => { const visual = resolveFileTreeVisual(result.objectType); return { ...visual, color: store.displayPreferences.fileIconStyle === 'muted' ? 'var(--theme-text-secondary)' : visual.color } }
const entryOptions = (entry: SavedSearchConfig) => [{ label: '打开集合', key: 'open' }, ...(!entry.graphRoot ? [{ label: '修改条件', key: 'edit' }] : []), { label: '导出这个集合…', key: 'export' }, { label: '移到最前', key: 'first' }, { label: '删除集合', key: 'remove' }]
const collectionAction = (action: string, entry: SavedSearchConfig) => { if (action === 'open') emit('select', entry); else if (action === 'edit') emit('edit', entry); else if (action === 'remove') emit('remove', entry); else if (action === 'first') moveCollection(entry.id, orderedCollections.value[0]?.id); else if (action === 'export') openTransfer('export', entry) }
let generation = 0, previousRoot = '', disposed = false, resultKey = ''
const preserveDraft = (root = previousRoot || store.libraryPath) => rememberCollectionDraft(root, hasDraft.value ? { id: editingId.value, name: name.value, query: query.value, directory: directory.value, tag: tag.value, days: days.value, objectTypes: [...objectTypes.value], baseline: baseline.value, advanced: advanced.value } : null, editingId.value)
const restoreDraft = (draft: CollectionDraft) => { editingId.value = draft.id; name.value = draft.name; query.value = draft.query; directory.value = draft.directory; tag.value = draft.tag; days.value = draft.days; objectTypes.value = draft.objectTypes; baseline.value = draft.baseline; advanced.value = draft.advanced }
const invalidate = () => { generation++; lookup.reset(); resultKey = ''; searched.value = false; error.value = ''; errorDetails.value = ''; notice.value = '' }
watch([query, directory, tag, days, objectTypes], invalidate, { deep: true, flush: 'sync' })
watch(name, () => { notice.value = '' })
const resetFields = () => { invalidate(); editingId.value = ''; name.value = ''; query.value = ''; directory.value = ''; tag.value = ''; days.value = null; objectTypes.value = []; advanced.value = false; baseline.value = fingerprint() }
const goHome = () => { preserveDraft(); mode.value = 'home'; emit('reset') }
const beginNew = async () => { preserveDraft(); resetFields(); mode.value = 'editor'; emit('reset'); await nextTick(); nameInput.value?.focus() }
const preset = async (kind: string) => {
  await beginNew()
  if (kind === 'recent') { name.value = '最近更新'; days.value = 7; resultSort.value = 'modified'; void run() }
  else if (kind === 'notes') { name.value = '全部笔记'; objectTypes.value = ['markdown']; void run() }
  else { name.value = '标签笔记'; advanced.value = true; await nextTick(); tagInput.value?.focus() }
}
const fail = (message: string, cause: unknown, kind: string) => { error.value = message; errorDetails.value = String(cause); errorKind.value = kind }
async function run() {
  if (running.value || saving.value) return
  mode.value = 'results'; error.value = ''; notice.value = ''
  const token = generation, root = store.libraryPath
  const key = JSON.stringify({ root, query: query.value, types: objectTypes.value, filters: filters(), sort: resultSort.value })
  const preserve = resultKey === key && files.value.length > 0
  const top = preserve ? scrollParent()?.scrollTop || 0 : preferences.value.resultViews[editingId.value]?.scroll || 0
  const depth = preserve ? files.value.length : 0
  resultKey = key
  await lookup.start({ libraryRoot: root, query: query.value, sort: resultSort.value, kind: 'collection', channel: 'collection', objectTypes: [...objectTypes.value], filters: filters() }, { preserve, loadUntil: depth })
  if (!disposed && generation === token && root === store.libraryPath) {
    searched.value = true
    await nextTick()
    if (scrollParent()) scrollParent()!.scrollTop = Math.max(0, top)
  }
}
async function save() {
  if (saving.value || running.value) return
  if (!name.value.trim()) { mode.value = 'editor'; await nextTick(); nameInput.value?.focus(); return }
  const root = store.libraryPath, token = generation, draftId = editingId.value
  saving.value = true; error.value = ''; notice.value = ''
  try {
    const entry = await store.saveSmartCollection({ id: editingId.value || undefined, name: name.value, query: query.value, objectTypes: [...objectTypes.value], filters: filters() })
    if (disposed || store.libraryPath !== root || generation !== token) return
    editingId.value = entry.id; name.value = entry.name; query.value = entry.query; directory.value = entry.filters?.directory || ''; tag.value = [entry.filters?.tag, ...(entry.filters?.tags || [])].filter(Boolean).join(' ')
    baseline.value = fingerprint(); mode.value = 'results'; saving.value = false
    rememberCollectionDraft(root, null, draftId)
    emit('saved', entry)
    const lookup = run(), shownGeneration = generation
    void lookup.then(() => { if (!disposed && store.libraryPath === root && editingId.value === entry.id && generation === shownGeneration) notice.value = '集合已保存，下次从“我的集合”打开。' })
  } catch (cause) { if (!disposed && store.libraryPath === root && generation === token) fail('集合没有保存成功，设置已保留。', cause, 'save') }
  finally { saving.value = false }
}
const chooseDirectory = async () => {
  if (choosing.value || saving.value) return
  const root = store.libraryPath, token = generation
  choosing.value = true
  try {
    const path = await open({ directory: true, multiple: false, defaultPath: root, title: '选择要查找的文件夹' })
    if (typeof path !== 'string' || disposed || root !== store.libraryPath || token !== generation) return
    directory.value = sameWorkspacePath(root, path) ? '' : toCollectionRelativePath(root, path)
  } catch (cause) { if (!disposed && root === store.libraryPath && token === generation) fail('请选择当前资料库里的文件夹。', cause, 'directory') }
  finally { choosing.value = false }
}
watch(() => [props.selected, props.editing, store.libraryPath] as const, ([selected]) => {
  rememberView()
  if (store.libraryPath !== previousRoot) { if (previousRoot) preserveDraft(previousRoot); previousRoot = store.libraryPath; resetFields(); mode.value = 'home' }
  if (!selected || selected.libraryPath !== store.libraryPath || selected.graphRoot) { const draft = readCollectionDraft(store.libraryPath, ''); if (draft && !hasDraft.value) restoreDraft(draft); return }
  if (selected.id === editingId.value && hasDraft.value) { if (props.editing) mode.value = 'editor'; return }
  if (selected.id === editingId.value && mode.value === 'results' && !props.editing && selected.name === name.value && selected.query === query.value && JSON.stringify(selected.filters || { directory: '', tag: '', modifiedWithinDays: null }) === JSON.stringify(filters()) && JSON.stringify([...selected.objectTypes].sort()) === JSON.stringify([...objectTypes.value].sort())) return
  preserveDraft(); resetFields(); editingId.value = selected.id; name.value = selected.name; query.value = selected.query; objectTypes.value = [...selected.objectTypes]
  directory.value = selected.filters?.directory || ''; tag.value = [selected.filters?.tag, ...(selected.filters?.tags || [])].filter(Boolean).join(' '); days.value = selected.filters?.modifiedWithinDays ?? null
  baseline.value = fingerprint(); advanced.value = Boolean(directory.value || tag.value || days.value || objectTypes.value.length)
  resultSort.value = preferences.value.resultViews[selected.id]?.sort || 'name'
  const draft = readCollectionDraft(store.libraryPath, selected.id)
  if (draft) { restoreDraft(draft); mode.value = 'editor'; return }
  mode.value = props.editing ? 'editor' : 'results'
  if (!props.editing) void run()
}, { immediate: true })
watch(() => props.collections, entries => { if (editingId.value && !entries.some(entry => entry.id === editingId.value)) { resetFields(); mode.value = 'home'; emit('reset') } })
onBeforeUnmount(() => { clearTimeout(viewTimer); rememberView(); preserveDraft(); scrollParent()?.removeEventListener('scroll', rememberScroll); disposed = true; lookup.dispose() })
</script>

<style scoped>
.smart-collection { padding: 14px 12px 20px; min-width: 0; box-sizing: border-box; color: var(--theme-text); font-size: var(--text-sm); }
.collection-home-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.detail-heading { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }

h2 { font-size: 15px; margin: 0; line-height: 1.4; overflow-wrap: anywhere; }
p { color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.6; overflow-wrap: anywhere; }

button, input, select { box-sizing: border-box; min-width: 0; max-width: 100%; font: inherit; color: var(--theme-text); border: 1px solid var(--workspace-border-color); border-radius: var(--theme-radius-sm); background: var(--theme-surface); }
button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 9px; min-height: 32px; cursor: pointer; transition: background var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard); }
button:hover { background: rgba(var(--theme-primary-rgb), .08); border-color: rgba(var(--theme-primary-rgb), .35); }
button:disabled { opacity: .5; cursor: default; }
input, select { width: 100%; padding: 7px 9px; font-size: var(--text-sm); min-height: 34px; }
input::placeholder { color: var(--theme-text-secondary); font-size: var(--text-compact); }
button:focus-visible, input:focus, select:focus, summary:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }
.primary { background: var(--theme-primary); border-color: transparent; color: var(--workspace-on-accent, var(--theme-bg)); font-weight: 600; }
.primary:hover { background: color-mix(in srgb, var(--theme-primary) 88%, var(--theme-text)); }

svg { width: 16px; height: 16px; flex-shrink: 0; }
.section-label { display: flex; align-items: center; gap: 7px; margin: 12px 0 7px; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.section-label small { color: var(--theme-primary); padding: 1px 5px; background: rgba(var(--theme-primary-rgb), .08); border-radius: var(--theme-radius-sm); }
.section-label select { margin-left: auto; width: auto; min-height: 26px; font-size: var(--text-compact); padding: 2px 5px; }
.empty-label { margin: 8px 0; }.empty-collections { padding: 12px 8px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; background: var(--theme-surface); border: var(--theme-border); border-radius: var(--theme-radius); }

.empty-collections strong { font-size: var(--text-sm); }.empty-collections p { margin: 0; }
.collection-presets { display: flex; flex-wrap: wrap; gap: 6px; }.collection-presets button { gap: 5px; padding: 5px 7px; font-size: var(--text-compact); }
.collection-presets button > svg:first-child { color: var(--theme-primary); }

.collection-list { display: grid; gap: 6px; }.collection-card { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) 28px; align-items: center; padding: 5px 4px; background: var(--file-row-bg, var(--theme-surface)); border: var(--file-row-border); border-radius: var(--theme-radius-sm); box-shadow: var(--file-row-shadow); }
.collection-open { width: 100%; min-width: 0; display: flex; justify-content: start; gap: 8px; border: 0; text-align: left; background: transparent; padding: 6px; min-height: var(--file-row-height); }
.collection-open > span { display: grid; gap: 4px; flex: 1; min-width: 0; }.collection-open > svg:first-child { color: var(--theme-primary); }.collection-open > svg:last-child { width: 12px; color: var(--theme-text-secondary); }
.collection-open strong { font-size: var(--text-sm); }.collection-open strong, .collection-open small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.collection-open small { font-size: var(--text-compact); color: var(--theme-text-secondary); }
.icon-button { width: 26px; min-height: 28px; padding: 0; border: 0; background: transparent; }
.current-search, .resume-draft { margin-top: 10px; padding: 9px; border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); }.current-search { display: grid; gap: 7px; }.current-search > span { color: var(--theme-text-secondary); font-size: var(--text-compact); overflow-wrap: anywhere; }.resume-draft { width: 100%; text-align: left; justify-content: start; color: var(--theme-primary); }.resume-draft span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }

summary { cursor: pointer; }.back-button { margin-bottom: 0; min-height: 24px; padding: 0; border: 0; background: transparent; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.collection-form, label { display: grid; min-width: 0; }.collection-form { gap: 14px; }label { gap: 7px; font-size: var(--text-compact); }label > small { color: var(--theme-text-secondary); font-size: 11px; }
.collection-range { padding: 10px; border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); }.collection-range > summary { display: flex; align-items: center; gap: 7px; }.collection-range > summary > span { flex: 1; min-width: 0; }.collection-range summary small { display: block; margin-top: 5px; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.4; overflow-wrap: anywhere; }.collection-range > summary > svg:first-child { color: var(--theme-primary); }.collection-range[open] > summary > svg:last-child { transform: rotate(180deg); }
fieldset { display: grid; gap: 12px; padding: 14px 0 0; border: 0; margin: 0; min-width: 0; }.directory-field { display: grid; grid-template-columns: minmax(0, 1fr) 32px; gap: 5px; }.directory-field button { padding: 0; }
.tag-field { display: flex; align-items: center; gap: 7px; }.tag-field > span { color: var(--theme-primary); }.tag-field input { flex: 1; min-width: 0; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }.actions button { padding: 6px; font-size: var(--text-compact); }.new-another { justify-self: start; font-size: var(--text-compact); border: 0; background: transparent; color: var(--theme-text-secondary); }
.condition-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }.condition-chips span { font-size: 11px; line-height: 1.5; padding: 4px 7px; border-radius: var(--theme-radius-sm); background: rgba(var(--theme-primary-rgb), .07); color: var(--theme-text-secondary); overflow-wrap: anywhere; }
.result-actions { display: flex; flex-wrap: wrap; gap: 6px; }.result-actions button { font-size: var(--text-compact); padding: 5px 7px; }
.collection-notice, .result-waiting { display: flex; align-items: start; gap: 6px; }.collection-notice { color: var(--theme-primary); }.collection-error { margin: 12px 0; padding: 10px; border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); }.collection-error p { margin-top: 0; }.collection-error details { margin-top: 9px; font-size: 11px; color: var(--theme-text-secondary); }pre { font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 120px; overflow: auto; }
.result-limit { font-size: 11px; }.collection-result { margin-bottom: 8px; background: var(--file-row-bg, var(--theme-surface)); border: var(--file-row-border); border-radius: var(--theme-radius-sm); box-shadow: var(--file-row-shadow); }
.result-open { justify-content: start; align-items: start; gap: 8px; padding: 10px 7px; width: 100%; border: 0; background: transparent; text-align: left; min-height: var(--file-row-height); }.result-open > svg { margin-top: 2px; }.result-open > span { flex: 1; min-width: 0; display: grid; gap: 5px; }.result-open strong { overflow-wrap: anywhere; font-size: var(--text-sm); line-height: 1.5; }.result-open small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.result-open > svg:last-child { width: 12px; color: var(--theme-text-secondary); }.result-excerpt { color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.5; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.result-details { padding: 0 8px 8px 31px; color: var(--theme-text-secondary); font-size: var(--text-compact); }.result-details summary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.result-details p { font-size: var(--text-compact); }.result-details small { display: block; overflow-wrap: anywhere; line-height: 1.5; }
.spinning { animation: collection-spin 1s linear infinite; }@keyframes collection-spin { to { transform: rotate(360deg); } }@media (prefers-reduced-motion: reduce) { .spinning { animation: none; } }:global(body[data-motion="reduced"]) .spinning { animation: none; }
.section-label { flex-wrap: wrap; }.load-more { width: 100%; margin: 8px 0; }.match-location { display: block; margin: 5px 0; text-align: left; overflow-wrap: anywhere; }.collection-error > span { display: block; margin-top: 8px; }
</style>
