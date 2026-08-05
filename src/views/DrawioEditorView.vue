<template>
  <div class="drawio-workspace">
    <WorkspaceTabs v-if="!store.isZen && store.tabs.length" />
    <header class="toolbar">
      <div class="identity">
        <n-button quaternary circle size="small" title="返回知识库" @click="router.push({ name: 'LibraryMode' })">
          <template #icon><n-icon :component="ArrowLeftIcon" /></template>
        </n-button>
        <n-icon :component="WorkflowIcon" size="21" class="accent" />
        <div>
          <strong :title="documentPath">{{ fileName }}</strong>
          <span>{{ statusLabel }}</span>
        </div>
      </div>
      <div class="actions">
        <n-button quaternary circle size="small" title="撤销" :disabled="loading || applying || !undoStack.length" @click="undo">
          <template #icon><n-icon :component="UndoIcon" /></template>
        </n-button>
        <n-button quaternary circle size="small" title="重做" :disabled="loading || applying || !redoStack.length" @click="redo">
          <template #icon><n-icon :component="RedoIcon" /></template>
        </n-button>
        <n-button quaternary circle size="small" title="重新读取" :disabled="loading" @click="reloadFromDisk">
          <template #icon><n-icon :component="RefreshIcon" /></template>
        </n-button>
        <n-button type="primary" size="small" :loading="saving" :disabled="loading || saving || !dirty || !analysis?.valid" @click="save">
          <template #icon><n-icon :component="SaveIcon" /></template>
          {{ dirty ? '保存' : '已保存' }}
        </n-button>
      </div>
    </header>

    <main class="stage">
      <div v-if="loading" class="state"><n-spin size="small" /><strong>正在读取 Draw.io 文件</strong></div>
      <div v-else-if="loadError" class="state error">
        <n-icon :component="AlertIcon" size="26" />
        <strong>无法打开 Draw.io 文件</strong>
        <p>{{ loadError }}</p>
        <n-button size="small" @click="load(true)">重试</n-button>
      </div>
      <template v-else>
        <aside class="pages-pane">
          <div class="pane-heading"><strong>页面</strong><span>{{ analysis?.pageCount || 0 }}</span></div>
          <button
            v-for="page in analysis?.pages"
            :key="page.id"
            type="button"
            :class="{ active: page.id === activePageId }"
            @click="selectPage(page.id)"
          >
            <n-icon :component="FileIcon" />
            <span><strong>{{ page.name }}</strong><small>{{ page.vertexCount }} 节点 · {{ page.edgeCount }} 连线</small></span>
            <em v-if="page.compressed">ZIP</em>
          </button>
          <div class="resource-summary">
            <n-icon :component="ShieldIcon" />
            <span>外链 {{ analysis?.externalLinkCount || 0 }}<br />外部图片 {{ analysis?.externalImageCount || 0 }}</span>
          </div>
        </aside>

        <section class="canvas-pane">
          <div class="canvas-toolbar">
            <strong>{{ activePage?.name || 'Draw.io' }}</strong>
            <span>{{ activePage?.width.toFixed(0) }} × {{ activePage?.height.toFixed(0) }}</span>
          </div>
          <div ref="canvasScrollRef" class="canvas-scroll" @scroll.passive="rememberDrawioViewState()">
            <svg
              v-if="activePage"
              class="diagram-canvas"
              :viewBox="`0 0 ${activePage.width} ${activePage.height}`"
              role="img"
              :aria-label="`${activePage.name} Draw.io 页面预览`"
              @click.self="selectedCellId = ''"
            >
              <defs>
                <pattern id="drawio-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" stroke-width="0.5" />
                </pattern>
                <marker id="drawio-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
                </marker>
              </defs>
              <rect :width="activePage.width" :height="activePage.height" class="grid" />
              <line
                v-for="edge in renderedEdges"
                :key="edge.id"
                :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
                class="edge" marker-end="url(#drawio-arrow)"
              />
              <g
                v-for="cell in renderedVertices"
                :key="cell.id"
                class="cell"
                :class="{ selected: cell.id === selectedCellId }"
                role="button"
                tabindex="0"
                @click.stop="selectCell(cell.id)"
                @keydown.enter.prevent="selectCell(cell.id)"
              >
                <rect
                  :x="cell.x" :y="cell.y" :width="cell.width" :height="cell.height"
                  :fill="safeColor(cell.fillColor, '#ffffff')" :stroke="safeColor(cell.strokeColor, '#64748b')"
                />
                <text
                  :x="cell.x + cell.width / 2" :y="cell.y + cell.height / 2"
                  text-anchor="middle" dominant-baseline="middle"
                >{{ displayLabel(cell.label) }}</text>
              </g>
            </svg>
            <div v-else class="empty-state">当前文件没有可显示的页面</div>
          </div>
          <div v-if="analysis?.diagnostics.length" class="diagnostic-strip">
            <n-icon :component="analysis.valid ? ShieldIcon : AlertIcon" />
            <span>{{ analysis.diagnostics[0].message }}</span>
            <em>{{ analysis.diagnostics.length }} 项诊断</em>
          </div>
        </section>

        <aside class="inspector-pane">
          <div class="pane-heading"><strong>单元格</strong><span>{{ editableCells.length }}</span></div>
          <n-input v-model:value="cellQuery" clearable size="small" placeholder="筛选节点">
            <template #prefix><n-icon :component="SearchIcon" /></template>
          </n-input>
          <div class="cell-list">
            <button
              v-for="cell in filteredCells"
              :key="cell.id"
              type="button"
              :class="{ active: cell.id === selectedCellId }"
              @click="selectCell(cell.id)"
            >
              <n-icon :component="BoxIcon" />
              <span><strong>{{ displayLabel(cell.label) || cell.id }}</strong><small>{{ cell.id }}</small></span>
            </button>
          </div>

          <form v-if="selectedCell" class="properties" @submit.prevent="applyPatch">
            <label>标签<n-input v-model:value="form.label" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" maxlength="1000" show-count /></label>
            <div class="geometry-grid">
              <label>X<n-input-number v-model:value="form.x" :show-button="false" /></label>
              <label>Y<n-input-number v-model:value="form.y" :show-button="false" /></label>
              <label>宽<n-input-number v-model:value="form.width" :show-button="false" :min="1" /></label>
              <label>高<n-input-number v-model:value="form.height" :show-button="false" :min="1" /></label>
            </div>
            <div class="color-grid">
              <label>填充<input v-model="form.fillColor" type="color" /></label>
              <label>描边<input v-model="form.strokeColor" type="color" /></label>
            </div>
            <small v-if="selectedCell.unknownAttributeCount">保留 {{ selectedCell.unknownAttributeCount }} 个未知属性</small>
            <n-button attr-type="submit" type="primary" size="small" :loading="applying">应用修改</n-button>
          </form>
          <div v-else class="empty-inspector">选择一个节点以编辑标签、几何和颜色。</div>
        </aside>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useMessage } from 'naive-ui'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import {
  AlertTriangle as AlertIcon, ArrowLeft as ArrowLeftIcon, Box as BoxIcon, File as FileIcon,
  Redo2 as RedoIcon, RefreshCw as RefreshIcon, Save as SaveIcon, Search as SearchIcon, ShieldCheck as ShieldIcon,
  Undo2 as UndoIcon,
  Workflow as WorkflowIcon,
} from 'lucide-vue-next'
import WorkspaceTabs from '../components/WorkspaceTabs.vue'
import { recallWorkspaceViewState, rememberWorkspaceViewState } from '../services/workspaceViewState'
import { useAppStore } from '../store/app'

interface Snapshot { content: string; encoding: string; signature: string; size: number; modified: number; readOnlyReason?: string }
interface Diagnostic { severity: string; code: string; message: string; pageId?: string; cellId?: string }
interface Cell {
  id: string; parent?: string; source?: string; target?: string; kind: string; label: string; style: string
  shape?: string; fillColor?: string; strokeColor?: string; x?: number; y?: number; width?: number; height?: number
  editable: boolean; unknownAttributeCount: number
}
interface Page {
  id: string; name: string; compressed: boolean; cellCount: number; vertexCount: number; edgeCount: number
  width: number; height: number; cells: Cell[]
}
interface Analysis {
  valid: boolean; pageCount: number; compressedPageCount: number; totalCellCount: number
  externalLinkCount: number; externalImageCount: number; pages: Page[]; diagnostics: Diagnostic[]
}
interface RenderedEdge { id: string; x1: number; y1: number; x2: number; y2: number }

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const message = useMessage()
const documentPath = computed(() => String(route.query.path || ''))
const fileName = computed(() => documentPath.value.split(/[\\/]/).pop() || '未命名.drawio')
const loading = ref(true)
const saving = ref(false)
const applying = ref(false)
const loadError = ref('')
const content = ref('')
const signature = ref('')
const dirty = ref(false)
const analysis = ref<Analysis | null>(null)
const activePageId = ref('')
const selectedCellId = ref('')
const cellQuery = ref('')
const canvasScrollRef = ref<HTMLElement>()
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const form = reactive({ label: '', x: 0, y: 0, width: 120, height: 60, fillColor: '#ffffff', strokeColor: '#64748b' })

const activePage = computed(() => analysis.value?.pages.find(page => page.id === activePageId.value) || analysis.value?.pages[0])
const editableCells = computed(() => activePage.value?.cells.filter(cell => cell.editable) || [])
const filteredCells = computed(() => {
  const needle = cellQuery.value.trim().toLocaleLowerCase()
  return editableCells.value.filter(cell => !needle || `${cell.id} ${displayLabel(cell.label)}`.toLocaleLowerCase().includes(needle)).slice(0, 500)
})
const selectedCell = computed(() => editableCells.value.find(cell => cell.id === selectedCellId.value))
const renderedVertices = computed(() => editableCells.value
  .filter(cell => [cell.x, cell.y, cell.width, cell.height].every(value => typeof value === 'number'))
  .map(cell => ({ ...cell, x: cell.x!, y: cell.y!, width: cell.width!, height: cell.height! })))
const renderedEdges = computed<RenderedEdge[]>(() => {
  const byId = new Map(renderedVertices.value.map(cell => [cell.id, cell]))
  return (activePage.value?.cells || []).filter(cell => cell.kind === 'edge').flatMap(edge => {
    const source = edge.source ? byId.get(edge.source) : undefined
    const target = edge.target ? byId.get(edge.target) : undefined
    if (!source || !target) return []
    return [{
      id: edge.id,
      x1: source.x + source.width / 2, y1: source.y + source.height / 2,
      x2: target.x + target.width / 2, y2: target.y + target.height / 2,
    }]
  })
})
const statusLabel = computed(() => {
  if (loading.value) return '读取中'
  if (!analysis.value?.valid) return '安全检查未通过'
  return dirty.value ? '有未保存修改' : `${analysis.value.pageCount} 页 · 已保存`
})

const displayLabel = (value: string) => {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = value.replace(/<[^>]*>/g, ' ')
  return textarea.value.trim().slice(0, 80)
}
const safeColor = (value: string | undefined, fallback: string) => /^#[0-9a-f]{6}$/i.test(value || '') ? value! : fallback
const errorText = (cause: unknown) => {
  const error = cause as { message?: string; suggestion?: string }
  return [error?.message || String(cause).replace(/^Error:\s*/, ''), error?.suggestion].filter(Boolean).join(' · ')
}
const syncTab = () => {
  const tab = store.tabs.find(item => item.path === documentPath.value)
  if (!tab) return
  tab.content = content.value
  tab.isDirty = dirty.value
  tab.textSignature = signature.value
}
const registerTab = () => {
  store.addTab({ id: documentPath.value, title: fileName.value, path: documentPath.value, isDirty: dirty.value })
  syncTab()
}
const analyze = async (source: string) => {
  const result = await invoke<Analysis>('analyze_drawio_source', { content: source })
  analysis.value = result
  if (!result.pages.some(page => page.id === activePageId.value)) activePageId.value = result.pages[0]?.id || ''
  if (!editableCells.value.some(cell => cell.id === selectedCellId.value)) selectedCellId.value = editableCells.value[0]?.id || ''
  return result
}
const rememberDrawioViewState = (path = documentPath.value) => {
  if (!path || loading.value) return
  rememberWorkspaceViewState(path, {
    scrollTop: canvasScrollRef.value?.scrollTop || 0,
    scrollLeft: canvasScrollRef.value?.scrollLeft || 0,
    section: activePageId.value,
    selection: selectedCellId.value,
  })
}
const restoreDrawioViewState = async () => {
  const viewState = recallWorkspaceViewState(documentPath.value)
  if (viewState?.section && analysis.value?.pages.some(page => page.id === viewState.section)) activePageId.value = viewState.section
  if (viewState?.selection && editableCells.value.some(cell => cell.id === viewState.selection)) selectedCellId.value = viewState.selection
  if (!viewState) return
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  canvasScrollRef.value?.scrollTo({ top: viewState.scrollTop, left: viewState.scrollLeft })
}
const load = async (discardDraft = false) => {
  loading.value = true
  loadError.value = ''
  undoStack.value = []
  redoStack.value = []
  try {
    if (!documentPath.value.toLocaleLowerCase().match(/\.(drawio|dio)$/)) throw new Error('当前路径不是已注册的 Draw.io 文件')
    const draft = store.tabs.find(item => item.path === documentPath.value)
    if (!discardDraft && draft?.isDirty && typeof draft.content === 'string') {
      content.value = draft.content
      signature.value = draft.textSignature || ''
      dirty.value = true
      await analyze(content.value)
      await restoreDrawioViewState()
      store.activateTab(draft.id)
      return
    }
    const snapshot = await invoke<Snapshot>('read_text_document', {
      libraryRoot: store.libraryPath, path: documentPath.value, formatId: 'drawio', readOptions: undefined,
    })
    if (snapshot.readOnlyReason) throw new Error(snapshot.readOnlyReason)
    content.value = snapshot.content
    signature.value = snapshot.signature
    dirty.value = false
    await analyze(content.value)
    await restoreDrawioViewState()
    registerTab()
  } catch (error) {
    loadError.value = errorText(error)
  } finally {
    loading.value = false
  }
}
const reloadFromDisk = () => {
  if (dirty.value && !window.confirm('重新读取会丢弃当前 Draw.io 内存草稿，确定继续吗？')) return
  void load(true)
}
const selectPage = (id: string) => {
  activePageId.value = id
  selectedCellId.value = editableCells.value[0]?.id || ''
}
const selectCell = (id: string) => { selectedCellId.value = id }
const applyPatch = async () => {
  if (!selectedCell.value || !activePage.value) return
  applying.value = true
  try {
    const output = await invoke<string>('transform_drawio_cell_source', {
      content: content.value,
      patch: {
        pageId: activePage.value.id, cellId: selectedCell.value.id, label: form.label,
        x: form.x, y: form.y, width: form.width, height: form.height,
        fillColor: form.fillColor, strokeColor: form.strokeColor,
      },
    })
    if (output !== content.value) {
      undoStack.value.push(content.value)
      if (undoStack.value.length > 80) undoStack.value.shift()
      redoStack.value = []
    }
    content.value = output
    dirty.value = true
    await analyze(output)
    syncTab()
    message.success('单元格修改已应用')
  } catch (error) {
    message.error(`无法应用修改：${errorText(error)}`)
  } finally {
    applying.value = false
  }
}
const restoreHistory = async (value: string) => {
  content.value = value
  dirty.value = true
  await analyze(value)
  syncTab()
}
const undo = async () => {
  const previous = undoStack.value.pop()
  if (previous === undefined) return
  redoStack.value.push(content.value)
  await restoreHistory(previous)
}
const redo = async () => {
  const next = redoStack.value.pop()
  if (next === undefined) return
  undoStack.value.push(content.value)
  await restoreHistory(next)
}
const save = async () => {
  if (!dirty.value || !analysis.value?.valid) return
  saving.value = true
  try {
    const snapshot = await invoke<Snapshot>('write_drawio_source_document', {
      libraryRoot: store.libraryPath, path: documentPath.value, content: content.value, expectedSignature: signature.value,
    })
    content.value = snapshot.content
    signature.value = snapshot.signature
    dirty.value = false
    await analyze(content.value)
    syncTab()
    message.success('Draw.io 文件已保存并重新校验')
  } catch (error) {
    message.error(`保存失败：${errorText(error)}`)
  } finally {
    saving.value = false
  }
}

watch(selectedCell, cell => {
  if (!cell) return
  form.label = cell.label
  form.x = cell.x ?? 0
  form.y = cell.y ?? 0
  form.width = cell.width ?? 120
  form.height = cell.height ?? 60
  form.fillColor = safeColor(cell.fillColor, '#ffffff')
  form.strokeColor = safeColor(cell.strokeColor, '#64748b')
}, { immediate: true })
watch(documentPath, () => void load())
watch([activePageId, selectedCellId], () => rememberDrawioViewState())
const handleKeydown = (event: KeyboardEvent) => {
  const command = event.ctrlKey || event.metaKey
  if (!command) return
  if (event.key.toLowerCase() === 's') { event.preventDefault(); void save(); return }
  if ((event.target as HTMLElement | null)?.matches('textarea,input,[contenteditable="true"]')) return
  if (event.key.toLowerCase() === 'z') { event.preventDefault(); void (event.shiftKey ? redo() : undo()) }
  else if (event.key.toLowerCase() === 'y') { event.preventDefault(); void redo() }
}
const mayLeave = () => !dirty.value || window.confirm('Draw.io 还有未保存修改，确定离开吗？磁盘文件不会改变，草稿仍保留在当前标签中。')
const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onBeforeRouteLeave(() => mayLeave())
onBeforeRouteUpdate((to, from) => to.query.path === from.query.path || mayLeave())
onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('beforeunload', beforeUnload)
  void load()
})
onBeforeUnmount(() => {
  rememberDrawioViewState()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<style scoped>
.drawio-workspace { height: 100%; min-height: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr); color: var(--theme-text); background: var(--theme-bg); container-type: inline-size; }
.toolbar { min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 14px; border-bottom: var(--theme-border); background: var(--theme-surface); }
.identity,.actions { display: flex; align-items: center; gap: 8px; min-width: 0; }
.identity>div { min-width: 0; display: grid; gap: 2px; }
.identity strong,.identity span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.identity strong { font-size: 12px; }.identity span { color: var(--theme-text-secondary); font-size: var(--text-compact); }.accent { color: var(--theme-primary); }
.stage { min-height: 0; display: grid; grid-template-columns: 190px minmax(320px, 1fr) 280px; overflow: hidden; }
.state { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 30px; text-align: center; }
.state p { max-width: 620px; margin: 0; color: var(--theme-text-secondary); }.state.error { color: #c2414a; }
.pages-pane,.inspector-pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; padding: 10px; background: var(--theme-surface); overflow: hidden; }
.pages-pane { border-right: var(--theme-border); }.inspector-pane { border-left: var(--theme-border); }
.pane-heading,.canvas-toolbar { min-height: 30px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pane-heading strong,.canvas-toolbar strong { font-size: 11px; }.pane-heading span,.canvas-toolbar span { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.pages-pane>button,.cell-list button { width: 100%; min-height: 48px; display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 7px 8px; border: 1px solid transparent; border-radius: 5px; color: inherit; background: transparent; text-align: left; cursor: pointer; }
.pages-pane>button:hover,.cell-list button:hover,.pages-pane>button.active,.cell-list button.active { border-color: rgba(var(--theme-primary-rgb), .35); background: rgba(var(--theme-primary-rgb), .08); }
.pages-pane button span,.cell-list button span { min-width: 0; display: grid; gap: 2px; }.pages-pane button strong,.pages-pane button small,.cell-list strong,.cell-list small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pages-pane button strong,.cell-list strong { font-size: var(--text-compact); }.pages-pane button small,.cell-list small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.pages-pane button em { font-size: var(--text-compact); font-style: normal; }
.resource-summary { margin-top: auto; display: flex; align-items: center; gap: 8px; padding: 9px; border-top: var(--theme-border); color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.6; }
.canvas-pane { min-width: 0; min-height: 0; display: grid; grid-template-rows: 40px minmax(0, 1fr) auto; overflow: hidden; }
.canvas-toolbar { padding: 0 12px; border-bottom: var(--theme-border); }
.canvas-scroll { min-height: 0; overflow: auto; padding: 18px; background: var(--theme-bg-secondary); }
.diagram-canvas { display: block; width: max(100%, 760px); min-height: 520px; aspect-ratio: 4 / 3; color: #64748b; background: #fff; box-shadow: 0 1px 5px rgba(15,23,42,.16); }
.grid { fill: url(#drawio-grid); color: #e2e8f0; }.edge { color: #64748b; stroke: currentColor; stroke-width: 2; }
.cell { cursor: pointer; outline: none; }.cell rect { stroke-width: 2; rx: 2; }.cell text { max-width: 100%; font-size: 13px; fill: #172033; pointer-events: none; letter-spacing: 0; }.cell.selected rect { stroke: #2563eb; stroke-width: 4; }
.diagnostic-strip { min-height: 36px; display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: 7px; padding: 6px 12px; border-top: var(--theme-border); color: var(--theme-text-secondary); font-size: var(--text-compact); }
.diagnostic-strip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.diagnostic-strip em { font-style: normal; }
.cell-list { min-height: 80px; max-height: 190px; overflow-y: auto; }.properties { min-height: 0; display: grid; gap: 10px; padding-top: 10px; border-top: var(--theme-border); overflow-y: auto; }
.properties label { display: grid; gap: 5px; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.geometry-grid,.color-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.color-grid input { width: 100%; height: 30px; padding: 2px; border: var(--theme-border); border-radius: 4px; background: var(--theme-surface); cursor: pointer; }
.properties>small,.empty-inspector,.empty-state { color: var(--theme-text-secondary); font-size: var(--text-compact); }.empty-inspector { padding: 16px 4px; line-height: 1.6; }.empty-state { display: grid; place-items: center; height: 100%; }
@media (max-width: 980px) { .stage { grid-template-columns: 150px minmax(300px, 1fr) 230px; }.diagram-canvas { width: 700px; } }
@media (max-width: 760px) { .stage { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(420px, 1fr) auto; overflow-y: auto; }.pages-pane { max-height: 150px; border-right: 0; border-bottom: var(--theme-border); }.inspector-pane { min-height: 330px; border-left: 0; border-top: var(--theme-border); }.canvas-pane { min-height: 480px; }.toolbar { align-items: flex-start; }.identity { max-width: 58%; }.actions .n-button { min-width: 32px; } }
@container (max-width: 980px) { .stage { grid-template-columns: 150px minmax(300px, 1fr) 230px; }.diagram-canvas { width: 700px; } }
@container (max-width: 760px) { .stage { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(420px, 1fr) auto; overflow-y: auto; }.pages-pane { max-height: 150px; border-right: 0; border-bottom: var(--theme-border); }.inspector-pane { min-height: 330px; border-left: 0; border-top: var(--theme-border); }.canvas-pane { min-height: 480px; }.toolbar { align-items: flex-start; }.identity { max-width: 58%; }.actions .n-button { min-width: 32px; } }
</style>
