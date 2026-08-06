<template>
  <div class="workspace-home">
    <WorkspaceManagementHeader
      class="workspace-header"
      title="工作台"
      :subtitle="store.currentLibraryName || '专业工作区概览'"
      @back="router.push({ name: 'LibraryMode' })"
    >
      <template #icon>
        <img class="brand-mark" src="/icon.png" alt="Long编辑图标">
      </template>
      <nav class="workspace-nav" aria-label="工作台导航">
        <button title="知识图谱" :disabled="!store.libraryPath" @click="router.push({ name: 'Graph' })"><NetworkIcon /><span>图谱</span></button>
        <button title="设置" @click="router.push({ name: 'Settings' })"><SettingsIcon /></button>
        <button title="刷新工作台" :disabled="loading || !store.libraryPath" @click="loadWorkspace"><RefreshIcon :class="{ spinning: loading }" /></button>
      </nav>
    </WorkspaceManagementHeader>

    <WorkspaceManagementContent v-if="store.libraryPath" class="workspace-content">
      <section class="workspace-identity">
        <div>
          <span class="section-kicker">ACTIVE WORKSPACE</span>
          <h1>{{ store.currentLibraryName }}</h1>
          <p :title="store.libraryPath">{{ store.libraryPath }}</p>
        </div>
        <div class="workspace-signals">
          <span :class="`signal index-${indexStatus.state}`"><DatabaseIcon />{{ indexLabel }}</span>
          <span class="signal"><ClockIcon />{{ refreshedLabel }}</span>
        </div>
      </section>

      <section class="metric-strip" aria-label="工作区指标">
        <button @click="router.push({ name: 'LibraryMode' })"><span>可管理文件</span><strong>{{ overview.totalFiles }}</strong></button>
        <button @click="router.push({ name: 'LibraryMode' })"><span>Markdown</span><strong>{{ formatCount('markdown') }}</strong></button>
        <button @click="openFirstCanvas" :disabled="!canvasItems.length"><span>Canvas</span><strong>{{ formatCount('canvas') }}</strong></button>
        <button @click="scrollToTasks"><span>未完成任务</span><strong>{{ overview.tasks.length }}</strong></button>
        <button @click="scrollToGovernance"><span>治理风险</span><strong>{{ healthRiskCount }}</strong></button>
      </section>

      <WorkspaceStateNotice v-if="error" class="workspace-alert" kind="error" tone="danger" compact><template #icon><AlertIcon /></template><span>{{ error }}</span><template #action><button @click="loadWorkspace">重试</button></template></WorkspaceStateNotice>

      <div class="workspace-grid">
        <section class="workspace-section activity-section">
          <div class="section-heading"><div><span class="section-kicker">ACTIVITY</span><h2>继续工作</h2></div></div>
          <template v-if="starredItems.length">
            <div class="list-label">已收藏</div>
            <div class="file-list starred-list">
              <div v-for="item in starredItems" :key="item.path" class="file-row">
                <button class="file-open" @click="openPath(item.path)">
                  <span class="file-icon"><StarIcon /></span>
                  <span class="file-copy"><strong>{{ displayName(item.path) }}</strong><small>{{ relativeLabel(item.path) }}</small></span>
                  <span class="file-action"><ArrowIcon /></span>
                </button>
                <RelationSummaryBadge v-if="relationSummary(item.path)" :summary="relationSummary(item.path)!" compact @open="openRelationGraph(item.path)" />
              </div>
            </div>
          </template>
          <div class="list-label">最近使用</div>
          <div v-if="recentItems.length" class="file-list">
            <div v-for="item in recentItems" :key="item.path" class="file-row">
              <button class="file-open" @click="openPath(item.path)">
                <span class="file-icon"><component :is="iconForPath(item.path)" /></span>
                <span class="file-copy"><strong>{{ displayName(item.path, item.title) }}</strong><small>{{ relativeLabel(item.path) }}</small></span>
                <span class="file-action"><ArrowIcon /></span>
              </button>
              <RelationSummaryBadge v-if="relationSummary(item.path)" :summary="relationSummary(item.path)!" compact @open="openRelationGraph(item.path)" />
            </div>
          </div>
          <div v-else class="empty-line">暂无最近文件</div>
        </section>

        <section class="workspace-section health-section">
          <div class="section-heading"><div><span class="section-kicker">KNOWLEDGE HEALTH</span><h2>知识库健康</h2></div><button class="text-command" @click="router.push({ name: 'Graph' })">查看图谱</button></div>
          <div class="health-grid">
            <button @click="router.push({ name: 'Graph' })"><span>断链</span><strong>{{ health.brokenLinks.length }}</strong></button>
            <button @click="router.push({ name: 'Graph' })"><span>歧义</span><strong>{{ health.ambiguousLinks.length }}</strong></button>
            <button @click="router.push({ name: 'Graph' })"><span>孤立笔记</span><strong>{{ health.orphanNotes.length }}</strong></button>
          </div>
          <div class="knowledge-pulse" aria-label="知识网络脉搏" data-testid="knowledge-network-pulse" :data-object-count="graphPulse.objectCount" :data-relation-count="graphPulse.relationCount" :data-connected-count="graphPulse.connectedObjectCount" :data-isolated-count="graphPulse.isolatedObjectCount">
            <div class="pulse-heading">
              <div><span>关系覆盖</span><strong>{{ graphPulse.coveragePercent }}%</strong></div>
              <small>{{ graphPulse.connectedObjectCount }} 已连接 · {{ graphPulse.isolatedObjectCount }} 孤立 · {{ graphPulse.relationCount }} 关系</small>
            </div>
            <div class="pulse-track" role="progressbar" aria-label="知识对象关系覆盖率" data-testid="knowledge-network-coverage" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="graphPulse.coveragePercent">
              <i :style="{ width: `${graphPulse.coveragePercent}%` }"></i>
            </div>
            <div v-if="graphPulse.relationTypes.length" class="pulse-types">
              <span v-for="item in graphPulse.relationTypes.slice(0, 5)" :key="item.relationType" :data-relation-type="item.relationType">{{ relationTypeLabel(item.relationType) }} <b>{{ item.count }}</b></span>
            </div>
            <div v-if="graphPulse.topNodes.length" class="pulse-nodes">
              <button v-for="node in graphPulse.topNodes" :key="node.id" data-testid="knowledge-network-topic" :data-node-id="node.id" :title="`以 ${node.title} 为中心打开图谱`" @click="openPulseNode(node.id)">
                <span>{{ node.title }}</span><b>{{ node.relationCount }}</b>
              </button>
            </div>
            <button v-else class="pulse-empty" @click="router.push({ name: 'Graph' })">从双向链接、标签或画布连接开始建立知识网络</button>
            <div v-if="graphPulse.isolatedNodes.length" class="pulse-isolation" data-testid="knowledge-isolation-queue">
              <div><span>优先连接</span><small>点击对象，以它为中心补充关系</small></div>
              <div>
                <button v-for="node in graphPulse.isolatedNodes" :key="node.id" data-testid="knowledge-isolation-item" :data-node-id="node.id" :title="`定位孤立对象：${node.title}`" @click="openPulseNode(node.id)">
                  <span>{{ node.title }}</span><small>{{ formatLabel(node.objectType) }}</small><ArrowIcon />
                </button>
              </div>
            </div>
            <button v-if="graphPulse.guidance.length" class="pulse-guidance" data-testid="knowledge-network-guidance" :data-guidance-code="graphPulse.guidance[0].code" @click="openGuidance(graphPulse.guidance[0])">
              <span><b>{{ guidanceCopy(graphPulse.guidance[0]).title }}</b><small>{{ guidanceCopy(graphPulse.guidance[0]).detail }}</small></span>
              <ArrowIcon />
            </button>
            <button v-if="graphPulse.guidance.length" class="pulse-observation-action" data-testid="knowledge-observation-entry" @click="openKnowledgeObservation">
              记录治理基线
            </button>
          </div>
          <div class="index-line">
            <DatabaseIcon />
            <div><strong>{{ indexLabel }}</strong><small v-if="indexStatus.state === 'ready'">{{ indexStatus.objectCount }} 个对象 · {{ indexStatus.relationCount }} 条关系</small><small v-else>LongEdit 会在后台准备本地搜索缓存</small></div>
            <button title="打开搜索与关联状态" @click="router.push({ name: 'LibraryMode' })"><ArrowIcon /></button>
          </div>
          <div class="format-line" v-if="overview.formatCounts.length">
            <span v-for="item in overview.formatCounts.slice(0, 6)" :key="item.objectType"><i>{{ formatLabel(item.objectType) }}</i><b>{{ item.count }}</b></span>
          </div>
        </section>

        <section ref="tasksSection" class="workspace-section task-section">
          <div class="section-heading"><div><span class="section-kicker">OPEN TASKS</span><h2>待办</h2></div><span class="section-count">{{ overview.tasks.length }}</span></div>
          <div v-if="overview.tasks.length" class="task-list">
            <button v-for="task in overview.tasks" :key="`${task.path}:${task.line}`" @click="openPath(task.path)">
              <span class="task-check"></span>
              <span><strong>{{ task.text }}</strong><small>{{ task.relativePath }} · 第 {{ task.line }} 行</small></span>
              <ArrowIcon />
            </button>
          </div>
          <div v-else class="empty-line">没有未完成任务</div>
        </section>

        <section class="workspace-section canvas-section">
          <div class="section-heading"><div><span class="section-kicker">CANVAS</span><h2>常用画布</h2></div><button class="text-command" @click="router.push({ name: 'LibraryMode' })">浏览文件</button></div>
          <div v-if="canvasItems.length" class="canvas-list">
            <button v-for="canvas in canvasItems" :key="canvas.path" @click="openPath(canvas.path)">
              <CanvasIcon />
              <span><strong>{{ displayName(canvas.path, canvas.title) }}</strong><small>{{ relativeLabel(canvas.path) }}</small></span>
              <ArrowIcon />
            </button>
          </div>
          <div v-else class="empty-line">暂无 Canvas</div>
        </section>

        <section class="workspace-section collection-section">
          <div class="section-heading"><div><span class="section-kicker">SAVED VIEWS</span><h2>保存视图</h2></div><button class="text-command" @click="router.push({ name: 'LibraryMode', query: { panel: 'collections' } })">管理视图</button></div>
          <div v-if="savedSearches.length" class="collection-list">
            <button v-for="search in savedSearches" :key="search.id" @click="openSavedSearch(search)">
              <CollectionIcon />
              <span><strong>{{ search.name }}</strong><small>{{ search.graphRoot ? `${search.graphDepth || 1} 层动态子图` : search.objectTypes.length ? search.objectTypes.map(formatLabel).join(' · ') : '全部格式' }}</small></span>
              <ArrowIcon />
            </button>
          </div>
          <div v-else class="empty-line">暂无保存视图</div>
        </section>

        <section ref="governanceSection" class="workspace-section governance-section">
          <WorkspaceHealthQueue :report="workspaceHealth" :error="workspaceHealthError" @open-file="openPath" @open-annotation="openAnnotation" />
        </section>
      </div>
    </WorkspaceManagementContent>

    <WorkspaceEmptyState v-else as="main" class="workspace-empty">
      <img class="brand-mark large" src="/icon.png" alt="Long编辑图标">
      <h1>Long编辑</h1>
      <p>未关联知识库</p>
      <button @click="router.push({ name: 'Settings' })"><SettingsIcon />配置知识库</button>
    </WorkspaceEmptyState>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useRouter } from 'vue-router'
import {
  AlertTriangle as AlertIcon, ArrowRight as ArrowIcon,
  Clock3 as ClockIcon, Database as DatabaseIcon, FileSpreadsheet as TableIcon,
  FileText as FileIcon, LayoutDashboard as CanvasIcon, Network as NetworkIcon,
  ListFilter as CollectionIcon, RefreshCw as RefreshIcon, Settings as SettingsIcon,
  Star as StarIcon, Workflow as DiagramIcon,
} from 'lucide-vue-next'
import { useAppStore, type SavedSearchConfig } from '../store/app'
import { fileDisplayName, findFileFormat, opensInLibraryShell, routeForFile } from '../config/fileFormats'
import { openManagedFile } from '../services/fileNavigation'
import RelationSummaryBadge, { type GraphRelationSummary } from '../components/RelationSummaryBadge.vue'
import WorkspaceHealthQueue, { type WorkspaceAnnotationIssue, type WorkspaceHealthReport } from '../components/WorkspaceHealthQueue.vue'
import WorkspaceEmptyState from '../components/workspace/WorkspaceEmptyState.vue'
import WorkspaceManagementContent from '../components/workspace/WorkspaceManagementContent.vue'
import WorkspaceManagementHeader from '../components/workspace/WorkspaceManagementHeader.vue'
import WorkspaceStateNotice from '../components/workspace/WorkspaceStateNotice.vue'

interface WorkspaceTask { title: string; path: string; relativePath: string; line: number; text: string }
interface WorkspaceFile { title: string; path: string; relativePath: string; objectType: string; modifiedAt: number; size: number }
interface WorkspaceOverview { totalFiles: number; tasks: WorkspaceTask[]; recentFiles: WorkspaceFile[]; canvases: WorkspaceFile[]; formatCounts: { objectType: string; count: number }[] }
interface GraphHealth { brokenLinks: unknown[]; ambiguousLinks: unknown[]; orphanNotes: unknown[]; scannedNotes: number }
interface IndexStatus { state: 'missing' | 'building' | 'ready' | 'stale' | 'corrupt' | 'error'; objectCount: number; relationCount: number }
interface KnowledgeGraphPulseRelationType { relationType: string; count: number }
interface KnowledgeGraphPulseNode { id: string; title: string; objectType: string; relationCount: number }
interface KnowledgeGraphGuidance { code: string; priority: 'high' | 'medium' | 'healthy'; currentValue: number; targetValue: number }
interface KnowledgeGraphPulse {
  objectCount: number
  relationCount: number
  connectedObjectCount: number
  isolatedObjectCount: number
  coveragePercent: number
  relationTypes: KnowledgeGraphPulseRelationType[]
  topNodes: KnowledgeGraphPulseNode[]
  isolatedNodes: KnowledgeGraphPulseNode[]
  guidance: KnowledgeGraphGuidance[]
}

const router = useRouter()
const store = useAppStore()
const loading = ref(false)
const error = ref('')
const workspaceHealthError = ref('')
const refreshedAt = ref(0)
const tasksSection = ref<HTMLElement | null>(null)
const governanceSection = ref<HTMLElement | null>(null)
const overview = ref<WorkspaceOverview>({ totalFiles: 0, tasks: [], recentFiles: [], canvases: [], formatCounts: [] })
const health = ref<GraphHealth>({ brokenLinks: [], ambiguousLinks: [], orphanNotes: [], scannedNotes: 0 })
const indexStatus = ref<IndexStatus>({ state: 'missing', objectCount: 0, relationCount: 0 })
const indexAutoPreparing = ref(false)
const graphPulse = ref<KnowledgeGraphPulse>({ objectCount: 0, relationCount: 0, connectedObjectCount: 0, isolatedObjectCount: 0, coveragePercent: 0, relationTypes: [], topNodes: [], isolatedNodes: [], guidance: [] })
const workspaceHealth = ref<WorkspaceHealthReport>({ duplicateGroups: [], unreferencedAnnotations: [], scannedFiles: 0, hashedFiles: 0, scannedAnnotations: 0, truncated: false })
const relationSummaries = ref<Record<string, GraphRelationSummary>>({})

const indexLabel = computed(() => ({
  missing: '搜索与关联：准备中',
  building: '搜索与关联：正在准备',
  ready: '搜索与关联：可用',
  stale: '搜索与关联：需要更新',
  corrupt: '搜索与关联：需要处理',
  error: '搜索与关联：需要处理',
}[indexStatus.value.state]))
const healthRiskCount = computed(() => health.value.brokenLinks.length + health.value.ambiguousLinks.length + health.value.orphanNotes.length + workspaceHealth.value.duplicateGroups.length + workspaceHealth.value.unreferencedAnnotations.length)
const refreshedLabel = computed(() => refreshedAt.value ? new Date(refreshedAt.value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '尚未刷新')
const starredItems = computed(() => store.starredFiles.slice(0, 6).map(path => ({ path })))
const pathIdentity = (path: string) => path.replace(/^\\\\\?\\/, '').replace(/\\/g, '/').toLocaleLowerCase()
const displayPath = (path: string) => path.replace(/^\\\\\?\\/, '')
const recentItems = computed(() => {
  const combined = [...store.recentFiles, ...overview.value.recentFiles]
  return combined
    .filter((item, index) => combined.findIndex(candidate => pathIdentity(candidate.path) === pathIdentity(item.path)) === index)
    .slice(0, 8)
})
const canvasItems = computed(() => {
  const starred = store.starredFiles.filter(path => findFileFormat(path)?.id === 'canvas').map(path => ({ path, title: fileDisplayName(path) }))
  const combined = [...starred, ...overview.value.canvases]
  return combined
    .filter((item, index) => combined.findIndex(candidate => pathIdentity(candidate.path) === pathIdentity(item.path)) === index)
    .slice(0, 8)
})
const savedSearches = computed(() => store.savedSearches
  .filter(search => search.libraryPath === store.libraryPath)
  .sort((left, right) => right.createdAt - left.createdAt)
  .slice(0, 6))

const formatLabels: Record<string, string> = { markdown: 'MD', canvas: 'Canvas', pdf: 'PDF', table: 'Table', workbook: 'XLSX', diagram: 'Mermaid', opml: 'OPML', 'plain-text': 'TXT' }
const formatIcons: Record<string, typeof FileIcon> = { table: TableIcon, workbook: TableIcon, canvas: CanvasIcon, diagram: DiagramIcon }
const formatCount = (id: string) => overview.value.formatCounts.find(item => item.objectType === id)?.count || 0
const formatLabel = (id: string) => formatLabels[id] || id
const displayName = (path: string, fallback?: string) => fileDisplayName(path) || fallback || path.split(/[\\/]/).pop() || path
const relativeLabel = (path: string) => {
  const visible = displayPath(path)
  return visible.replace(displayPath(store.libraryPath), '').replace(/^[\\/]+/, '') || visible
}
const iconForPath = (path: string) => formatIcons[findFileFormat(path)?.id || ''] || FileIcon
const scrollToTasks = () => tasksSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
const scrollToGovernance = () => governanceSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
const openFirstCanvas = () => {
  const firstCanvas = canvasItems.value[0]
  if (firstCanvas) openPath(firstCanvas.path)
}
const openSavedSearch = (search: SavedSearchConfig) => router.push({
  name: 'LibraryMode',
  query: search.graphRoot
    ? { collection: search.id }
    : { search: search.query, ...(search.objectTypes.length ? { types: search.objectTypes.join(',') } : {}) },
})
const relationSummary = (path: string) => relationSummaries.value[path]
const openRelationGraph = (path: string) => {
  const summary = relationSummary(path)
  if (summary) router.push({ name: 'Graph', query: { root: summary.nodeId } })
}
const openPulseNode = (nodeId: string) => router.push({ name: 'Graph', query: { root: nodeId } })
const relationTypeLabel = (type: string) => ({
  'links-to': '链接', related: '相关', contains: '包含', annotates: '批注', 'shares-tag': '同标签', references: '引用',
} as Record<string, string>)[type] || type
const guidanceCopy = (item: KnowledgeGraphGuidance) => ({
  'add-first-knowledge-object': { title: '建立第一个知识对象', detail: '导入或新建文档后，网络会从这里开始。' },
  'create-first-relation': { title: '建立第一条知识关系', detail: '使用双向链接、标签、画布或大纲连接现有内容。' },
  'increase-relation-coverage': { title: `把关系覆盖提升到 ${item.targetValue}%`, detail: `当前 ${item.currentValue}%，优先连接孤立对象。` },
  'connect-isolated-objects': { title: `处理 ${item.currentValue} 个孤立对象`, detail: '从图谱中为它们补充链接、标签或结构关系。' },
  'diversify-relation-types': { title: '丰富关系语义', detail: `当前 ${item.currentValue} 类，建议达到 ${item.targetValue} 类以上。` },
  'network-health-on-track': { title: '知识网络状态良好', detail: `关系覆盖 ${item.currentValue}%，继续从核心主题维护网络。` },
} as Record<string, { title: string; detail: string }>)[item.code] || { title: '检查知识网络', detail: '打开图谱查看关系结构与孤立对象。' }
const openGuidance = (item: KnowledgeGraphGuidance) => {
  if (item.code === 'add-first-knowledge-object') {
    router.push({ name: 'LibraryMode' })
    return
  }
  const focus = ({
    'create-first-relation': 'relations',
    'increase-relation-coverage': 'orphans',
    'connect-isolated-objects': 'orphans',
    'diversify-relation-types': 'diversity',
    'network-health-on-track': 'overview',
  } as Record<string, string>)[item.code] || 'overview'
  router.push({ name: 'Graph', query: { focus } })
}
const openKnowledgeObservation = () => router.push({ name: 'Settings', query: { focus: 'knowledge-observation' } })

const loadRelationSummaries = async () => {
  const paths = [...new Set([...starredItems.value, ...recentItems.value].map(item => item.path))].slice(0, 100)
  if (!store.libraryPath || !paths.length) {
    relationSummaries.value = {}
    return
  }
  try {
    const summaries = await invoke<GraphRelationSummary[]>('summarize_graph_relations', {
      libraryRoot: store.libraryPath,
      paths,
    })
    relationSummaries.value = Object.fromEntries(summaries.map(summary => [summary.path, summary]))
  } catch {
    relationSummaries.value = {}
  }
}

const openPath = (path: string) => {
  const target = routeForFile(path)
  if (!target) return
  if (opensInLibraryShell(findFileFormat(path))) openManagedFile(router, path)
  else router.push(target)
}

const openAnnotation = (issue: WorkspaceAnnotationIssue) => openManagedFile(
  router,
  issue.pdfPath,
  { page: String(issue.page), annotation: issue.annotationId },
)

const loadWorkspace = async () => {
  if (!store.libraryPath || loading.value) return
  loading.value = true
  error.value = ''
  workspaceHealthError.value = ''
  const [overviewResult, healthResult, indexResult, workspaceHealthResult, graphPulseResult] = await Promise.allSettled([
    invoke<WorkspaceOverview>('get_workspace_overview', { libraryRoot: store.libraryPath }),
    invoke<GraphHealth>('analyze_graph_health', { libraryRoot: store.libraryPath }),
    invoke<IndexStatus>('get_knowledge_index_status', { libraryRoot: store.libraryPath }),
    invoke<WorkspaceHealthReport>('analyze_workspace_health', { libraryRoot: store.libraryPath }),
    invoke<KnowledgeGraphPulse>('get_knowledge_graph_pulse', { libraryRoot: store.libraryPath }),
  ])
  if (overviewResult.status === 'fulfilled') overview.value = overviewResult.value
  else error.value = `工作台概览不可用：${String(overviewResult.reason)}`
  if (healthResult.status === 'fulfilled') health.value = healthResult.value
  if (indexResult.status === 'fulfilled') {
    indexStatus.value = indexResult.value
    if (indexResult.value.state === 'missing' || indexResult.value.state === 'stale') {
      void prepareWorkspaceSearch(store.libraryPath)
    }
  }
  if (workspaceHealthResult.status === 'fulfilled') workspaceHealth.value = workspaceHealthResult.value
  else workspaceHealthError.value = `治理扫描不可用：${String(workspaceHealthResult.reason)}`
  if (graphPulseResult.status === 'fulfilled') graphPulse.value = graphPulseResult.value
  else graphPulse.value = { objectCount: 0, relationCount: 0, connectedObjectCount: 0, isolatedObjectCount: 0, coveragePercent: 0, relationTypes: [], topNodes: [], isolatedNodes: [], guidance: [] }
  await loadRelationSummaries()
  refreshedAt.value = Date.now()
  loading.value = false
}

const prepareWorkspaceSearch = async (libraryRoot: string) => {
  if (!libraryRoot || indexAutoPreparing.value) return
  indexAutoPreparing.value = true
  indexStatus.value = { ...indexStatus.value, state: 'building' }
  try {
    const status = await invoke<IndexStatus>('rebuild_knowledge_index', { libraryRoot })
    if (store.libraryPath === libraryRoot) indexStatus.value = status
  } catch {
    if (store.libraryPath === libraryRoot) indexStatus.value = { ...indexStatus.value, state: 'error' }
  } finally {
    indexAutoPreparing.value = false
  }
}

onMounted(async () => {
  await store.loadConfig()
  await loadWorkspace()
})
</script>

<style scoped>
.workspace-home { height: 100%; display: flex; flex-direction: column; overflow: hidden; color: var(--theme-text); background: var(--theme-bg); }
.workspace-header { flex: none; }
.brand-mark { width: 28px; height: 28px; display: block; border-radius: 7px; object-fit: cover; }.brand-mark.large { width: 44px; height: 44px; border-radius: 10px; }
.workspace-nav { display: flex; align-items: center; gap: 4px; }.workspace-nav button { min-width: 34px; height: 32px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 9px; border: 1px solid transparent; border-radius: 6px; color: var(--theme-text-secondary); background: transparent; cursor: pointer; font-size: var(--text-compact); }.workspace-nav button:hover { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.22); background: rgba(var(--theme-primary-rgb),.06); }.workspace-nav button:disabled { opacity: .35; cursor: default; }.workspace-nav svg { width: 15px; }.spinning { animation: spin .8s linear infinite; }
.workspace-content { flex: 1; overflow: auto; }
.workspace-identity { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 19px; border-bottom: 2px solid var(--theme-text); }.workspace-identity h1 { margin: 4px 0 3px; font-size: 25px; line-height: 1.15; letter-spacing: 0; }.workspace-identity p { max-width: min(620px,60vw); margin: 0; overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }
.section-kicker { color: var(--theme-primary); font-size: var(--text-compact); font-weight: 800; }.workspace-signals { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }.signal { height: 27px; display: flex; align-items: center; gap: 5px; padding: 0 8px; border: var(--theme-border); border-radius: 5px; color: var(--theme-text-secondary); background: var(--theme-surface); font-size: var(--text-compact); }.signal svg { width: 13px; }.signal.index-ready { color: var(--status-success); }.signal.index-stale,.signal.index-corrupt,.signal.index-error { color: var(--status-warning); }
.metric-strip { display: grid; grid-template-columns: repeat(5,minmax(100px,1fr)); border-bottom: var(--theme-border); }.metric-strip button { min-height: 74px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 3px; padding: 10px 16px; border: 0; border-right: var(--theme-border); color: var(--theme-text); background: transparent; cursor: pointer; }.metric-strip button:first-child { padding-left: 0; }.metric-strip button:last-child { border-right: 0; }.metric-strip button:hover { background: rgba(var(--theme-primary-rgb),.045); }.metric-strip span { color: var(--theme-text-secondary); font-size: var(--text-compact); }.metric-strip strong { font-size: 22px; font-weight: 680; }
.workspace-alert { min-height: 38px; border-width: 0 0 1px; border-radius: 0; color: var(--status-danger); border-color: var(--status-danger-border); background: var(--status-danger-bg); }.workspace-alert svg { width: 14px; }.workspace-alert button,.text-command { border: 0; color: var(--theme-primary); background: transparent; cursor: pointer; font-size: var(--text-compact); }
.workspace-grid { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(280px,.8fr); column-gap: 32px; }.workspace-section { min-width: 0; padding: 25px 0 28px; border-bottom: var(--theme-border); }.governance-section { grid-column: 1 / -1; }.section-heading { min-height: 35px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }.section-heading h2 { margin: 3px 0 0; font-size: 14px; letter-spacing: 0; }.section-count { min-width: 24px; text-align: right; color: var(--theme-text-secondary); font-size: 11px; }
.list-label { margin: 9px 0 5px; color: var(--theme-text-secondary); font-size: var(--text-compact); font-weight: 700; }.list-label:first-of-type { margin-top: 0; }.file-list,.task-list { display: grid; }.starred-list { margin-bottom: 15px; }.file-row { min-height: 51px; display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 8px; padding-right: 8px; border-top: var(--theme-border); }.file-row:hover { background: rgba(var(--theme-primary-rgb),.045); }.file-open { min-width: 0; min-height: 50px; display: grid; grid-template-columns: 28px minmax(0,1fr) 18px; align-items: center; gap: 10px; padding: 6px 0; border: 0; color: var(--theme-text); background: transparent; cursor: pointer; text-align: left; }.file-icon { width: 26px; height: 26px; display: grid; place-items: center; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.08); border-radius: 5px; }.file-icon svg,.file-action svg { width: 13px; }.file-copy { min-width: 0; display: grid; gap: 3px; }.file-copy strong,.task-list strong,.canvas-list strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.file-copy small,.task-list small,.canvas-list small { overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.file-action { color: var(--theme-text-secondary); }
.health-grid { display: grid; grid-template-columns: repeat(3,1fr); border-top: var(--theme-border); border-bottom: var(--theme-border); }.health-grid button { min-height: 65px; display: grid; align-content: center; gap: 4px; border: 0; border-right: var(--theme-border); color: var(--theme-text); background: transparent; cursor: pointer; text-align: center; }.health-grid button:last-child { border-right: 0; }.health-grid span { color: var(--theme-text-secondary); font-size: var(--text-compact); }.health-grid strong { font-size: 17px; }.index-line { min-height: 54px; display: grid; grid-template-columns: 22px minmax(0,1fr) 24px; align-items: center; gap: 8px; border-bottom: var(--theme-border); }.index-line>svg { width: 16px; color: var(--theme-primary); }.index-line>div { display: grid; gap: 2px; }.index-line strong { font-size: var(--text-compact); }.index-line small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.index-line button { border: 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; }.index-line button svg { width: 13px; }.format-line { display: flex; flex-wrap: wrap; gap: 5px; padding-top: 10px; }.format-line span { display: flex; align-items: center; gap: 5px; padding: 4px 6px; border: var(--theme-border); border-radius: 4px; font-size: var(--text-compact); }.format-line i { color: var(--theme-text-secondary); font-style: normal; }.format-line b { font-weight: 700; }
.knowledge-pulse { display: grid; gap: 8px; padding: 12px 0; border-bottom: var(--theme-border); }.pulse-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }.pulse-heading>div { display: flex; align-items: baseline; gap: 6px; }.pulse-heading span,.pulse-heading small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.pulse-heading strong { color: var(--theme-primary); font-size: 16px; }.pulse-track { height: 5px; overflow: hidden; border-radius: 999px; background: rgba(var(--theme-primary-rgb),.09); }.pulse-track i { display: block; height: 100%; border-radius: inherit; background: var(--theme-primary); transition: width .25s ease; }.pulse-types,.pulse-nodes { display: flex; flex-wrap: wrap; gap: 5px; }.pulse-types span { padding: 3px 5px; border-radius: 4px; color: var(--theme-text-secondary); background: rgba(var(--theme-primary-rgb),.055); font-size: var(--text-compact); }.pulse-types b { color: var(--theme-text); }.pulse-nodes button { max-width: 150px; display: inline-flex; align-items: center; gap: 5px; padding: 4px 6px; border: 1px solid rgba(var(--theme-primary-rgb),.16); border-radius: 999px; color: var(--theme-primary); background: transparent; cursor: pointer; font-size: var(--text-compact); }.pulse-nodes button:hover { background: rgba(var(--theme-primary-rgb),.07); }.pulse-nodes span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.pulse-nodes b { min-width: 14px; color: var(--theme-text-secondary); }.pulse-empty { min-height: 30px; padding: 0 8px; border: 1px dashed rgba(var(--theme-primary-rgb),.24); border-radius: 5px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.035); cursor: pointer; font-size: var(--text-compact); }.pulse-guidance { min-height: 42px; display: grid; grid-template-columns: minmax(0,1fr) 16px; align-items: center; gap: 8px; padding: 7px 8px; border: 1px solid rgba(var(--theme-primary-rgb),.18); border-radius: 5px; color: var(--theme-text); background: rgba(var(--theme-primary-rgb),.045); cursor: pointer; text-align: left; }.pulse-guidance:hover { border-color: rgba(var(--theme-primary-rgb),.35); }.pulse-guidance>span { min-width: 0; display: grid; gap: 2px; }.pulse-guidance b { font-size: var(--text-compact); }.pulse-guidance small { overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.pulse-guidance svg { width: 13px; color: var(--theme-primary); }.pulse-observation-action { justify-self: end; min-height: 26px; padding: 0 8px; border: 1px solid rgba(var(--theme-primary-rgb),.18); border-radius: 5px; color: var(--theme-primary); background: transparent; cursor: pointer; font-size: var(--text-compact); font-weight: 650; }.pulse-observation-action:hover { background: rgba(var(--theme-primary-rgb),.06); }
.pulse-isolation { display: grid; gap: 5px; padding: 7px 8px; border: 1px solid var(--status-warning-border); border-radius: 5px; background: var(--status-warning-bg); }.pulse-isolation>div:first-child { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }.pulse-isolation>div:first-child span { color: var(--status-warning); font-size: var(--text-compact); font-weight: 750; }.pulse-isolation>div:first-child small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.pulse-isolation>div:last-child { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 4px; }.pulse-isolation button { min-width: 0; min-height: 27px; display: grid; grid-template-columns: minmax(0,1fr) auto 12px; align-items: center; gap: 5px; padding: 3px 5px; border: 1px solid var(--status-warning-border); border-radius: 4px; color: var(--theme-text); background: var(--theme-surface); cursor: pointer; text-align: left; }.pulse-isolation button:hover { border-color: var(--status-warning); background: var(--status-warning-bg); }.pulse-isolation button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.pulse-isolation button small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.pulse-isolation button svg { width: 10px; color: var(--status-warning); }
.task-list button { min-height: 48px; display: grid; grid-template-columns: 16px minmax(0,1fr) 16px; align-items: center; gap: 9px; padding: 5px 8px 5px 0; border: 0; border-top: var(--theme-border); color: var(--theme-text); background: transparent; cursor: pointer; text-align: left; }.task-list button:hover { background: rgba(var(--theme-primary-rgb),.045); }.task-list button>span:nth-child(2) { min-width: 0; display: grid; gap: 3px; }.task-list svg { width: 13px; color: var(--theme-text-secondary); }.task-check { width: 11px; height: 11px; border: 1px solid var(--theme-text-secondary); border-radius: 2px; }
.canvas-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px; }.canvas-list button { min-height: 58px; display: grid; grid-template-columns: 24px minmax(0,1fr) 16px; align-items: center; gap: 8px; padding: 8px; border: var(--theme-border); border-radius: 6px; color: var(--theme-text); background: var(--theme-surface); cursor: pointer; text-align: left; }.canvas-list button:hover { border-color: rgba(var(--theme-primary-rgb),.35); }.canvas-list button>svg { width: 15px; color: var(--theme-primary); }.canvas-list button>span { min-width: 0; display: grid; gap: 3px; }.canvas-list button>svg:last-child { width: 12px; color: var(--theme-text-secondary); }
.collection-list { display: grid; }.collection-list button { min-height: 48px; display: grid; grid-template-columns: 22px minmax(0,1fr) 16px; align-items: center; gap: 8px; padding: 5px 7px 5px 0; border: 0; border-top: var(--theme-border); color: var(--theme-text); background: transparent; cursor: pointer; text-align: left; }.collection-list button:hover { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.045); }.collection-list button>svg { width: 14px; color: var(--theme-primary); }.collection-list button>svg:last-child { width: 12px; color: var(--theme-text-secondary); }.collection-list button>span { min-width: 0; display: grid; gap: 3px; }.collection-list strong,.collection-list small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.collection-list strong { font-size: var(--text-compact); }.collection-list small { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.empty-line { min-height: 68px; display: grid; place-items: center; color: var(--theme-text-secondary); border-top: var(--theme-border); font-size: var(--text-compact); }.workspace-empty { flex: 1; display: grid; place-content: center; justify-items: center; gap: 8px; }.workspace-empty h1 { margin: 4px 0 0; font-size: 22px; }.workspace-empty p { margin: 0 0 10px; color: var(--theme-text-secondary); font-size: var(--text-compact); }.workspace-empty button { height: 34px; display: flex; align-items: center; gap: 7px; padding: 0 12px; border: 0; border-radius: 6px; color: var(--workspace-on-accent); background: var(--theme-primary); cursor: pointer; }.workspace-empty button svg { width: 14px; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) { .workspace-grid { grid-template-columns: 1fr; }.health-section { grid-row: auto; }.metric-strip { grid-template-columns: repeat(3,1fr); }.metric-strip button:nth-child(3) { border-right: 0; }.workspace-nav button span { display: none; }.workspace-identity { align-items: flex-start; flex-direction: column; }.workspace-signals { justify-content: flex-start; }.workspace-identity p { max-width: 80vw; } }
@media (max-width: 560px) { .metric-strip { grid-template-columns: repeat(2,1fr); }.metric-strip button { border-right: var(--theme-border) !important; }.metric-strip button:nth-child(2n) { border-right: 0 !important; }.canvas-list,.pulse-isolation>div:last-child { grid-template-columns: 1fr; }.workspace-nav { gap: 1px; }.workspace-nav button { padding: 0 7px; }.workspace-identity h1 { font-size: 21px; } }
</style>
