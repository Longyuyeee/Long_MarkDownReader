<template>
  <div class="diagram-studio" tabindex="-1" @keydown="handleKeydown">
    <WorkspaceToolbar class="studio-toolbar">
      <WorkspaceFileIdentity class="studio-title">
        <button title="返回知识库" @click="router.push('/library')">←</button>
        <div><strong>{{ fileName }}</strong><span>Mermaid 图表工作室 · {{ lineCount }} 行</span></div>
      </WorkspaceFileIdentity>
      <div class="studio-actions" data-command-strip data-horizontal-wheel="always">
        <label>模板
          <select v-model="selectedTemplate" @change="applySelectedTemplate">
            <option value="">选择模板…</option>
            <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}</option>
          </select>
        </label>
        <label>主题
          <select v-model="diagramTheme" @change="scheduleRender(true)">
            <option value="default">默认</option><option value="neutral">中性</option><option value="forest">森林</option><option value="dark">深色</option>
          </select>
        </label>
        <button title="缩小" @click="zoom = Math.max(.5, zoom - .1)">−</button>
        <button class="zoom-value" title="恢复 100%" @click="zoom = 1">{{ Math.round(zoom * 100) }}%</button>
        <button title="放大" @click="zoom = Math.min(2, zoom + .1)">＋</button>
        <button class="history-button" title="撤销" :disabled="!undoStack.length" @click="undo"><UndoIcon :size="15" /></button>
        <button class="history-button" title="重做" :disabled="!redoStack.length" @click="redo"><RedoIcon :size="15" /></button>
        <button @click="scheduleRender(true)">刷新预览</button>
        <button class="structure-toggle" :class="{ active: showStructure }" :aria-pressed="showStructure" @click="showStructure = !showStructure">结构</button>
        <button class="export-toggle" :class="{ active: showExport }" :aria-pressed="showExport" :disabled="!svg" @click="showExport = !showExport">导出</button>
        <button class="save-button" :disabled="!dirty || saving || !!parseError" aria-live="polite" @click="saveDiagram">{{ saving ? '保存中' : dirty ? '保存' : '已保存' }}</button>
      </div>
    </WorkspaceToolbar>

    <section v-if="showExport" class="export-panel" role="dialog" aria-label="导出图表">
      <header><div><strong>导出图表</strong><span>当前主题：{{ diagramTheme }}</span></div><button title="关闭" @click="showExport = false">×</button></header>
      <WorkspaceField>格式<select v-model="exportFormat"><option value="svg">SVG 矢量图</option><option value="png">PNG 位图</option></select></WorkspaceField>
      <WorkspaceField v-if="exportFormat === 'png'">倍率<select v-model.number="exportScale"><option :value="1">1×</option><option :value="2">2×</option><option :value="3">3×</option></select></WorkspaceField>
      <WorkspaceField>背景<select v-model="exportBackground"><option value="transparent">透明</option><option value="theme">当前主题背景</option><option value="white">白色</option></select></WorkspaceField>
      <p>SVG 保留矢量文字；PNG 最大边 8192 px、最多 3200 万像素。</p>
      <button class="export-confirm" :disabled="!exportReady || exporting" @click="exportDiagram">{{ exporting ? '导出中…' : exportReady ? `导出 ${exportFormat.toUpperCase()}` : '等待最新预览' }}</button>
    </section>

    <WorkspaceStateNotice v-if="loading" as="main" class="studio-state" kind="loading" tone="info" title="正在打开 Mermaid 图表" />
    <WorkspaceStateNotice v-else-if="loadError" as="main" class="studio-state" kind="error" tone="danger" title="无法打开图表"><p>{{ loadError }}</p><template #action><button @click="loadDiagram">重新加载</button></template></WorkspaceStateNotice>
    <main v-else class="studio-workspace" :class="{ 'with-inspector': showStructure }">
      <section class="source-panel">
        <header><strong>源码</strong><span>修改后自动预览</span></header>
        <div class="source-editor">
          <pre aria-hidden="true">{{ lineNumbers }}</pre>
          <textarea ref="sourceInput" v-model="source" spellcheck="false" aria-label="Mermaid 源码" @input="onSourceInput" @scroll="handleSourceScroll"></textarea>
        </div>
        <button v-if="parseError" class="parse-error" aria-live="assertive" @click="focusErrorLine">
          <strong>{{ errorLine ? `第 ${errorLine} 行` : '语法错误' }}</strong>
          <span>{{ parseError }}</span>
        </button>
        <WorkspaceStatusBar v-else><span class="valid-dot"></span>语法有效<span v-if="rendering"> · 正在渲染…</span><i>{{ notice }}</i></WorkspaceStatusBar>
      </section>

      <section class="preview-panel">
        <header><strong>实时预览</strong><span>严格安全模式 · 禁用图内点击</span></header>
        <div class="preview-scroll">
          <div v-if="rendering && !svg" class="preview-empty">正在生成图表…</div>
          <div v-else-if="parseError && !svg" class="preview-empty"><strong>修复语法后显示预览</strong><span>点击左下方错误可以定位到相关行。</span></div>
          <div v-else class="svg-stage" :style="{ transform: `scale(${zoom})` }" v-html="svg"></div>
        </div>
      </section>
      <aside v-if="showStructure" class="structure-panel">
        <header><div><strong>结构化编辑</strong><span v-if="structure.supported">{{ structure.nodes.length }} 节点 · {{ structure.edges.length }} 连线</span><span v-else>源码模式</span></div><button title="关闭" @click="showStructure = false">×</button></header>
        <WorkspaceStateNotice v-if="!structure.supported" class="structure-empty" kind="limited" tone="info" :title="`${structure.diagramType || '当前图表'} 暂不支持表单编辑`"><p>结构化表单当前只处理常用 flowchart / graph，源码和实时预览不会受影响。</p></WorkspaceStateNotice>
        <template v-else>
          <div v-if="structure.warnings.length" class="structure-warning">{{ structure.warnings.join(' ') }}</div>
          <nav class="structure-tabs"><button :class="{ active: structureTab === 'nodes' }" :aria-pressed="structureTab === 'nodes'" @click="structureTab = 'nodes'">节点</button><button :class="{ active: structureTab === 'edges' }" :aria-pressed="structureTab === 'edges'" @click="structureTab = 'edges'">连线</button></nav>
          <div class="structure-list">
            <button v-for="node in structureTab === 'nodes' ? structure.nodes : []" :key="node.id" :class="{ active: selectedKind === 'node' && selectedId === node.id }" @click="selectNode(node)"><strong>{{ node.label }}</strong><span>{{ node.id }} · 第 {{ node.line }} 行</span></button>
            <button v-for="edge in structureTab === 'edges' ? structure.edges : []" :key="edge.id" :class="{ active: selectedKind === 'edge' && selectedId === edge.id }" @click="selectEdge(edge)"><strong>{{ edge.source }} {{ edge.arrow }} {{ edge.target }}</strong><span>{{ edge.label || '无标签' }} · 第 {{ edge.line }} 行</span></button>
            <p v-if="structureTab === 'nodes' && !structure.nodes.length">未识别到带 ID 的节点。</p><p v-if="structureTab === 'edges' && !structure.edges.length">未识别到单段连线。</p>
          </div>
          <form v-if="selectedNode" class="property-form" @submit.prevent="applyStructureEdit">
            <header><strong>节点 {{ selectedNode.id }}</strong><span>第 {{ selectedNode.line }} 行</span></header>
            <label>文本<input v-model="draftLabel" :disabled="!selectedNode.editable" maxlength="500" /></label>
            <label>形状<select v-model="draftShape" :disabled="!selectedNode.editable"><option value="rectangle">矩形</option><option value="rounded">圆角</option><option value="diamond">判断</option><option value="circle">圆形</option><option value="subroutine">子程序</option><option value="hexagon">六边形</option></select></label>
            <p v-if="!selectedNode.editable">该节点只在连线中以裸 ID 出现。请先在源码中写成 `{{ selectedNode.id }}[文本]`，再使用表单编辑。</p>
            <button type="submit" :disabled="!selectedNode.editable || !draftLabel.trim()">应用到源码</button>
          </form>
          <form v-else-if="selectedEdge" class="property-form" @submit.prevent="applyStructureEdit">
            <header><strong>{{ selectedEdge.source }} → {{ selectedEdge.target }}</strong><span>第 {{ selectedEdge.line }} 行</span></header>
            <label>连线标签<input v-model="draftLabel" maxlength="500" placeholder="留空表示无标签" /></label>
            <p>只替换或插入当前连线标签，不改变箭头、节点定义和其他源码。</p>
            <button type="submit">应用到源码</button>
          </form>
          <div v-else class="property-placeholder">选择一个节点或连线进行编辑。</div>
        </template>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { Redo2 as RedoIcon, Undo2 as UndoIcon } from 'lucide-vue-next'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useAppStore } from '../store/app'
import WorkspaceField from '../components/workspace/WorkspaceField.vue'
import WorkspaceFileIdentity from '../components/workspace/WorkspaceFileIdentity.vue'
import WorkspaceStateNotice from '../components/workspace/WorkspaceStateNotice.vue'
import WorkspaceStatusBar from '../components/workspace/WorkspaceStatusBar.vue'
import WorkspaceToolbar from '../components/workspace/WorkspaceToolbar.vue'
import { recallWorkspaceViewState, rememberWorkspaceViewState } from '../services/workspaceViewState'
import { diagramSvgToPng, prepareDiagramSvg, type DiagramBackground } from '../utils/diagramExport'

interface DiagramDocument { path: string; content: string; signature: string }
type MermaidTheme = 'default' | 'neutral' | 'forest' | 'dark'
interface StructureNode { id: string; label: string; shape: string; line: number; editable: boolean }
interface StructureEdge { id: string; source: string; target: string; label: string; arrow: string; line: number }
interface DiagramStructure { supported: boolean; diagramType: string; nodes: StructureNode[]; edges: StructureEdge[]; warnings: string[] }

const templates = [
  { id: 'flowchart', name: '流程图', source: 'flowchart LR\n    A[收集需求] --> B{评审通过?}\n    B -->|是| C[开始实施]\n    B -->|否| D[补充信息]\n    D --> A\n' },
  { id: 'sequence', name: '时序图', source: 'sequenceDiagram\n    participant U as 用户\n    participant A as LongEdit\n    U->>A: 打开知识库\n    A-->>U: 返回索引结果\n' },
  { id: 'mindmap', name: '思维导图', source: 'mindmap\n  root((产品规划))\n    用户价值\n      本地优先\n      开放格式\n    核心能力\n      知识图谱\n      思维导图\n      资料管理\n' },
  { id: 'class', name: '类图', source: 'classDiagram\n    class KnowledgeObject {\n      +String id\n      +String type\n      +open()\n    }\n    KnowledgeObject <|-- MarkdownNote\n    KnowledgeObject <|-- PdfDocument\n' },
  { id: 'er', name: 'ER 图', source: 'erDiagram\n    DOCUMENT ||--o{ RELATION : contains\n    DOCUMENT {\n      string id PK\n      string title\n    }\n    RELATION {\n      string source FK\n      string target FK\n    }\n' },
  { id: 'gantt', name: '甘特图', source: 'gantt\n    title 交付计划\n    dateFormat YYYY-MM-DD\n    section 设计\n    需求评审 :done, d1, 2026-07-19, 2d\n    section 开发\n    核心实现 :active, d2, after d1, 4d\n    验收测试 :d3, after d2, 2d\n' },
]

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const message = useMessage()
const sourceInput = ref<HTMLTextAreaElement | null>(null)
const source = ref('')
const signature = ref('')
const svg = ref('')
const renderedSource = ref('')
const renderedTheme = ref<MermaidTheme>('default')
const loading = ref(true)
const saving = ref(false)
const rendering = ref(false)
const dirty = ref(false)
const loadError = ref('')
const parseError = ref('')
const errorLine = ref(0)
const notice = ref('')
const selectedTemplate = ref('')
const diagramTheme = ref<MermaidTheme>('default')
const zoom = ref(1)
const showStructure = ref(true)
const showExport = ref(false)
const exporting = ref(false)
const exportFormat = ref<'svg' | 'png'>('svg')
const exportScale = ref(2)
const exportBackground = ref<DiagramBackground>('transparent')
const structure = ref<DiagramStructure>({ supported: false, diagramType: '', nodes: [], edges: [], warnings: [] })
const structureTab = ref<'nodes' | 'edges'>('nodes')
const selectedKind = ref<'node' | 'edge'>('node')
const selectedId = ref('')
const draftLabel = ref('')
const draftShape = ref('rectangle')
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
let renderTimer = 0
let renderGeneration = 0
let loadGeneration = 0
let lastSourceValue = ''

const diagramPath = computed(() => String(route.query.path || ''))
const fileName = computed(() => diagramPath.value.split(/[\\/]/).pop() || 'Mermaid 图表')
const lineCount = computed(() => Math.max(1, source.value.split('\n').length))
const lineNumbers = computed(() => Array.from({ length: lineCount.value }, (_, index) => index + 1).join('\n'))
const selectedNode = computed(() => selectedKind.value === 'node' ? structure.value.nodes.find(node => node.id === selectedId.value) : undefined)
const selectedEdge = computed(() => selectedKind.value === 'edge' ? structure.value.edges.find(edge => edge.id === selectedId.value) : undefined)
const exportReady = computed(() => !!svg.value && !parseError.value && !rendering.value && renderedSource.value === source.value && renderedTheme.value === diagramTheme.value)

const syncGutter = (event: Event) => {
  const textarea = event.target as HTMLTextAreaElement
  const gutter = textarea.previousElementSibling as HTMLElement | null
  if (gutter) gutter.scrollTop = textarea.scrollTop
}
const parseFailure = (cause: unknown) => {
  const text = String(cause instanceof Error ? cause.message : cause).replace(/^Error:\s*/, '').trim()
  const match = text.match(/(?:line|第)\s*(\d+)/i)
  errorLine.value = match ? Number(match[1]) : 0
  parseError.value = text.split('\n').slice(0, 3).join(' ').slice(0, 600) || 'Mermaid 语法无法解析'
}
const analyzeStructure = async (content: string, generation: number) => {
  try {
    const result = await invoke<DiagramStructure>('analyze_diagram_source', { content })
    if (generation !== renderGeneration) return
    structure.value = result
    const selectedStillExists = selectedKind.value === 'node'
      ? result.nodes.some(node => node.id === selectedId.value)
      : result.edges.some(edge => edge.id === selectedId.value)
    if (selectedId.value && !selectedStillExists) selectedId.value = ''
  } catch {
    if (generation === renderGeneration) structure.value = { supported: false, diagramType: '', nodes: [], edges: [], warnings: [] }
  }
}
const renderDiagram = async () => {
  const generation = ++renderGeneration
  const current = source.value
  if (!current.trim()) { parseError.value = 'Mermaid 源码不能为空'; errorLine.value = 0; return }
  if (current.length > 200_000) { parseError.value = '实时预览最多解析 20 万字符'; errorLine.value = 0; return }
  rendering.value = true
  try {
    void analyzeStructure(current, generation)
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: diagramTheme.value,
      maxTextSize: 200_000,
      suppressErrorRendering: true,
      flowchart: { htmlLabels: false, useMaxWidth: true },
    })
    await mermaid.parse(current, { suppressErrors: false })
    const result = await mermaid.render(`longedit-diagram-${generation}`, current)
    if (generation !== renderGeneration) return
    svg.value = result.svg
    renderedSource.value = current
    renderedTheme.value = diagramTheme.value
    parseError.value = ''
    errorLine.value = 0
    notice.value = '预览已更新'
  } catch (cause) {
    if (generation === renderGeneration) parseFailure(cause)
  } finally {
    if (generation === renderGeneration) rendering.value = false
  }
}
const scheduleRender = (immediate = false) => {
  window.clearTimeout(renderTimer)
  renderTimer = window.setTimeout(renderDiagram, immediate ? 0 : 350)
}
const rememberSourceChange = (previous: string, next = source.value) => {
  if (previous === next) return
  undoStack.value.push(previous)
  if (undoStack.value.length > 100) undoStack.value.shift()
  redoStack.value = []
}
const rememberDiagramViewState = (path = diagramPath.value) => {
  if (!path || loading.value) return
  rememberWorkspaceViewState(path, {
    scrollTop: sourceInput.value?.scrollTop || 0,
    scrollLeft: sourceInput.value?.scrollLeft || 0,
    zoom: zoom.value,
    panelOpen: showStructure.value,
    sidebarTab: structureTab.value,
    mode: diagramTheme.value,
    selection: selectedId.value,
  })
}
const handleSourceScroll = (event: Event) => {
  syncGutter(event)
  rememberDiagramViewState()
}
const onSourceInput = () => {
  rememberSourceChange(lastSourceValue)
  lastSourceValue = source.value
  dirty.value = true
  notice.value = '有未保存修改'
  scheduleRender()
}
const replaceSource = (value: string, messageText: string) => {
  if (value === source.value) return
  rememberSourceChange(source.value, value)
  source.value = value
  lastSourceValue = value
  dirty.value = true
  notice.value = messageText
  scheduleRender(true)
}
const restoreHistory = (value: string) => {
  source.value = value
  lastSourceValue = value
  dirty.value = true
  notice.value = '已恢复历史版本，尚未保存'
  scheduleRender(true)
}
const undo = () => {
  const previous = undoStack.value.pop()
  if (previous === undefined) return
  redoStack.value.push(source.value)
  restoreHistory(previous)
}
const redo = () => {
  const next = redoStack.value.pop()
  if (next === undefined) return
  undoStack.value.push(source.value)
  restoreHistory(next)
}
const applySelectedTemplate = () => {
  const template = templates.find(item => item.id === selectedTemplate.value)
  selectedTemplate.value = ''
  if (!template || (dirty.value && !window.confirm(`使用“${template.name}”模板替换当前源码？`))) return
  replaceSource(template.source, `已应用${template.name}模板`)
}
const selectNode = (node: StructureNode) => {
  selectedKind.value = 'node'; selectedId.value = node.id; draftLabel.value = node.label
  draftShape.value = node.shape === 'implicit' ? 'rectangle' : node.shape
}
const selectEdge = (edge: StructureEdge) => { selectedKind.value = 'edge'; selectedId.value = edge.id; draftLabel.value = edge.label }
const applyStructureEdit = async () => {
  if (!selectedNode.value && !selectedEdge.value) return
  try {
    const output = await invoke<string>('update_diagram_element', {
      content: source.value,
      edit: {
        kind: selectedKind.value,
        id: selectedId.value,
        label: draftLabel.value.trim(),
        shape: selectedKind.value === 'node' ? draftShape.value : undefined,
      },
    })
    replaceSource(output, '结构修改已同步到源码')
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) }
}
const focusErrorLine = () => {
  const input = sourceInput.value
  if (!input) return
  const lines = source.value.split('\n')
  const line = Math.min(lines.length, Math.max(1, errorLine.value || 1))
  const start = lines.slice(0, line - 1).reduce((total, value) => total + value.length + 1, 0)
  input.focus()
  input.setSelectionRange(start, start + (lines[line - 1]?.length || 0))
  input.scrollTop = Math.max(0, (line - 3) * 22)
  syncGutter({ target: input } as unknown as Event)
}
const loadDiagram = async () => {
  const generation = ++loadGeneration
  loading.value = true
  loadError.value = ''
  try {
    if (!store.libraryPath || !/\.(?:mmd|mermaid)$/i.test(diagramPath.value)) throw new Error('Mermaid 路径无效或知识库尚未配置')
    const document = await invoke<DiagramDocument>('read_diagram_file', { libraryRoot: store.libraryPath, path: diagramPath.value })
    if (generation !== loadGeneration) return
    source.value = document.content
    lastSourceValue = document.content
    undoStack.value = []
    redoStack.value = []
    signature.value = document.signature
    dirty.value = false
    notice.value = '文件已加载'
    const viewState = recallWorkspaceViewState(diagramPath.value)
    if (viewState) {
      zoom.value = viewState.zoom || 1
      showStructure.value = viewState.panelOpen ?? true
      if (viewState.sidebarTab === 'nodes' || viewState.sidebarTab === 'edges') structureTab.value = viewState.sidebarTab
      if (['default', 'neutral', 'forest', 'dark'].includes(viewState.mode || '')) diagramTheme.value = viewState.mode as MermaidTheme
      selectedId.value = viewState.selection || ''
      await nextTick()
      if (sourceInput.value) {
        sourceInput.value.scrollTop = viewState.scrollTop
        sourceInput.value.scrollLeft = viewState.scrollLeft
      }
    }
    scheduleRender(true)
  } catch (cause) {
    if (generation === loadGeneration) loadError.value = String(cause).replace(/^Error:\s*/, '')
  } finally { if (generation === loadGeneration) loading.value = false }
}
const saveDiagram = async () => {
  if (!dirty.value || saving.value || parseError.value) return
  saving.value = true
  try {
    const document = await invoke<DiagramDocument>('write_diagram_file', {
      libraryRoot: store.libraryPath,
      path: diagramPath.value,
      content: source.value,
      expectedSignature: signature.value,
    })
    signature.value = document.signature
    dirty.value = false
    notice.value = '已可靠保存'
    window.dispatchEvent(new CustomEvent('longedit:diagram-saved', { detail: document.path }))
    message.success('Mermaid 图表已保存')
  } catch (cause) { message.error(String(cause).replace(/^Error:\s*/, '')) } finally { saving.value = false }
}
const exportDiagram = async () => {
  if (!exportReady.value || exporting.value) return
  exporting.value = true
  try {
    const prepared = prepareDiagramSvg(svg.value, {
      background: exportBackground.value,
      dark: diagramTheme.value === 'dark',
    })
    const baseName = fileName.value.replace(/\.(?:mmd|mermaid)$/i, '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'Mermaid 图表'
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({
      defaultPath: `${baseName}.${exportFormat.value}`,
      filters: [{ name: exportFormat.value.toUpperCase(), extensions: [exportFormat.value] }],
    })
    if (!path) return
    const bytes = exportFormat.value === 'svg'
      ? new TextEncoder().encode(prepared.content)
      : await diagramSvgToPng(prepared, exportScale.value)
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    await writeFile(path, bytes)
    showExport.value = false
    message.success(`${exportFormat.value.toUpperCase()} 已导出`)
  } catch (cause) {
    message.error(`图表导出失败：${String(cause).replace(/^Error:\s*/, '')}`)
  } finally {
    exporting.value = false
  }
}
const handleKeydown = (event: KeyboardEvent) => {
  const command = event.ctrlKey || event.metaKey
  if (!command) return
  if (event.key.toLowerCase() === 's') { event.preventDefault(); void saveDiagram() }
  else if (event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
  else if (event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
}
const mayLeave = () => !dirty.value || window.confirm('Mermaid 图表还有未保存修改，确定离开吗？')
const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }

watch(diagramPath, loadDiagram)
watch([zoom, showStructure, structureTab, diagramTheme, selectedId], () => rememberDiagramViewState())
onBeforeRouteLeave(() => mayLeave())
onBeforeRouteUpdate((to, from) => to.query.path === from.query.path || mayLeave())
onMounted(() => { loadDiagram(); window.addEventListener('beforeunload', beforeUnload) })
onBeforeUnmount(() => { rememberDiagramViewState(); window.clearTimeout(renderTimer); window.removeEventListener('beforeunload', beforeUnload) })
</script>

<style scoped>
.diagram-studio { width: 100%; height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; color: var(--theme-text); background: color-mix(in srgb, var(--theme-bg) 95%, var(--theme-primary)); outline: none; container-type: inline-size; }.studio-toolbar { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 16px; border-bottom: 1px solid var(--workspace-border-color); background: var(--theme-card); box-shadow: var(--workspace-shadow-sm); z-index: 4; }.studio-title,.studio-actions { display: flex; align-items: center; gap: 7px; }.studio-title > button,.studio-actions > button { height: 31px; padding: 0 9px; border: 1px solid var(--workspace-border-color); border-radius: 7px; color: var(--theme-text); background: var(--workspace-control-bg); cursor: pointer; }.studio-title > button { width: 31px; padding: 0; font-size: 18px; }.studio-title div { display: flex; flex-direction: column; }.studio-title strong { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }.studio-title span,.studio-actions label { color: var(--theme-text-secondary); font-size: var(--text-compact); }.studio-actions label { display: flex; align-items: center; gap: 4px; }.studio-actions select { height: 29px; max-width: 125px; border: 1px solid var(--workspace-border-color); border-radius: 6px; color: var(--theme-text); background: var(--theme-card); font-size: var(--text-compact); }.studio-actions .zoom-value { min-width: 48px; }.studio-actions .save-button { min-width: 68px; color: var(--workspace-on-accent); border-color: var(--theme-primary); background: var(--theme-primary); }.studio-actions .save-button:disabled { color: var(--theme-text-secondary); border-color: transparent; background: var(--workspace-control-bg); cursor: default; }
.studio-workspace { min-height: 0; flex: 1; display: grid; grid-template-columns: minmax(330px, 42%) minmax(0, 1fr); }.source-panel,.preview-panel { min-width: 0; min-height: 0; display: grid; grid-template-rows: 40px minmax(0,1fr) auto; }.source-panel { border-right: 1px solid var(--workspace-border-color); background: color-mix(in srgb, var(--theme-card) 97%, #edf2f7); }.preview-panel { grid-template-rows: 40px minmax(0,1fr); }.source-panel > header,.preview-panel > header { display: flex; align-items: center; justify-content: space-between; padding: 0 13px; border-bottom: 1px solid var(--workspace-border-color); background: var(--theme-card); }.source-panel header strong,.preview-panel header strong { font-size: var(--text-compact); }.source-panel header span,.preview-panel header span { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.source-editor { min-height: 0; display: grid; grid-template-columns: 48px minmax(0,1fr); overflow: hidden; background: #18202b; }.source-editor pre { height: 100%; margin: 0; padding: 14px 10px; overflow: hidden; box-sizing: border-box; color: #66778b; border-right: 1px solid rgba(255,255,255,.07); text-align: right; font: 12px/22px 'Fira Code', monospace; user-select: none; }.source-editor textarea { width: 100%; height: 100%; padding: 14px; overflow: auto; resize: none; box-sizing: border-box; border: 0; outline: 0; color: #dbe7f3; background: transparent; caret-color: #7ea6ff; tab-size: 2; font: 12px/22px 'Fira Code', monospace; white-space: pre; }.source-panel footer { min-height: 32px; display: flex; align-items: center; gap: 6px; padding: 0 11px; color: var(--theme-text-secondary); background: var(--theme-card); font-size: var(--text-compact); }.source-panel footer i { margin-left: auto; font-style: normal; }.valid-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--status-success); }.parse-error { min-height: 54px; display: grid; grid-template-columns: auto minmax(0,1fr); align-items: start; gap: 8px; padding: 9px 12px; border: 0; border-top: 1px solid var(--status-danger-border); color: var(--status-danger); background: var(--status-danger-bg); text-align: left; cursor: pointer; }.parse-error strong { font-size: var(--text-compact); }.parse-error span { overflow: hidden; font: var(--text-compact)/1.5 var(--font-mono); }
.preview-scroll { min-height: 0; display: grid; place-items: center; padding: 24px; overflow: auto; transform-origin: center; }.svg-stage { width: min(100%, 1200px); transform-origin: center; transition: transform .15s ease; }.svg-stage :deep(svg) { width: 100%; height: auto; max-height: calc(100vh - 150px); }.preview-empty { display: flex; flex-direction: column; align-items: center; gap: 7px; color: var(--theme-text-secondary); font-size: var(--text-compact); }.preview-empty strong { color: var(--theme-text); font-size: 13px; }.studio-state { flex: 1; place-content: center; justify-items: center; border: 0; border-radius: 0; background: transparent; }.studio-state button { height: 30px; border: 1px solid var(--workspace-border-color); border-radius: 6px; color: var(--theme-text); background: var(--theme-card); cursor: pointer; }
.studio-actions > button.active { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.35); background: rgba(var(--theme-primary-rgb),.08); }.studio-workspace.with-inspector { grid-template-columns: minmax(310px,35%) minmax(0,1fr) 270px; }
.export-panel { position: absolute; top: 52px; right: 84px; z-index: 20; width: 265px; display: grid; gap: 10px; padding: 13px; box-sizing: border-box; border: 1px solid var(--workspace-border-color); border-radius: 10px; background: var(--theme-card); box-shadow: var(--workspace-shadow); }.export-panel > header { display: flex; align-items: center; justify-content: space-between; }.export-panel > header div { display: flex; flex-direction: column; }.export-panel > header strong { font-size: 11px; }.export-panel > header span,.export-panel p { margin: 0; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.5; }.export-panel > header button { width: 25px; height: 25px; border: 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; font-size: 16px; }.export-panel label { display: grid; grid-template-columns: 70px 1fr; align-items: center; color: var(--theme-text-secondary); font-size: var(--text-compact); }.export-panel select { height: 31px; border: 1px solid var(--workspace-border-color); border-radius: 6px; color: var(--theme-text); background: var(--theme-bg); font-size: var(--text-compact); }.export-confirm { height: 33px; border: 0; border-radius: 7px; color: var(--workspace-on-accent); background: var(--theme-primary); cursor: pointer; font-size: var(--text-compact); }.export-confirm:disabled { opacity: .45; cursor: default; }
.structure-panel { min-width: 0; min-height: 0; display: flex; flex-direction: column; border-left: 1px solid var(--workspace-border-color); background: var(--theme-card); }.structure-panel > header { min-height: 48px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px 0 13px; border-bottom: 1px solid var(--workspace-border-color); }.structure-panel > header div { display: flex; flex-direction: column; }.structure-panel > header strong { font-size: var(--text-compact); }.structure-panel > header span { color: var(--theme-text-secondary); font-size: var(--text-compact); }.structure-panel > header button { width: 25px; height: 25px; border: 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; font-size: 16px; }.structure-tabs { display: grid; grid-template-columns: 1fr 1fr; padding: 8px 9px 0; }.structure-tabs button { height: 28px; border: 0; border-bottom: 2px solid transparent; color: var(--theme-text-secondary); background: transparent; cursor: pointer; font-size: var(--text-compact); }.structure-tabs button.active { color: var(--theme-primary); border-color: var(--theme-primary); }.structure-list { max-height: 34%; min-height: 100px; padding: 7px 9px; overflow: auto; border-bottom: 1px solid var(--workspace-border-color); }.structure-list > button { width: 100%; min-height: 43px; display: flex; flex-direction: column; justify-content: center; padding: 5px 8px; border: 1px solid transparent; border-radius: 7px; color: var(--theme-text); background: transparent; text-align: left; cursor: pointer; }.structure-list > button:hover,.structure-list > button.active { border-color: rgba(var(--theme-primary-rgb),.18); background: rgba(var(--theme-primary-rgb),.06); }.structure-list strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.structure-list span,.structure-list p { color: var(--theme-text-secondary); font-size: var(--text-compact); }.structure-warning { padding: 7px 10px; color: var(--status-warning); background: var(--status-warning-bg); font-size: var(--text-compact); line-height: 1.5; }.structure-empty { margin: 12px; }.property-placeholder { padding: 22px 14px; color: var(--theme-text-secondary); text-align: center; font-size: var(--text-compact); line-height: 1.6; }.property-form { display: flex; flex-direction: column; gap: 11px; padding: 14px; overflow: auto; }.property-form header { display: flex; align-items: center; justify-content: space-between; }.property-form header strong { font-size: var(--text-compact); }.property-form header span,.property-form p { color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.6; }.property-form label { display: grid; gap: 5px; color: var(--theme-text-secondary); font-size: var(--text-compact); }.property-form input,.property-form select { width: 100%; height: 31px; padding: 0 8px; box-sizing: border-box; border: 1px solid var(--workspace-border-color); border-radius: 6px; color: var(--theme-text); background: var(--theme-bg); outline: none; font-size: var(--text-compact); }.property-form input:focus,.property-form select:focus { border-color: var(--theme-primary); }.property-form > button { height: 31px; border: 0; border-radius: 6px; color: var(--workspace-on-accent); background: var(--theme-primary); cursor: pointer; font-size: var(--text-compact); }.property-form > button:disabled { opacity: .45; cursor: default; }
@media (max-width: 1100px) { .studio-workspace.with-inspector { grid-template-columns: minmax(300px,40%) minmax(0,1fr); }.structure-panel { position: absolute; top: 58px; right: 0; bottom: 0; z-index: 10; width: 290px; box-shadow: var(--workspace-shadow); } }
@media (max-width: 900px) { .studio-actions label:nth-child(2),.studio-actions > button:not(.save-button):not(.structure-toggle):not(.export-toggle):not(.history-button) { display: none; }.studio-actions > button.active { display: block; }.export-panel { top: 54px; right: 10px; }.studio-workspace,.studio-workspace.with-inspector { grid-template-columns: 1fr; grid-template-rows: 46% minmax(0,1fr); }.source-panel { border-right: 0; border-bottom: 1px solid var(--workspace-border-color); } }
@media (max-width: 620px) { .studio-toolbar { flex-wrap: wrap; gap: 6px; padding: 7px 10px; }.studio-title { width: 100%; min-width: 0; }.studio-title div { min-width: 0; }.studio-title strong { max-width: 100%; }.studio-actions { width: 100%; justify-content: flex-end; }.studio-actions label:first-child { min-width: 0; flex: 1; }.studio-actions label:first-child select { min-width: 0; flex: 1; }.structure-panel { top: 96px; width: min(290px, 88vw); } }
@container (max-width: 1100px) { .studio-workspace.with-inspector { grid-template-columns: minmax(300px,40%) minmax(0,1fr); }.structure-panel { position: absolute; top: 58px; right: 0; bottom: 0; z-index: 10; width: 290px; box-shadow: var(--workspace-shadow); } }
@container (max-width: 900px) { .studio-actions label:nth-child(2),.studio-actions > button:not(.save-button):not(.structure-toggle):not(.export-toggle):not(.history-button) { display: none; }.studio-actions > button.active { display: block; }.export-panel { top: 54px; right: 10px; }.studio-workspace,.studio-workspace.with-inspector { grid-template-columns: 1fr; grid-template-rows: 46% minmax(0,1fr); }.source-panel { border-right: 0; border-bottom: 1px solid var(--workspace-border-color); } }
@container (max-width: 620px) { .studio-toolbar { flex-wrap: wrap; gap: 6px; padding: 7px 10px; }.studio-title { width: 100%; min-width: 0; }.studio-title div { min-width: 0; }.studio-title strong { max-width: 100%; }.studio-actions { width: 100%; justify-content: flex-end; }.studio-actions label:first-child { min-width: 0; flex: 1; }.studio-actions label:first-child select { min-width: 0; flex: 1; }.structure-panel { top: 96px; width: min(290px, 88cqw); } }
</style>
