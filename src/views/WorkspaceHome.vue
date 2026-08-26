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

    <WorkspaceManagementContent v-if="store.libraryPath" class="workspace-content" data-testid="m2a2-workspace-primary" :data-primary-state="loading ? 'loading' : 'ready'">
      <section class="workspace-identity">
        <div>
          <span class="section-kicker">当前工作区</span>
          <h1>{{ store.currentLibraryName }}</h1>
          <p :title="store.libraryPath">{{ store.libraryPath }}</p>
        </div>
        <div class="workspace-meta">
          <div class="workspace-quick-actions">
            <n-dropdown trigger="manual" scrollable :show="workspaceCreateMenuOpen" :options="workspaceCreateOptions" :menu-props="workspaceCreateMenuProps" @clickoutside="workspaceCreateMenuOpen = false" @select="createWorkspaceFile">
              <button data-testid="m2-closure-create" class="quick-command" aria-haspopup="menu" :aria-expanded="workspaceCreateMenuOpen" @click="workspaceCreateMenuOpen = !workspaceCreateMenuOpen" @keydown.enter.prevent="workspaceCreateMenuOpen = true" @keydown.space.prevent="workspaceCreateMenuOpen = true" @keydown.escape="workspaceCreateMenuOpen = false"><PlusIcon />新建</button>
            </n-dropdown>
            <button data-testid="m2-closure-open" class="quick-command" @click="openLibrary" @keydown.enter.prevent="openLibrary" @keydown.space.prevent="openLibrary"><OpenIcon />打开文件</button>
          </div>
          <div class="workspace-signals">
            <span :class="`signal index-${indexStatus.state}`"><DatabaseIcon />{{ indexLabel }}</span>
            <span class="signal"><ClockIcon />{{ refreshedLabel }}</span>
          </div>
        </div>
      </section>

      <WorkspaceStateNotice v-if="loading" class="workspace-loading" kind="loading" tone="info" compact data-testid="m2-closure-loading" title="正在准备工作台"><span>正在读取最近文件和待办，完成后会自动更新。</span></WorkspaceStateNotice>
      <WorkspaceStateNotice v-if="error" class="workspace-alert" kind="error" tone="danger" compact><template #icon><AlertIcon /></template><span>{{ error }}</span><template #action><button @click="loadWorkspace">重试</button></template></WorkspaceStateNotice>

      <WorkspaceEmptyState v-if="!loading && !error && overview.totalFiles === 0" as="section" class="configured-empty" data-testid="m2-closure-empty">
        <FileIcon />
        <h2>这个资料库还是空的</h2>
        <p>新建一个文件，或回到资料库打开已有内容。</p>
        <div><button @click="createWorkspaceFile('markdown')"><PlusIcon />新建 Markdown</button><button class="secondary" @click="router.push({ name: 'LibraryMode' })"><OpenIcon />打开文件</button></div>
      </WorkspaceEmptyState>

      <div v-else class="workspace-grid">
        <section class="workspace-section activity-section">
          <div class="section-heading"><div><span class="section-kicker">最近活动</span><h2>继续工作</h2></div><button class="text-command" @click="router.push({ name: 'LibraryMode' })">浏览文件</button></div>
          <div v-if="continueGroups.length" class="continue-groups" data-testid="m2a3-continue-work">
            <section v-for="group in continueGroups" :key="group.id" class="continue-group" :data-group="group.id">
              <div class="list-label"><component :is="group.icon" />{{ group.label }}<span>{{ group.items.length }}</span></div>
              <div class="file-list">
                <div v-for="item in group.items" :key="item.path" class="file-row" :data-file-path="pathIdentity(item.path)">
                  <button class="file-open" @click="openPath(item.path)">
                    <span class="file-icon"><component :is="iconForPath(item.path)" /></span>
                    <span class="file-copy"><strong>{{ displayName(item.path, item.title) }}</strong><small>{{ relativeLabel(item.path) }}<template v-if="item.modifiedAt"> · {{ relativeTime(item.modifiedAt) }}</template></small></span>
                    <span class="file-action"><ArrowIcon /></span>
                  </button>
                  <RelationSummaryBadge v-if="relationSummary(item.path)" :summary="relationSummary(item.path)!" compact @open="openRelationGraph(item.path)" />
                </div>
              </div>
            </section>
          </div>
          <div v-else class="empty-line">打开或收藏文件后，可从这里继续工作</div>
        </section>

        <section class="workspace-section task-section" data-testid="m2a1-task-section">
          <div class="section-heading"><div><span class="section-kicker">今天要做</span><h2>待办</h2></div><span class="section-count">{{ overview.tasks.length }} 未完成</span></div>
          <div class="task-filters" data-testid="m2a3-task-filters">
            <WorkspaceSegmentedControl class="task-status" aria-label="待办状态">
              <button v-for="option in taskStatusOptions" :key="option.value" :class="{ active: taskStatusFilter === option.value }" @click="taskStatusFilter = option.value">{{ option.label }}</button>
            </WorkspaceSegmentedControl>
            <select v-model="taskSourceFilter" aria-label="按文件筛选待办"><option value="all">全部文件</option><option v-for="source in taskSources" :key="source.path" :value="source.path">{{ source.title }}</option></select>
            <select v-model="taskPriorityFilter" aria-label="按优先级筛选待办"><option value="all">全部优先级</option><option value="high">高优先级</option><option value="medium">中优先级</option><option value="normal">普通</option><option value="low">低优先级</option></select>
            <select v-model="taskDateFilter" aria-label="按日期筛选待办"><option value="all">全部日期</option><option value="overdue">已逾期</option><option value="today">今天</option><option value="upcoming">之后</option><option value="none">无日期</option></select>
          </div>
          <WorkspaceStateNotice v-if="taskUndo" class="task-undo" kind="saved" tone="success" compact data-testid="m2a1-task-undo-notice">
            <template #icon><CheckIcon /></template>
            <span>已完成“{{ taskUndo.text }}”</span>
            <template #action><button data-testid="m2a1-task-undo" :disabled="taskMutating" @click="undoCompletedTask"><UndoIcon />撤销</button></template>
          </WorkspaceStateNotice>
          <div v-if="filteredTasks.length" class="task-list" data-testid="m2a3-task-results">
            <div v-for="task in filteredTasks" :key="`${task.path}:${task.line}`" class="task-row" :class="{ completed: task.completed }" :data-task-priority="task.priority" :data-task-date="dateBucket(task)">
              <button class="task-complete" :class="{ checked: task.completed }" :data-testid="task.completed ? 'm2a3-task-restore' : 'm2a1-task-complete'" :disabled="taskMutating" :title="task.completed ? `恢复待办：${taskDisplayText(task.text)}` : `完成待办：${taskDisplayText(task.text)}`" @click="changeTaskState(task, !task.completed)"><span class="task-check"><CheckIcon v-if="task.completed" /></span></button>
              <button class="task-open" @click="openTask(task)">
                <span><strong>{{ taskDisplayText(task.text) }}</strong><small>{{ task.relativePath }} · 第 {{ task.line }} 行<template v-if="task.dueDate"> · {{ task.dueDate }}</template></small></span>
                <em :class="`priority-${task.priority}`">{{ priorityLabel(task.priority) }}</em>
                <ArrowIcon />
              </button>
            </div>
          </div>
          <div v-else class="empty-line">{{ allTasks.length ? '没有符合当前筛选的待办' : '当前资料库没有待办' }}</div>
        </section>

        <section class="workspace-section collection-section">
          <div class="section-heading"><div><span class="section-kicker">快捷视图</span><h2>保存视图</h2></div><button class="text-command" @click="router.push({ name: 'LibraryMode', query: { panel: 'collections' } })">管理视图</button></div>
          <div v-if="savedSearches.length" class="collection-list">
            <button v-for="search in savedSearches" :key="search.id" @click="openSavedSearch(search)">
              <CollectionIcon />
              <span><strong>{{ search.name }}</strong><small>{{ search.graphRoot ? `${search.graphDepth || 1} 层动态子图` : search.objectTypes.length ? search.objectTypes.map(formatLabel).join(' · ') : '全部格式' }}</small></span>
              <ArrowIcon />
            </button>
          </div>
          <div v-else class="empty-line">暂无保存视图</div>
        </section>

        <section class="workspace-section governance-section">
          <WorkspaceHealthQueue
            :report="workspaceHealth"
            :graph-health="health"
            :index-status="indexStatus"
            :loading="analysisLoading"
            :error="workspaceHealthError"
            @open-file="openPath"
            @open-annotation="openAnnotation"
            @open-graph="router.push({ name: 'Graph', query: { focus: 'overview' } })"
            @prepare-index="prepareWorkspaceSearch(store.libraryPath)"
            @retry="loadSecondaryAnalysis(store.libraryPath)"
          />
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
import { useDialog, useMessage } from 'naive-ui'
import {
  AlertTriangle as AlertIcon, ArrowRight as ArrowIcon,
  Clock3 as ClockIcon, Database as DatabaseIcon, FileSpreadsheet as TableIcon,
  FileText as FileIcon, LayoutDashboard as CanvasIcon, Network as NetworkIcon,
  ListFilter as CollectionIcon, RefreshCw as RefreshIcon, Settings as SettingsIcon,
  Star as StarIcon, Workflow as DiagramIcon, CircleCheck as CheckIcon, Undo2 as UndoIcon,
  History as HistoryIcon, Plus as PlusIcon, FolderOpen as OpenIcon,
} from 'lucide-vue-next'
import { useAppStore, type SavedSearchConfig } from '../store/app'
import { CREATABLE_FILE_FORMATS, fileDisplayName, findFileFormat, findFileFormatById, opensInLibraryShell, routeForFile } from '../config/fileFormats'
import { openManagedFile } from '../services/fileNavigation'
import RelationSummaryBadge, { type GraphRelationSummary } from '../components/RelationSummaryBadge.vue'
import WorkspaceHealthQueue, { type WorkspaceAnnotationIssue, type WorkspaceGraphHealth, type WorkspaceHealthReport, type WorkspaceIndexStatus } from '../components/WorkspaceHealthQueue.vue'
import WorkspaceEmptyState from '../components/workspace/WorkspaceEmptyState.vue'
import WorkspaceManagementContent from '../components/workspace/WorkspaceManagementContent.vue'
import WorkspaceManagementHeader from '../components/workspace/WorkspaceManagementHeader.vue'
import WorkspaceSegmentedControl from '../components/workspace/WorkspaceSegmentedControl.vue'
import WorkspaceStateNotice from '../components/workspace/WorkspaceStateNotice.vue'
import { confirmAppAction } from '../services/appDialog'

interface WorkspaceTask { title: string; path: string; relativePath: string; line: number; text: string; signature: string; completed: boolean; priority: 'high' | 'medium' | 'normal' | 'low'; dueDate?: string | null }
interface WorkspaceTaskMutationResult { path: string; line: number; text: string; completed: boolean; signature: string }
interface WorkspaceFile { title: string; path: string; relativePath: string; objectType: string; modifiedAt: number; size: number }
interface WorkspaceOverview { totalFiles: number; tasks: WorkspaceTask[]; completedTasks: WorkspaceTask[]; recentFiles: WorkspaceFile[]; canvases: WorkspaceFile[]; formatCounts: { objectType: string; count: number }[] }
interface ContinueItem { title?: string; path: string; modifiedAt?: number }
const router = useRouter()
const store = useAppStore()
const dialog = useDialog()
const message = useMessage()
const loading = ref(false)
const analysisLoading = ref(false)
const error = ref('')
const workspaceHealthError = ref('')
const refreshedAt = ref(0)
const overview = ref<WorkspaceOverview>({ totalFiles: 0, tasks: [], completedTasks: [], recentFiles: [], canvases: [], formatCounts: [] })
const health = ref<WorkspaceGraphHealth>({ brokenLinks: [], ambiguousLinks: [], orphanNotes: [], scannedNotes: 0 })
const indexStatus = ref<WorkspaceIndexStatus>({ state: 'missing', objectCount: 0, relationCount: 0 })
const indexAutoPreparing = ref(false)
const workspaceHealth = ref<WorkspaceHealthReport>({ duplicateGroups: [], unreferencedAnnotations: [], scannedFiles: 0, hashedFiles: 0, scannedAnnotations: 0, truncated: false })
const relationSummaries = ref<Record<string, GraphRelationSummary>>({})
const taskMutating = ref(false)
const taskUndo = ref<WorkspaceTaskMutationResult | null>(null)
const taskStatusFilter = ref<'open' | 'completed' | 'all'>('open')
const taskSourceFilter = ref('all')
const taskPriorityFilter = ref('all')
const taskDateFilter = ref('all')
const workspaceCreateMenuOpen = ref(false)
let loadGeneration = 0

const createOption = (id: string) => {
  const format = findFileFormatById(id)
  return format ? { label: `${format.label}（${format.creation?.defaultExtension}）`, key: format.id } : null
}
const createGroup = (label: string, key: string, ids: string[]) => ({ label, key, children: ids.map(createOption).filter(Boolean) })
const workspaceCreateOptions = [
  createOption('markdown'),
  createOption('plain-text'),
  createOption('canvas'),
  { type: 'divider', key: 'create-divider' },
  createGroup('数据与结构', 'group-data', ['json', 'jsonc', 'yaml', 'xml', 'toml', 'table']),
  createGroup('更多图表', 'group-visual', ['drawio', 'diagram', 'opml', 'svg']),
].filter(Boolean)
const workspaceCreateMenuProps = () => ({ class: 'workspace-create-menu', style: 'max-height: min(460px, calc(100vh - 24px)); min-width: 190px;' })
const createWorkspaceFile = async (formatId: string) => {
  workspaceCreateMenuOpen.value = false
  const format = CREATABLE_FILE_FORMATS.find(item => item.id === formatId)
  if (!format?.creation || !format.adapters.creator || !store.libraryPath) return
  try {
    const path = format.adapters.creator === 'table'
      ? await invoke<string>('create_table_file', { libraryRoot: store.libraryPath, targetDir: store.libraryPath })
      : await invoke<string>('create_format_file', { libraryRoot: store.libraryPath, targetDir: store.libraryPath, formatId })
    await loadWorkspace()
    openPath(path)
  } catch (cause) {
    message.error(`创建失败：${String(cause).replace(/^Error:\s*/, '')}`)
  }
}
const openLibrary = () => router.push({ name: 'LibraryMode' })

const indexLabel = computed(() => ({
  missing: '搜索与关联：准备中',
  building: '搜索与关联：正在准备',
  ready: '搜索与关联：可用',
  stale: '搜索与关联：需要更新',
  corrupt: '搜索与关联：需要处理',
  error: '搜索与关联：需要处理',
  cancelled: '搜索与关联：已停止',
}[indexStatus.value.state]))
const refreshedLabel = computed(() => refreshedAt.value ? new Date(refreshedAt.value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '尚未刷新')
const pathIdentity = (path: string) => path.replace(/^\\\\\?\\/, '').replace(/\\/g, '/').toLocaleLowerCase()
const displayPath = (path: string) => path.replace(/^\\\\\?\\/, '')
const inCurrentLibrary = (path: string) => {
  const root = pathIdentity(store.libraryPath)
  const candidate = pathIdentity(path)
  return Boolean(root && (candidate === root || candidate.startsWith(`${root}/`)))
}
const continueGroups = computed(() => {
  const used = new Set<string>()
  const overviewByPath = new Map([...overview.value.recentFiles, ...overview.value.canvases].map(item => [pathIdentity(item.path), item]))
  const takeUnique = (items: ContinueItem[], limit: number) => {
    const result: ContinueItem[] = []
    for (const item of items) {
      if (result.length >= limit) break
      const identity = pathIdentity(item.path)
      if (!inCurrentLibrary(item.path) || used.has(identity)) continue
      used.add(identity)
      result.push(item)
    }
    return result
  }
  const pinned = takeUnique(store.starredFiles.map(path => ({ ...overviewByPath.get(pathIdentity(path)), path, title: overviewByPath.get(pathIdentity(path))?.title || fileDisplayName(path) })), 6)
  const recentCandidates = [...store.recentFiles, ...overview.value.recentFiles]
    .map(item => ({ ...overviewByPath.get(pathIdentity(item.path)), ...item }))
    .filter(item => findFileFormat(item.path)?.id !== 'canvas')
  const recent = takeUnique(recentCandidates, 8)
  const canvases = takeUnique(overview.value.canvases, 4)
  return [
    { id: 'pinned', label: '固定', icon: StarIcon, items: pinned },
    { id: 'recent', label: '最近', icon: HistoryIcon, items: recent },
    { id: 'project-canvas', label: '项目画布', icon: CanvasIcon, items: canvases },
  ].filter(group => group.items.length)
})
const continueItems = computed(() => continueGroups.value.flatMap(group => group.items))
const relativeTime = (modifiedAt: number) => {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - modifiedAt)
  if (seconds < 60) return '刚刚更新'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} 天前`
  return new Date(modifiedAt * 1000).toLocaleDateString()
}
const taskStatusOptions = [
  { value: 'open' as const, label: '未完成' },
  { value: 'completed' as const, label: '已完成' },
  { value: 'all' as const, label: '全部' },
]
const allTasks = computed(() => [...overview.value.tasks, ...overview.value.completedTasks])
const taskSources = computed(() => [...new Map(allTasks.value.map(task => [pathIdentity(task.path), { path: task.path, title: task.title }])).values()])
const todayKey = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}
const dateBucket = (task: WorkspaceTask) => !task.dueDate ? 'none' : task.dueDate < todayKey() ? 'overdue' : task.dueDate === todayKey() ? 'today' : 'upcoming'
const filteredTasks = computed(() => allTasks.value.filter(task => (
  (taskStatusFilter.value === 'all' || (taskStatusFilter.value === 'completed') === task.completed)
  && (taskSourceFilter.value === 'all' || pathIdentity(task.path) === pathIdentity(taskSourceFilter.value))
  && (taskPriorityFilter.value === 'all' || task.priority === taskPriorityFilter.value)
  && (taskDateFilter.value === 'all' || dateBucket(task) === taskDateFilter.value)
)))
const priorityLabel = (priority: WorkspaceTask['priority']) => ({ high: '高', medium: '中', normal: '普通', low: '低' })[priority]
const taskDisplayText = (text: string) => text
  .replace(/(?:^|\s)!(?:high|medium|low)(?=\s|$)/gi, ' ')
  .replace(/(?:^|\s)#(?:高|中|低)优先级(?=\s|$)/g, ' ')
  .replace(/(?:^|\s)@due\(\d{4}-\d{2}-\d{2}\)(?=\s|$)/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim()
const savedSearches = computed(() => store.savedSearches
  .filter(search => search.libraryPath === store.libraryPath)
  .sort((left, right) => right.createdAt - left.createdAt)
  .slice(0, 6))

const formatLabels: Record<string, string> = { markdown: 'MD', canvas: 'Canvas', pdf: 'PDF', table: 'Table', workbook: 'XLSX', diagram: 'Mermaid', opml: 'OPML', 'plain-text': 'TXT' }
const formatIcons: Record<string, typeof FileIcon> = { table: TableIcon, workbook: TableIcon, canvas: CanvasIcon, diagram: DiagramIcon }
const formatLabel = (id: string) => formatLabels[id] || id
const displayName = (path: string, fallback?: string) => fileDisplayName(path) || fallback || path.split(/[\\/]/).pop() || path
const relativeLabel = (path: string) => {
  const visible = displayPath(path)
  return visible.replace(displayPath(store.libraryPath), '').replace(/^[\\/]+/, '') || visible
}
const iconForPath = (path: string) => formatIcons[findFileFormat(path)?.id || ''] || FileIcon
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
const loadRelationSummaries = async (libraryRoot = store.libraryPath, generation = loadGeneration) => {
  const paths = [...new Set(continueItems.value.map(item => item.path))].slice(0, 100)
  if (!libraryRoot || !paths.length) {
    relationSummaries.value = {}
    return
  }
  try {
    const summaries = await invoke<GraphRelationSummary[]>('summarize_graph_relations', {
      libraryRoot,
      paths,
    })
    if (generation === loadGeneration && store.libraryPath === libraryRoot) relationSummaries.value = Object.fromEntries(summaries.map(summary => [summary.path, summary]))
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
const openTask = (task: WorkspaceTask) => openManagedFile(router, task.path, {
  taskLine: String(task.line),
  taskLocator: `${Date.now()}-${task.line}`,
})
const updateTaskState = (task: WorkspaceTask | WorkspaceTaskMutationResult, completed: boolean) => invoke<WorkspaceTaskMutationResult>('set_workspace_markdown_task_state', {
  libraryRoot: store.libraryPath,
  mutation: {
    path: task.path,
    line: task.line,
    text: task.text,
    completed,
    expectedSignature: task.signature,
  },
})
const changeTaskState = async (task: WorkspaceTask, completed: boolean) => {
  if (taskMutating.value || !await confirmAppAction(dialog, {
    title: completed ? '完成这个待办？' : '恢复这个待办？',
    content: completed
      ? `将把“${taskDisplayText(task.text)}”写回 ${task.relativePath} 第 ${task.line} 行。完成后可在工作台撤销。`
      : `将把“${taskDisplayText(task.text)}”恢复为未完成，并写回 ${task.relativePath} 第 ${task.line} 行。`,
    positiveText: completed ? '完成待办' : '恢复待办',
  })) return
  taskMutating.value = true
  try {
    const result = await updateTaskState(task, completed)
    taskUndo.value = completed ? result : null
    await loadWorkspace()
    message.success(completed ? '待办已完成并写回原文' : '待办已恢复为未完成')
  } catch (cause) {
    message.error(String(cause).replace(/^Error:\s*/, ''))
    await loadWorkspace()
  } finally {
    taskMutating.value = false
  }
}
const undoCompletedTask = async () => {
  if (!taskUndo.value || taskMutating.value) return
  taskMutating.value = true
  try {
    await updateTaskState(taskUndo.value, false)
    taskUndo.value = null
    await loadWorkspace()
    message.success('已恢复未完成状态')
  } catch (cause) {
    message.error(String(cause).replace(/^Error:\s*/, ''))
    await loadWorkspace()
  } finally {
    taskMutating.value = false
  }
}

const openAnnotation = (issue: WorkspaceAnnotationIssue) => openManagedFile(
  router,
  issue.pdfPath,
  { page: String(issue.page), annotation: issue.annotationId },
)

const loadSecondaryAnalysis = async (libraryRoot: string, generation = loadGeneration) => {
  if (!libraryRoot) return
  analysisLoading.value = true
  workspaceHealthError.value = ''
  const [healthResult, workspaceHealthResult] = await Promise.allSettled([
    invoke<WorkspaceGraphHealth>('analyze_graph_health', { libraryRoot }),
    invoke<WorkspaceHealthReport>('analyze_workspace_health', { libraryRoot }),
  ])
  if (generation !== loadGeneration || store.libraryPath !== libraryRoot) return
  if (healthResult.status === 'fulfilled') health.value = healthResult.value
  if (workspaceHealthResult.status === 'fulfilled') workspaceHealth.value = workspaceHealthResult.value
  const failures = [
    healthResult.status === 'rejected' ? `关系检查失败：${String(healthResult.reason)}` : '',
    workspaceHealthResult.status === 'rejected' ? `资料检查失败：${String(workspaceHealthResult.reason)}` : '',
  ].filter(Boolean)
  workspaceHealthError.value = failures.join('；')
  analysisLoading.value = false
  void loadRelationSummaries(libraryRoot, generation)
}

const loadWorkspace = async () => {
  if (!store.libraryPath || loading.value) return
  const libraryRoot = store.libraryPath
  const generation = ++loadGeneration
  loading.value = true
  analysisLoading.value = true
  error.value = ''
  workspaceHealthError.value = ''
  const [overviewResult, indexResult] = await Promise.allSettled([
    invoke<WorkspaceOverview>('get_workspace_overview', { libraryRoot }),
    invoke<WorkspaceIndexStatus>('get_knowledge_index_status', { libraryRoot }),
  ])
  if (generation !== loadGeneration || store.libraryPath !== libraryRoot) return
  if (overviewResult.status === 'fulfilled') overview.value = overviewResult.value
  else error.value = `工作台概览不可用：${String(overviewResult.reason)}`
  if (indexResult.status === 'fulfilled') {
    indexStatus.value = indexResult.value
    if (indexResult.value.state === 'missing' || indexResult.value.state === 'stale') {
      void prepareWorkspaceSearch(libraryRoot)
    }
  }
  refreshedAt.value = Date.now()
  loading.value = false
  void loadSecondaryAnalysis(libraryRoot, generation)
}

const prepareWorkspaceSearch = async (libraryRoot: string) => {
  if (!libraryRoot || indexAutoPreparing.value) return
  indexAutoPreparing.value = true
  indexStatus.value = { ...indexStatus.value, state: 'building' }
  try {
    const status = await invoke<WorkspaceIndexStatus>('rebuild_knowledge_index', { libraryRoot })
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
.workspace-identity { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 19px; border-bottom: 2px solid var(--theme-text); }.workspace-identity h1 { margin: 4px 0 3px; font-size: 25px; line-height: 1.15; letter-spacing: 0; }.workspace-identity p { max-width: min(620px,60vw); margin: 0; overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.workspace-meta { min-width: 0; display: grid; justify-items: end; gap: 7px; }.workspace-quick-actions,.configured-empty>div { display: flex; gap: 6px; flex-wrap: wrap; }.quick-command { min-height: 31px; display: inline-flex; align-items: center; gap: 6px; padding: 0 9px; border: var(--theme-border); border-radius: 5px; color: var(--theme-text); background: var(--theme-surface); cursor: pointer; font-size: var(--text-compact); }.quick-command:hover { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb),.35); }.quick-command svg { width: 14px; }
.section-kicker { color: var(--theme-primary); font-size: var(--text-compact); font-weight: 800; }.workspace-signals { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }.signal { height: 27px; display: flex; align-items: center; gap: 5px; padding: 0 8px; border: var(--theme-border); border-radius: 5px; color: var(--theme-text-secondary); background: var(--theme-surface); font-size: var(--text-compact); }.signal svg { width: 13px; }.signal.index-ready { color: var(--status-success); }.signal.index-stale,.signal.index-corrupt,.signal.index-error { color: var(--status-warning); }
.workspace-loading,.workspace-alert { min-height: 38px; margin-top: 10px; border-radius: 5px; }.workspace-alert { color: var(--status-danger); border-color: var(--status-danger-border); background: var(--status-danger-bg); }.workspace-alert svg { width: 14px; }.workspace-alert button,.text-command { border: 0; color: var(--theme-primary); background: transparent; cursor: pointer; font-size: var(--text-compact); }.configured-empty { min-height: 360px; border-bottom: var(--theme-border); }.configured-empty>svg { width: 30px; color: var(--theme-primary); }.configured-empty h2 { margin: 5px 0 0; font-size: 18px; }.configured-empty p { margin: 0 0 8px; color: var(--theme-text-secondary); font-size: var(--text-compact); }.configured-empty button { min-height: 33px; display: inline-flex; align-items: center; gap: 6px; padding: 0 11px; border: 1px solid var(--theme-primary); border-radius: 5px; color: var(--workspace-on-accent); background: var(--theme-primary); cursor: pointer; }.configured-empty button.secondary { color: var(--theme-primary); background: transparent; }.configured-empty button svg { width: 14px; }
.workspace-grid { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(280px,.8fr); column-gap: 32px; }.workspace-section { min-width: 0; padding: 25px 0 28px; border-bottom: var(--theme-border); }.governance-section { grid-column: 1 / -1; }.section-heading { min-height: 35px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }.section-heading h2 { margin: 3px 0 0; font-size: 14px; letter-spacing: 0; }.section-count { min-width: 24px; text-align: right; color: var(--theme-text-secondary); font-size: 11px; }
.list-label { margin: 9px 0 5px; color: var(--theme-text-secondary); font-size: var(--text-compact); font-weight: 700; }.list-label:first-of-type { margin-top: 0; }.list-label svg { width: 13px; }.list-label span { margin-left: auto; font-weight: 500; }.continue-groups { display: grid; gap: 11px; }.continue-group>.list-label { display: flex; align-items: center; gap: 6px; }.file-list,.task-list { display: grid; }.file-row { min-height: 51px; display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 8px; padding-right: 8px; border-top: var(--theme-border); }.file-row:hover { background: rgba(var(--theme-primary-rgb),.045); }.file-open { min-width: 0; min-height: 50px; display: grid; grid-template-columns: 28px minmax(0,1fr) 18px; align-items: center; gap: 10px; padding: 6px 0; border: 0; color: var(--theme-text); background: transparent; cursor: pointer; text-align: left; }.file-icon { width: 26px; height: 26px; display: grid; place-items: center; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.08); border-radius: 5px; }.file-icon svg,.file-action svg { width: 13px; }.file-copy { min-width: 0; display: grid; gap: 3px; }.file-copy strong,.task-list strong,.canvas-list strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.file-copy small,.task-list small,.canvas-list small { overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.file-action { color: var(--theme-text-secondary); }
.health-grid { display: grid; grid-template-columns: repeat(3,1fr); border-top: var(--theme-border); border-bottom: var(--theme-border); }.health-grid button { min-height: 65px; display: grid; align-content: center; gap: 4px; border: 0; border-right: var(--theme-border); color: var(--theme-text); background: transparent; cursor: pointer; text-align: center; }.health-grid button:last-child { border-right: 0; }.health-grid span { color: var(--theme-text-secondary); font-size: var(--text-compact); }.health-grid strong { font-size: 17px; }.index-line { min-height: 54px; display: grid; grid-template-columns: 22px minmax(0,1fr) 24px; align-items: center; gap: 8px; border-bottom: var(--theme-border); }.index-line>svg { width: 16px; color: var(--theme-primary); }.index-line>div { display: grid; gap: 2px; }.index-line strong { font-size: var(--text-compact); }.index-line small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.index-line button { border: 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; }.index-line button svg { width: 13px; }.format-line { display: flex; flex-wrap: wrap; gap: 5px; padding-top: 10px; }.format-line span { display: flex; align-items: center; gap: 5px; padding: 4px 6px; border: var(--theme-border); border-radius: 4px; font-size: var(--text-compact); }.format-line i { color: var(--theme-text-secondary); font-style: normal; }.format-line b { font-weight: 700; }
.knowledge-pulse { display: grid; gap: 8px; padding: 12px 0; border-bottom: var(--theme-border); }.pulse-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }.pulse-heading>div { display: flex; align-items: baseline; gap: 6px; }.pulse-heading span,.pulse-heading small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.pulse-heading strong { color: var(--theme-primary); font-size: 16px; }.pulse-track { height: 5px; overflow: hidden; border-radius: 999px; background: rgba(var(--theme-primary-rgb),.09); }.pulse-track i { display: block; height: 100%; border-radius: inherit; background: var(--theme-primary); transition: width .25s ease; }.pulse-types,.pulse-nodes { display: flex; flex-wrap: wrap; gap: 5px; }.pulse-types span { padding: 3px 5px; border-radius: 4px; color: var(--theme-text-secondary); background: rgba(var(--theme-primary-rgb),.055); font-size: var(--text-compact); }.pulse-types b { color: var(--theme-text); }.pulse-nodes button { max-width: 150px; display: inline-flex; align-items: center; gap: 5px; padding: 4px 6px; border: 1px solid rgba(var(--theme-primary-rgb),.16); border-radius: 999px; color: var(--theme-primary); background: transparent; cursor: pointer; font-size: var(--text-compact); }.pulse-nodes button:hover { background: rgba(var(--theme-primary-rgb),.07); }.pulse-nodes span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.pulse-nodes b { min-width: 14px; color: var(--theme-text-secondary); }.pulse-empty { min-height: 30px; padding: 0 8px; border: 1px dashed rgba(var(--theme-primary-rgb),.24); border-radius: 5px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.035); cursor: pointer; font-size: var(--text-compact); }.pulse-guidance { min-height: 42px; display: grid; grid-template-columns: minmax(0,1fr) 16px; align-items: center; gap: 8px; padding: 7px 8px; border: 1px solid rgba(var(--theme-primary-rgb),.18); border-radius: 5px; color: var(--theme-text); background: rgba(var(--theme-primary-rgb),.045); cursor: pointer; text-align: left; }.pulse-guidance:hover { border-color: rgba(var(--theme-primary-rgb),.35); }.pulse-guidance>span { min-width: 0; display: grid; gap: 2px; }.pulse-guidance b { font-size: var(--text-compact); }.pulse-guidance small { overflow: hidden; color: var(--theme-text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.pulse-guidance svg { width: 13px; color: var(--theme-primary); }.pulse-observation-action { justify-self: end; min-height: 26px; padding: 0 8px; border: 1px solid rgba(var(--theme-primary-rgb),.18); border-radius: 5px; color: var(--theme-primary); background: transparent; cursor: pointer; font-size: var(--text-compact); font-weight: 650; }.pulse-observation-action:hover { background: rgba(var(--theme-primary-rgb),.06); }
.pulse-isolation { display: grid; gap: 5px; padding: 7px 8px; border: 1px solid var(--status-warning-border); border-radius: 5px; background: var(--status-warning-bg); }.pulse-isolation>div:first-child { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }.pulse-isolation>div:first-child span { color: var(--status-warning); font-size: var(--text-compact); font-weight: 750; }.pulse-isolation>div:first-child small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.pulse-isolation>div:last-child { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 4px; }.pulse-isolation button { min-width: 0; min-height: 27px; display: grid; grid-template-columns: minmax(0,1fr) auto 12px; align-items: center; gap: 5px; padding: 3px 5px; border: 1px solid var(--status-warning-border); border-radius: 4px; color: var(--theme-text); background: var(--theme-surface); cursor: pointer; text-align: left; }.pulse-isolation button:hover { border-color: var(--status-warning); background: var(--status-warning-bg); }.pulse-isolation button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }.pulse-isolation button small { color: var(--theme-text-secondary); font-size: var(--text-compact); }.pulse-isolation button svg { width: 10px; color: var(--status-warning); }
.task-filters { display: grid; grid-template-columns: minmax(180px,auto) repeat(3,minmax(0,1fr)); gap: 6px; margin-bottom: 9px; }.task-status { min-width: 180px; }.task-filters select { min-width: 0; height: 31px; padding: 0 25px 0 8px; border: var(--theme-border); border-radius: 5px; color: var(--theme-text); background-color: var(--theme-surface); font-size: var(--text-compact); }.task-undo { margin-bottom: 8px; border-radius: 5px; }.task-undo button { display: inline-flex; align-items: center; gap: 5px; border: 0; color: var(--status-success); background: transparent; cursor: pointer; font-weight: 700; }.task-undo button svg { width: 13px; }.task-row { min-height: 48px; display: grid; grid-template-columns: 30px minmax(0,1fr); align-items: stretch; border-top: var(--theme-border); }.task-row:hover { background: rgba(var(--theme-primary-rgb),.045); }.task-row.completed { opacity: .72; }.task-row.completed strong { text-decoration: line-through; }.task-complete,.task-open { border: 0; color: var(--theme-text); background: transparent; cursor: pointer; }.task-complete { display: grid; place-items: center; }.task-complete:hover .task-check { border-color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.12); }.task-complete:disabled { cursor: wait; opacity: .45; }.task-open { min-width: 0; display: grid; grid-template-columns: minmax(0,1fr) auto 16px; align-items: center; gap: 9px; padding: 5px 8px 5px 0; text-align: left; }.task-open>span { min-width: 0; display: grid; gap: 3px; }.task-open svg { width: 13px; color: var(--theme-text-secondary); }.task-open em { min-width: 24px; padding: 2px 5px; border-radius: 4px; color: var(--theme-text-secondary); background: rgba(var(--theme-primary-rgb),.06); font-size: var(--text-compact); font-style: normal; text-align: center; }.task-open em.priority-high { color: var(--status-danger); background: var(--status-danger-bg); }.task-open em.priority-medium { color: var(--status-warning); background: var(--status-warning-bg); }.task-open em.priority-low { color: var(--theme-primary); }.task-check { width: 14px; height: 14px; display: grid; place-items: center; border: 1px solid var(--theme-text-secondary); border-radius: 3px; transition: .15s ease; }.task-check svg { width: 10px; }.task-complete.checked .task-check { border-color: var(--status-success); color: var(--workspace-on-accent); background: var(--status-success); }
.canvas-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px; }.canvas-list button { min-height: 58px; display: grid; grid-template-columns: 24px minmax(0,1fr) 16px; align-items: center; gap: 8px; padding: 8px; border: var(--theme-border); border-radius: 6px; color: var(--theme-text); background: var(--theme-surface); cursor: pointer; text-align: left; }.canvas-list button:hover { border-color: rgba(var(--theme-primary-rgb),.35); }.canvas-list button>svg { width: 15px; color: var(--theme-primary); }.canvas-list button>span { min-width: 0; display: grid; gap: 3px; }.canvas-list button>svg:last-child { width: 12px; color: var(--theme-text-secondary); }
.collection-list { display: grid; }.collection-list button { min-height: 48px; display: grid; grid-template-columns: 22px minmax(0,1fr) 16px; align-items: center; gap: 8px; padding: 5px 7px 5px 0; border: 0; border-top: var(--theme-border); color: var(--theme-text); background: transparent; cursor: pointer; text-align: left; }.collection-list button:hover { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.045); }.collection-list button>svg { width: 14px; color: var(--theme-primary); }.collection-list button>svg:last-child { width: 12px; color: var(--theme-text-secondary); }.collection-list button>span { min-width: 0; display: grid; gap: 3px; }.collection-list strong,.collection-list small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.collection-list strong { font-size: var(--text-compact); }.collection-list small { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.empty-line { min-height: 68px; display: grid; place-items: center; color: var(--theme-text-secondary); border-top: var(--theme-border); font-size: var(--text-compact); }.workspace-empty { flex: 1; display: grid; place-content: center; justify-items: center; gap: 8px; }.workspace-empty h1 { margin: 4px 0 0; font-size: 22px; }.workspace-empty p { margin: 0 0 10px; color: var(--theme-text-secondary); font-size: var(--text-compact); }.workspace-empty button { height: 34px; display: flex; align-items: center; gap: 7px; padding: 0 12px; border: 0; border-radius: 6px; color: var(--workspace-on-accent); background: var(--theme-primary); cursor: pointer; }.workspace-empty button svg { width: 14px; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) { .workspace-grid { grid-template-columns: 1fr; }.health-section { grid-row: auto; }.workspace-nav button span { display: none; }.workspace-identity { align-items: flex-start; flex-direction: column; }.workspace-meta { justify-items: start; }.workspace-signals { justify-content: flex-start; }.workspace-identity p { max-width: 80vw; } }
@media (max-width: 700px) { .task-filters { grid-template-columns: repeat(2,minmax(0,1fr)); }.task-status { min-width: 0; grid-column: 1 / -1; } }
@media (max-width: 560px) { .canvas-list,.pulse-isolation>div:last-child { grid-template-columns: 1fr; }.workspace-nav { gap: 1px; }.workspace-nav button { padding: 0 7px; }.workspace-identity h1 { font-size: 21px; }.task-filters { grid-template-columns: 1fr; }.task-status { grid-column: auto; }.task-open { grid-template-columns: minmax(0,1fr) auto 14px; } }
</style>
